const express = require('express');
const pool = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { createNotifications } = require('../controllers/notificationController');
const { getDeptHeadEvaluationTracking, getDeptHeadPendingEvaluators, sendDeptHeadEvaluationReminder } = require('../controllers/trackingController');
const { getInstructorOverallPerformance, calculateWeightedPerformance } = require('../services/evaluationMetrics');
const { calculateAndSaveInstructorResult, getInstructorRoleStatus } = require('../utils/evaluationCalculator');
const { computeEvaluation } = require('../utils/calculateEvaluationScores');
const { getDeptHeadAiInsights } = require('../controllers/aiInsightsController');

const router = express.Router();

router.get('/ai-insights', authenticateToken, authorizeRoles('dept_head'), getDeptHeadAiInsights);
router.get('/evaluation-tracking', authenticateToken, authorizeRoles('dept_head'), getDeptHeadEvaluationTracking);
router.get('/evaluation-tracking/pending', authenticateToken, authorizeRoles('dept_head'), getDeptHeadPendingEvaluators);
router.get('/evaluation-breakdown/:instructorId', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = getDepartmentId(req);
  const instructorId = Number(req.params?.instructorId || 0);
  if (!departmentId) return res.status(403).json({ message: 'Your department is not defined.' });
  if (!Number.isInteger(instructorId) || instructorId <= 0) return res.status(400).json({ message: 'A valid instructorId is required.' });

  try {
    const targetTable = 'instructors';
    const [[target]] = await pool.query(
      `SELECT id, TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS name
       FROM ${targetTable}
       WHERE id = ? AND department_id = ? LIMIT 1`,
      [instructorId, departmentId]
    );
    if (!target) return res.status(404).json({ message: 'Instructor not found in your department.' });

    const [studentRows] = await pool.query(`
      SELECT DISTINCT
        s.id AS student_db_id,
        s.student_id,
        TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS student_name,
        c.code AS course_code,
        c.name AS course_name,
        TRIM(CONCAT(COALESCE(target_i.first_name, ''), ' ', COALESCE(target_i.last_name, ''))) AS target_instructor_name,
        CASE WHEN EXISTS (
          SELECT 1
          FROM student_evaluation_submissions ses
          WHERE ses.student_id = s.id
            AND ses.dispatch_id = ed.id
            AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
        ) THEN 'Completed' ELSE 'Pending' END AS status,
        ca.id AS assignment_id,
        ed.id AS dispatch_id
      FROM course_assignments ca
      INNER JOIN students s ON s.id = ca.student_id
      LEFT JOIN evaluation_dispatches ed
        ON ed.assignment_id = ca.id
       AND ed.student_id = s.id
       AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
      LEFT JOIN courses c ON c.id = ca.course_id
      LEFT JOIN instructors target_i ON target_i.id = ca.instructor_id
      WHERE ca.instructor_id = ?
        AND ca.student_id IS NOT NULL
        AND LOWER(COALESCE(ca.status, 'assigned')) <> 'cancelled'
      ORDER BY student_name ASC, c.code ASC
    `, [instructorId]);

    const [peerRows] = await pool.query(`
      SELECT DISTINCT
        evaluator.id AS evaluator_id,
        evaluator.user_id,
        TRIM(CONCAT(COALESCE(evaluator.first_name, ''), ' ', COALESCE(evaluator.last_name, ''))) AS peer_name,
        COALESCE(NULLIF(evaluator.employee_id, ''), evaluator.user_id) AS staff_id,
        c.code AS course_code,
        TRIM(CONCAT(COALESCE(target_i.first_name, ''), ' ', COALESCE(target_i.last_name, ''))) AS target_instructor_name,
        CASE WHEN EXISTS (
          SELECT 1 FROM peer_evaluation_submissions pes
          WHERE pes.peer_evaluation_id = pe.id
            AND LOWER(COALESCE(pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
        ) THEN 'Completed' ELSE 'Pending' END AS status,
        pe.id AS peer_id
      FROM peer_evaluations pe
      INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
      LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
      LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
      LEFT JOIN courses c ON c.id = ca.course_id
      LEFT JOIN instructors target_i ON target_i.id = pe.evaluatee_id
      WHERE pe.evaluatee_id = ?
        AND evaluator.department_id = ?
      ORDER BY peer_name ASC, c.code ASC
    `, [instructorId, departmentId]);

    const pendingStudentRows = studentRows.filter((row) => String(row.status || '').toLowerCase() !== 'completed');
    const pendingPeerRows = peerRows.filter((row) => String(row.status || '').toLowerCase() !== 'completed');

    return res.json({
      instructorId,
      instructorName: target.name,
      totalAssignedStudents: studentRows.length,
      pendingStudentsCount: pendingStudentRows.length,
      totalAssignedPeers: peerRows.length,
      pendingPeersCount: pendingPeerRows.length,
      students: studentRows,
      peers: peerRows,
      summary: {
        totalPending: pendingStudentRows.length + pendingPeerRows.length,
        totalAssigned: studentRows.length + peerRows.length,
      },
    });
  } catch (error) {
    console.error('Department-head evaluation breakdown failed:', error);
    return res.status(500).json({ message: 'Unable to load evaluation breakdown.', error: error.message });
  }
});
router.post('/send-evaluation-reminder', authenticateToken, authorizeRoles('dept_head'), sendDeptHeadEvaluationReminder);
router.get('/pending-students', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = getDepartmentId(req);
  if (!departmentId) return res.status(403).json({ message: 'Your department is not defined.' });
  try {
    const [studentRows] = await pool.query(`
      SELECT DISTINCT s.id, s.user_id AS evaluator_id, TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS name,
        s.student_id, ed.course_name, ed.deadline, 'student' AS type,
        ed.id AS dispatch_id, ed.assignment_id AS assignment_id,
        CONVERT('pending student evaluation', CHAR) AS item_type
      FROM students s
      JOIN evaluation_dispatches ed ON ed.student_id = s.id
      LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      WHERE s.department_id = ?
        AND LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active', 'published')
        AND (ses.id IS NULL OR LOWER(COALESCE(ses.status, 'pending')) NOT IN ('submitted', 'completed', 'approved'))
      ORDER BY name ASC`, [departmentId]);

    const [peerRows] = await pool.query(`
      SELECT DISTINCT pe.id, pe.evaluator_id AS evaluator_id,
        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(evaluator.first_name, ''), ' ', COALESCE(evaluator.last_name, ''))), ''), u.email) AS name,
        u.email, pe.dispatch_id, 'peer' AS type,
        'pending peer evaluation' AS item_type,
        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(target_i.first_name, ''), ' ', COALESCE(target_i.last_name, ''))), ''), target_u.email) AS target_name
      FROM peer_evaluations pe
      INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
      INNER JOIN users u ON u.id = evaluator.user_id
      INNER JOIN instructors target_i ON target_i.id = pe.evaluatee_id
      INNER JOIN users target_u ON target_u.id = target_i.user_id
      LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
      WHERE evaluator.department_id = ?
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
        AND (pes.id IS NULL OR LOWER(COALESCE(pes.status, 'pending')) NOT IN ('submitted', 'completed', 'approved'))
      ORDER BY name ASC`, [departmentId]);

    return res.json([...studentRows, ...peerRows]);
  } catch (error) {
    console.error('Pending students query failed:', error);
    return res.status(500).json({ message: 'Unable to load pending students.' });
  }
});

const getDepartmentId = (req) => {
  const rawDepartmentId = req.user?.department_id ?? req.user?.departmentId ?? req.user?.department ?? req.query?.department_id ?? req.query?.department ?? req.body?.department_id ?? req.body?.department;
  const departmentId = Number(rawDepartmentId);
  return Number.isFinite(departmentId) && departmentId > 0 ? departmentId : null;
};

router.get('/course-assignments', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = Number(req.user?.department_id ?? req.user?.departmentId ?? req.user?.department ?? 0);
  const requestedDepartmentId = Number(req.query.department_id || 0);
  if (!departmentId) return res.status(403).json({ success: false, message: 'Your department is not defined.' });
  if (requestedDepartmentId && requestedDepartmentId !== departmentId) {
    return res.status(403).json({ success: false, message: 'You can only view assignments in your department.' });
  }

  const { year_level: yearLevel, semester, section, staff_type: staffType } = req.query;
  const params = [departmentId];
  let filters = '';
  if (yearLevel) { filters += ' AND ca.year_level = ?'; params.push(yearLevel); }
  if (semester) { filters += ' AND ca.semester = ?'; params.push(semester); }
  if (section) { filters += ' AND ca.section = ?'; params.push(section); }
  if (staffType && String(staffType).toLowerCase() !== 'all') {
    if (!['instructor', 'lab_assistant'].includes(String(staffType).toLowerCase())) {
      return res.status(400).json({ success: false, message: 'staff_type must be instructor, lab_assistant, or all.' });
    }
    filters += ` AND CASE WHEN la.id IS NOT NULL OR LOWER(COALESCE(ca.assigned_role, '')) = 'lab_assistant' THEN 'lab_assistant' ELSE 'instructor' END = ?`;
    params.push(String(staffType).toLowerCase());
  }

  try {
    const [assignments] = await pool.query(`
      SELECT
        ca.id AS assignment_id,
        ca.course_id,
        COALESCE(i.id, ca.instructor_id) AS instructor_id,
        COALESCE(la.id, ca.lab_assistant_id) AS lab_assistant_id,
        COALESCE(la.id, i.id, ca.staff_id, ca.instructor_id) AS staff_id,
        ca.academic_year,
        ca.year_level,
        ca.semester,
        ca.section,
        ca.program_type,
        c.name AS course_name,
        c.code AS course_code,
        TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS staff_name,
        CASE WHEN la.id IS NOT NULL OR LOWER(COALESCE(ca.assigned_role, '')) = 'lab_assistant' THEN 'lab_assistant' ELSE COALESCE(NULLIF(LOWER(ca.assigned_role), ''), LOWER(u.role), 'instructor') END AS staff_role,
        u.email AS staff_email
      FROM course_assignments ca
      INNER JOIN courses c ON c.id = ca.course_id
      LEFT JOIN instructors i ON i.id = COALESCE(ca.instructor_id, CASE WHEN LOWER(COALESCE(ca.assigned_role, 'instructor')) <> 'lab_assistant' THEN ca.staff_id END)
      LEFT JOIN lab_assistants la ON la.id = COALESCE(ca.lab_assistant_id, CASE WHEN LOWER(COALESCE(ca.assigned_role, '')) = 'lab_assistant' THEN ca.staff_id END)
      LEFT JOIN users u ON u.id = COALESCE(i.user_id, la.user_id, ca.instructor_id, ca.staff_id)
      WHERE ca.department_id = ?${filters}
      ORDER BY ca.year_level ASC, ca.section ASC, c.name ASC
    `, params);
    return res.status(200).json({ success: true, data: assignments });
  } catch (error) {
    console.error('Error fetching department course assignments:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching assignments.' });
  }
});

router.put('/course-assignments/:assignmentId', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = Number(req.user?.department_id ?? req.user?.departmentId ?? req.user?.department ?? 0);
  const assignmentId = Number(req.params.assignmentId);
  const { staff_id: staffIdValue, staff_type: staffTypeValue, academic_year: academicYearValue, year_level: yearLevelValue, semester: semesterValue, section: sectionValue, program_type: programTypeValue } = req.body || {};
  const staffId = Number(staffIdValue);
  const staffType = String(staffTypeValue || '').trim().toLowerCase();
  const academicYear = String(academicYearValue || '').trim();
  const yearLevel = String(yearLevelValue || '').trim();
  const semester = String(semesterValue || '').trim();
  const section = String(sectionValue || '').trim();
  const programType = String(programTypeValue || '').trim();

  if (!departmentId) return res.status(403).json({ success: false, message: 'Your department is not defined.' });
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) return res.status(400).json({ success: false, message: 'A valid assignment ID is required.' });
  if (!Number.isInteger(staffId) || staffId <= 0 || !['instructor', 'lab_assistant'].includes(staffType) || !academicYear || !yearLevel || !semester || !section || !programType) {
    return res.status(400).json({ success: false, message: 'Staff, academic year, year level, semester, section, and program type are required.' });
  }

  try {
    const [[assignment]] = await pool.query(
      'SELECT id, course_id FROM course_assignments WHERE id = ? AND department_id = ? LIMIT 1',
      [assignmentId, departmentId]
    );
    if (!assignment) return res.status(404).json({ success: false, message: 'Course assignment not found in your department.' });

    const staffQuery = staffType === 'lab_assistant'
      ? `SELECT la.id FROM lab_assistants la INNER JOIN users u ON u.id = la.user_id
         WHERE la.id = ? AND la.department_id = ? AND LOWER(COALESCE(u.role, 'lab_assistant')) = 'lab_assistant'
           AND LOWER(COALESCE(u.status, 'active')) = 'active' LIMIT 1`
      : `SELECT i.id FROM instructors i INNER JOIN users u ON u.id = i.user_id
         WHERE i.id = ? AND i.department_id = ? AND LOWER(COALESCE(u.role, 'instructor')) IN ('instructor', 'dept_head', 'department_head')
           AND LOWER(COALESCE(u.status, 'active')) = 'active' LIMIT 1`;
    const [[staff]] = await pool.query(staffQuery, [staffId, departmentId]);
    if (!staff) return res.status(400).json({ success: false, message: 'Selected staff member is not active in your department.' });

    const [[duplicate]] = await pool.query(
      `SELECT id FROM course_assignments
       WHERE id <> ? AND department_id = ? AND course_id = ? AND academic_year = ?
         AND semester = ? AND year_level = ? AND section = ? AND program_type = ? LIMIT 1`,
      [assignmentId, departmentId, assignment.course_id, academicYear, semester, yearLevel, section, programType]
    );
    if (duplicate) return res.status(409).json({ success: false, message: 'Another assignment already exists for this course, year, semester, section, and program.' });

    await pool.query(
      `UPDATE course_assignments
       SET instructor_id = ?, lab_assistant_id = ?, staff_id = ?, assigned_role = ?, academic_year = ?,
           year_level = ?, semester = ?, section = ?, program_type = ?
       WHERE id = ? AND department_id = ?`,
      [staffType === 'instructor' ? staff.id : null, staffType === 'lab_assistant' ? staff.id : null, staff.id, staffType, academicYear, yearLevel, semester, section, programType, assignmentId, departmentId]
    );
    return res.json({ success: true, message: 'Course assignment updated.' });
  } catch (error) {
    console.error('Error updating department course assignment:', error);
    return res.status(500).json({ success: false, message: 'Server error updating assignment.' });
  }
});

router.get('/evaluation-deadline', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = getDepartmentId(req);
  if (!departmentId) return res.status(403).json({ message: 'Your department is not defined.' });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS evaluation_deadline_settings (department_id INT UNSIGNED PRIMARY KEY, deadline_at DATETIME NULL, auto_lock TINYINT(1) NOT NULL DEFAULT 1, updated_by INT UNSIGNED NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
    const [[settings]] = await pool.query('SELECT department_id, deadline_at, auto_lock, updated_at FROM evaluation_deadline_settings WHERE department_id = ?', [departmentId]);
    let dispatch = null;
    if (!settings?.deadline_at) {
      [[dispatch]] = await pool.query(`
      SELECT deadline FROM evaluation_dispatches
      WHERE department_id = ? AND deadline IS NOT NULL
        AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'active', 'published')
      ORDER BY id DESC LIMIT 1`, [departmentId]);
    }
    return res.json({
      deadlineAt: settings?.deadline_at || dispatch?.deadline || null,
      autoLock: settings ? settings.auto_lock !== 0 : true,
      updatedAt: settings?.updated_at || null,
    });
  } catch (error) {
    console.error('Evaluation deadline settings fetch failed:', error);
    return res.status(500).json({ message: 'Unable to load evaluation deadline settings.' });
  }
});

router.put('/evaluation-deadline', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = getDepartmentId(req);
  const deadlineAt = req.body?.deadlineAt || req.body?.deadline_at || null;
  const autoLock = req.body?.autoLock !== false;
  if (!departmentId) return res.status(403).json({ message: 'Your department is not defined.' });
  if (deadlineAt) {
    const parsedDeadline = new Date(deadlineAt);
    if (Number.isNaN(parsedDeadline.getTime())) return res.status(400).json({ message: 'A valid deadline is required.' });
    if (parsedDeadline.getTime() <= Date.now()) return res.status(400).json({ message: 'The evaluation deadline must be in the future.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`CREATE TABLE IF NOT EXISTS evaluation_deadline_settings (department_id INT UNSIGNED PRIMARY KEY, deadline_at DATETIME NULL, auto_lock TINYINT(1) NOT NULL DEFAULT 1, updated_by INT UNSIGNED NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
    await connection.query(`CREATE TABLE IF NOT EXISTS evaluation_deadline_history (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, department_id INT UNSIGNED NOT NULL, deadline_at DATETIME NULL, auto_lock TINYINT(1) NOT NULL DEFAULT 1, changed_by INT UNSIGNED NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    await connection.query(`INSERT INTO evaluation_deadline_settings (department_id, deadline_at, auto_lock, updated_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE deadline_at = VALUES(deadline_at), auto_lock = VALUES(auto_lock), updated_by = VALUES(updated_by)`, [departmentId, deadlineAt ? new Date(deadlineAt) : null, autoLock ? 1 : 0, req.user.id]);
    await connection.query('INSERT INTO evaluation_deadline_history (department_id, deadline_at, auto_lock, changed_by) VALUES (?, ?, ?, ?)', [departmentId, deadlineAt ? new Date(deadlineAt) : null, autoLock ? 1 : 0, req.user.id]);
    if (deadlineAt) {
      await connection.query(`UPDATE evaluation_dispatches SET deadline = ? WHERE department_id = ? AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'active', 'published')`, [new Date(deadlineAt), departmentId]);
      await connection.query(`UPDATE peer_evaluations pe INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id SET pe.deadline = ? WHERE ed.department_id = ? AND LOWER(COALESCE(pe.status, 'pending')) IN ('pending', 'active')`, [new Date(deadlineAt), departmentId]);
    }
    await connection.commit();

    if (deadlineAt) {
      try {
        const [students] = await pool.query(`SELECT DISTINCT s.user_id FROM students s INNER JOIN evaluation_dispatches ed ON ed.student_id = s.id LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id WHERE s.department_id = ? AND LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active', 'published') AND (ses.id IS NULL OR LOWER(COALESCE(ses.status, 'pending')) NOT IN ('submitted', 'completed', 'approved'))`, [departmentId]);
        const [peers] = await pool.query(`SELECT DISTINCT pe.evaluator_id AS user_id FROM peer_evaluations pe INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id WHERE ed.department_id = ? AND LOWER(COALESCE(pe.status, 'pending')) IN ('pending', 'active') AND (pes.id IS NULL OR LOWER(COALESCE(pes.status, 'pending')) NOT IN ('submitted', 'completed', 'approved'))`, [departmentId]);
        const userIds = [...new Set([...students, ...peers].map((row) => row.user_id).filter(Boolean))];
        if (userIds.length) await createNotifications({ userIds, title: 'Evaluation Deadline Extended', message: `Evaluation deadline extended to ${new Date(deadlineAt).toLocaleString('en-US')}.`, type: 'evaluation_deadline' });
      } catch (notificationError) {
        console.error('Evaluation deadline saved, but pending evaluators could not be notified:', notificationError);
      }
    }
    return res.json({ success: true, deadlineAt, autoLock, message: 'Evaluation deadline updated.' });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Deadline rollback failed:', rollbackError); }
    console.error('Evaluation deadline update failed:', error);
    return res.status(500).json({ message: 'Unable to update evaluation deadline.' });
  } finally { connection.release(); }
});

router.get('/overview-stats', authenticateToken, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  const departmentId = getDepartmentId(req);
  if (!Number.isInteger(departmentId) || departmentId <= 0) return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });

  try {
    const [[stats]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM instructors i INNER JOIN users u ON u.id = i.user_id WHERE i.department_id = ? AND LOWER(COALESCE(u.status, 'active')) = 'active' AND LOWER(u.role) = 'instructor') AS totalInstructors,
        (SELECT COUNT(*) FROM students s INNER JOIN users u ON u.id = s.user_id WHERE s.department_id = ? AND LOWER(COALESCE(u.status, 'active')) = 'active') AS totalStudents,
        (SELECT COUNT(*) FROM courses WHERE department_id = ?) AS totalCourses,
        (SELECT COUNT(*) FROM lab_assistants la INNER JOIN users u ON u.id = la.user_id WHERE la.department_id = ? AND LOWER(COALESCE(u.status, 'active')) = 'active' AND LOWER(u.role) = 'lab_assistant') AS totalLabAssistants,
        (SELECT COUNT(*) FROM course_assignments WHERE department_id = ? AND LOWER(COALESCE(status, 'assigned')) NOT IN ('cancelled', 'inactive')) AS activeAssignments
    `, [departmentId, departmentId, departmentId, departmentId, departmentId]);
    return res.json(Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, Number(value || 0)])));
  } catch (error) {
    console.error('Department-head overview stats error:', error);
    return res.status(500).json({ message: 'Unable to load department overview statistics.' });
  }
});

router.get('/lab-assistants', authenticateToken, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  const departmentId = getDepartmentId(req);
  if (!Number.isInteger(departmentId) || departmentId <= 0) return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });

  try {
    const [rows] = await pool.query(`
      SELECT
        la.id,
        la.first_name,
        la.last_name,
        la.email,
        la.employee_id,
        la.gender,
        COALESCE(la.status, 'active') AS status,
        d.name AS department_name
      FROM lab_assistants la
      JOIN departments d ON la.department_id = d.id
      WHERE la.department_id = ?
      ORDER BY la.first_name ASC, la.last_name ASC
    `, [departmentId]);

    return res.json(rows);
  } catch (error) {
    console.error('Department lab assistants query failed:', error);
    return res.status(500).json({ message: 'Unable to load lab assistants.' });
  }
});

router.post('/publish-peer-evaluation', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = Number(req.user?.department_id);
  if (!Number.isInteger(departmentId) || departmentId <= 0) return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
  const academicYear = String(req.body?.academic_year || new Date().getFullYear());
  const semester = String(req.body?.semester || 'Semester I');
  const yearLevel = String(req.body?.year_level || 'ALL');
  const deadline = req.body?.deadline || null;
  const courseId = Number(req.body?.course_id || 0) || null;
  const courseCode = String(req.body?.course_code || '').trim() || null;
  const courseName = String(req.body?.course_name || '').trim() || null;
  const requestedStaffType = String(req.body?.staff_type || 'instructor').trim().toLowerCase();
  const staffType = ['instructor', 'lab_assistant', 'all'].includes(requestedStaffType) ? requestedStaffType : 'instructor';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[existingPublication]] = await connection.query(
      'SELECT started_at FROM peer_evaluation_publications WHERE department_id = ? AND academic_year = ? AND semester = ? FOR UPDATE',
      [departmentId, academicYear, semester]
    );
    await connection.query(`
      INSERT INTO peer_evaluation_publications (department_id, academic_year, semester, status, created_by, published_by, started_at)
      VALUES (?, ?, ?, 'published', ?, ?, ?)
      ON DUPLICATE KEY UPDATE status = 'published', created_by = VALUES(created_by), published_by = VALUES(published_by), updated_at = CURRENT_TIMESTAMP
    `, [departmentId, academicYear, semester, req.user.id, req.user.id, existingPublication?.started_at || null]);
    if (staffType !== 'lab_assistant') {
      const [[existingDispatch]] = await connection.query(
        `SELECT id FROM evaluation_dispatches WHERE department_id = ? AND academic_year = ? AND semester = ? AND evaluation_type = 'peer' ORDER BY id DESC LIMIT 1`,
        [departmentId, academicYear, semester]
      );
      if (existingDispatch) {
        await connection.query('UPDATE evaluation_dispatches SET status = \'active\', year_level = ?, student_group = \'ALL\', deadline = ?, created_by = ? WHERE id = ?', [yearLevel, deadline, req.user.id, existingDispatch.id]);
      } else {
        await connection.query(`
          INSERT INTO evaluation_dispatches (department_id, academic_year, semester, year_level, student_group, evaluation_type, deadline, created_by, status, payload)
          VALUES (?, ?, ?, ?, 'ALL', 'peer', ?, ?, 'active', ?)
        `, [departmentId, academicYear, semester, yearLevel, deadline, req.user.id, JSON.stringify({ source: 'dept_head_publish_peer_evaluation', yearLevel })]);
      }
    }
    const [instructors] = await connection.query(`
      SELECT i.user_id FROM instructors i INNER JOIN users u ON u.id = i.user_id
      WHERE i.department_id = ? AND LOWER(u.role) = 'instructor' AND LOWER(COALESCE(u.status, 'active')) = 'active'
    `, [departmentId]);
    const [labAssistants] = staffType !== 'instructor' ? await connection.query(`
      SELECT la.id, la.user_id, la.first_name, la.last_name, la.employee_id
      FROM lab_assistants la INNER JOIN users u ON u.id = la.user_id
      WHERE la.department_id = ? AND LOWER(COALESCE(u.role, 'lab_assistant')) = 'lab_assistant'
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
    `, [departmentId]) : [[]];
    const [peerEvaluators] = staffType !== 'instructor' ? await connection.query(`
      SELECT DISTINCT u.id AS user_id
      FROM users u
      LEFT JOIN instructors i ON i.user_id = u.id
      LEFT JOIN lab_assistants la ON la.user_id = u.id
      WHERE LOWER(COALESCE(u.status, 'active')) = 'active'
        AND ((i.department_id = ? AND LOWER(u.role) IN ('instructor', 'dept_head', 'department_head'))
          OR (la.department_id = ? AND LOWER(u.role) = 'lab_assistant'))
    `, [departmentId, departmentId]) : [[]];
    for (const labAssistant of labAssistants) {
      for (const peer of peerEvaluators) {
        if (!peer.user_id || peer.user_id === labAssistant.user_id) continue;
        const [[existingLabPeer]] = await connection.query(
          `SELECT id FROM evaluation_dispatches
           WHERE department_id = ? AND target_type = 'lab_assistant' AND target_user_id = ?
             AND evaluation_type = 'lab_assistant_peer' AND academic_year = ? AND semester = ? AND created_by = ? LIMIT 1`,
          [departmentId, labAssistant.id, academicYear, semester, peer.user_id]
        );
        if (!existingLabPeer) {
          await connection.query(
            `INSERT INTO evaluation_dispatches (
              department_id, course_id, course_code, course_name, academic_year, semester, year_level, deadline,
              evaluation_type, evaluation_template, created_by, status,
              target_type, target_user_id, target_first_name, target_last_name, target_employee_id, payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'lab_assistant_peer', 'ARA_PEER_FORM', ?, 'pending', 'lab_assistant', ?, ?, ?, ?, ?)` ,
            [departmentId, courseId, courseCode, courseName, academicYear, semester, yearLevel, deadline, peer.user_id, labAssistant.id, labAssistant.first_name || '', labAssistant.last_name || '', labAssistant.employee_id || '', JSON.stringify({ source: 'dept_head_publish_lab_assistant_peer_evaluation', labAssistantId: labAssistant.id, courseId, courseCode, courseName, yearLevel })]
          );
        }
      }
    }
    await connection.commit();
    try {
      await createNotifications({
        userIds: staffType === 'lab_assistant' ? labAssistants.map((assistant) => assistant.user_id) : [...instructors.map((instructor) => instructor.user_id), ...labAssistants.map((assistant) => assistant.user_id)],
        title: 'Peer Evaluation Open',
        message: `Peer Evaluation is now open for ${academicYear} ${semester}.`,
        type: 'peer_evaluation',
      });
    } catch (notificationError) {
      console.error('Peer evaluation notification failed:', notificationError);
    }
    return res.status(201).json({ success: true, notified: staffType === 'lab_assistant' ? labAssistants.length : staffType === 'all' ? instructors.length + labAssistants.length : instructors.length, message: 'Peer Evaluation published successfully.' });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Peer publication rollback failed:', rollbackError); }
    console.error('Department-head peer publication failed:', error);
    return res.status(500).json({ message: 'Unable to publish Peer Evaluation.' });
  } finally {
    connection.release();
  }
});

router.post('/publish-lab-assistant-evaluation', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = Number(req.user?.department_id);
  if (!Number.isInteger(departmentId) || departmentId <= 0) return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
  
  const academicYear = String(req.body?.academic_year || new Date().getFullYear());
  const semester = String(req.body?.semester || 'Semester I');
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Get all active lab assistants in the department
    const [labAssistants] = await connection.query(`
      SELECT la.id, la.user_id, la.employee_id, la.first_name, la.last_name
      FROM lab_assistants la
      INNER JOIN users u ON u.id = la.user_id
      WHERE la.department_id = ?
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
        AND LOWER(u.role) = 'lab_assistant'
    `, [departmentId]);

    if (!labAssistants.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'No active lab assistants found in this department.' });
    }

    // Get all students in the department for ARA_STUDENT_FORM
    const [students] = await connection.query(`
      SELECT DISTINCT s.id, s.user_id
      FROM students s
      WHERE s.department_id = ?
        AND LOWER(COALESCE(s.user_id, 'active')) <> ''
    `, [departmentId]);

    // Get all department staff (instructors, dept heads) for ARA_PEER_FORM
    const [peerEvaluators] = await connection.query(`
      SELECT DISTINCT u.id AS user_id
      FROM users u
      LEFT JOIN instructors i ON i.user_id = u.id
      LEFT JOIN lab_assistants la ON la.user_id = u.id
      WHERE LOWER(COALESCE(u.status, 'active')) = 'active'
        AND (
          (LOWER(u.role) = 'instructor' AND i.department_id = ?)
          OR (LOWER(u.role) = 'dept_head' AND i.department_id = ?)
          OR (LOWER(u.role) = 'lab_assistant' AND la.department_id = ?)
        )
    `, [departmentId, departmentId, departmentId]);

    const notificationUserIds = new Set();

    // For each lab assistant, create ARA_STUDENT_FORM and ARA_PEER_FORM dispatches
    for (const labAssistant of labAssistants) {
      // ARA_STUDENT_FORM: Each student evaluates the lab assistant (17 items)
      for (const student of students) {
        if (student.user_id) notificationUserIds.add(student.user_id);
        
        // Check if dispatch already exists
        const [[existingDispatch]] = await connection.query(`
          SELECT id FROM evaluation_dispatches
          WHERE target_type = 'lab_assistant' 
            AND target_user_id = ?
            AND student_id = ?
            AND evaluation_template = 'ARA_STUDENT_FORM'
            AND academic_year = ?
            AND semester = ?
          LIMIT 1
        `, [labAssistant.id, student.id, academicYear, semester]);

        if (!existingDispatch) {
          await connection.query(`
            INSERT INTO evaluation_dispatches (
              target_type, target_user_id, target_first_name, target_last_name, target_employee_id,
              student_id, student_group, course_id, department_id, academic_year, semester,
              evaluation_template, evaluation_type, status, created_by, payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            'lab_assistant', labAssistant.id, labAssistant.first_name, labAssistant.last_name, labAssistant.employee_id,
            student.id, 'student', null, departmentId, academicYear, semester,
            'ARA_STUDENT_FORM', 'lab_assistant_student', 'pending', req.user.id, 
            JSON.stringify({ source: 'dept_head_publish_lab_assistant_evaluation', labAssistantId: labAssistant.id })
          ]);
        }
      }

      // ARA_PEER_FORM: Each peer evaluates the lab assistant (18 items)
      for (const peer of peerEvaluators) {
        if (peer.user_id && peer.user_id !== labAssistant.user_id) {
          // Check if dispatch already exists
          const [[existingPeerDispatch]] = await connection.query(`
            SELECT id FROM evaluation_dispatches
            WHERE target_type = 'lab_assistant'
              AND target_user_id = ?
              AND evaluation_template = 'ARA_PEER_FORM'
              AND academic_year = ?
              AND semester = ?
              AND created_by = ?
            LIMIT 1
          `, [labAssistant.id, academicYear, semester, peer.user_id]);

          if (!existingPeerDispatch) {
            await connection.query(`
              INSERT INTO evaluation_dispatches (
                target_type, target_user_id, target_first_name, target_last_name, target_employee_id,
                created_by, department_id, academic_year, semester,
                evaluation_template, evaluation_type, status, payload
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              'lab_assistant', labAssistant.id, labAssistant.first_name, labAssistant.last_name, labAssistant.employee_id,
              peer.user_id, departmentId, academicYear, semester,
              'ARA_PEER_FORM', 'lab_assistant_peer', 'pending',
              JSON.stringify({ source: 'dept_head_publish_lab_assistant_peer_evaluation', labAssistantId: labAssistant.id })
            ]);
          }
        }
      }

      // Notify lab assistant
      if (labAssistant.user_id) notificationUserIds.add(labAssistant.user_id);
    }

    await connection.commit();

    try {
      await createNotifications({
        userIds: [...notificationUserIds],
        title: 'Lab Assistant Evaluation Forms Published',
        message: `Lab Assistant evaluation forms are now available for ${academicYear} ${semester}.`,
        type: 'lab_assistant_evaluation_published',
      });
    } catch (notificationError) {
      console.error('Lab assistant evaluation notification failed:', notificationError);
    }

    return res.status(201).json({
      success: true,
      notified: notificationUserIds.size,
      message: `Published lab assistant evaluation forms for ${labAssistants.length} lab assistant(s).`,
    });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Lab assistant publication rollback failed:', rollbackError); }
    console.error('Department-head lab assistant publication failed:', error);
    return res.status(500).json({ message: 'Unable to publish Lab Assistant Evaluation forms.' });
  } finally {
    connection.release();
  }
});

router.get('/evaluatees', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = getDepartmentId(req);
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
  }

  try {
    const [rows] = await pool.query(`
      SELECT i.id, i.user_id, TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS full_name, 'instructor' AS role
      FROM instructors i
      INNER JOIN users u ON u.id = i.user_id
      WHERE i.department_id = ?
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
        AND EXISTS (
          SELECT 1
          FROM course_assignments ca
          WHERE ca.instructor_id = i.id
            AND LOWER(COALESCE(ca.status, 'assigned')) <> 'cancelled'
        )
      UNION ALL
      SELECT la.id, la.user_id, TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))) AS full_name, 'lab_assistant' AS role
      FROM lab_assistants la
      INNER JOIN users u ON u.id = la.user_id
      WHERE la.department_id = ?
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
      ORDER BY full_name ASC, role ASC
    `, [departmentId, departmentId]);

    return res.json(rows.map((row) => ({
      id: Number(row.id),
      user_id: row.user_id ? Number(row.user_id) : null,
      full_name: String(row.full_name || '').trim() || 'Unknown staff',
      role: row.role === 'lab_assistant' ? 'lab_assistant' : 'instructor',
    })));
  } catch (error) {
    console.error('Department evaluation targets query failed:', error);
    return res.status(500).json({ message: 'Unable to load evaluation targets.' });
  }
});

router.get('/evaluation-tracking', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = getDepartmentId(req);
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
  }

  const evaluateeId = Number(req.query.evaluatee_id ?? req.query.instructor_id ?? req.query.target_id ?? req.query.target_instructor_id ?? 0);
  const requestedRole = String(req.query.target_role || req.query.role || '').trim().toLowerCase();
  const targetRole = ['instructor', 'lab_assistant'].includes(requestedRole) ? requestedRole : null;
  const [[activePeriod]] = await pool.query(
    `SELECT academic_year, semester FROM evaluation_periods
     WHERE LOWER(status) = 'active' ORDER BY id DESC LIMIT 1`
  );
  const academicYear = String(req.query.academic_year || activePeriod?.academic_year || '').trim();
  const semester = String(req.query.semester || activePeriod?.semester || '').trim();

  const buildSummary = async (role, id) => {
    const toNumber = (value) => Number(value || 0);
    if (role === 'instructor') {
      const [[studentSummary]] = await pool.query(`
         SELECT AVG(CASE WHEN ses.id IS NOT NULL AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved', 'published') THEN ses.score END) AS student_average,
               COUNT(DISTINCT ed.id) AS total_evaluations,
           COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved', 'published') THEN ed.id END) AS completed_evaluations,
               COUNT(DISTINCT ses.id) AS submission_count
        FROM course_assignments ca
        LEFT JOIN evaluation_dispatches ed ON ed.assignment_id = ca.id
        LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
        WHERE ca.instructor_id = ?
          AND LOWER(COALESCE(ed.target_type, 'instructor')) = 'instructor'
          AND (? = '' OR LOWER(COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), ''), '')) = LOWER(?)
            OR LOWER(COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), ''), '')) = LOWER(SUBSTRING_INDEX(?, '/', 1)))
          AND (? = '' OR LOWER(REPLACE(COALESCE(NULLIF(TRIM(ed.semester), ''), NULLIF(TRIM(ca.semester), ''), ''), 'semester', '')) = LOWER(REPLACE(?, 'semester', '')))
      `, [id, academicYear, academicYear, academicYear, semester, semester]);
      const [[peerSummary]] = await pool.query(`
        SELECT AVG(pes.score) AS peer_average,
               COUNT(DISTINCT pe.id) AS total_evaluations,
               SUM(CASE WHEN LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved') THEN 1 ELSE 0 END) AS completed_evaluations
        FROM peer_evaluations pe
        LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
        WHERE pe.evaluatee_id = ?
      `, [id]);
      const [[deptHeadSummary]] = await pool.query(`
        SELECT AVG(dhe.total_score) AS dept_head_average,
               COUNT(*) AS total_evaluations,
               SUM(CASE WHEN LOWER(COALESCE(dhe.status, 'pending')) IN ('submitted', 'completed', 'approved') THEN 1 ELSE 0 END) AS completed_evaluations
        FROM dept_head_evaluations dhe
        WHERE dhe.instructor_id = ?
      `, [id]);

      const studentAverage = toNumber(studentSummary?.student_average);
      const peerAverage = toNumber(peerSummary?.peer_average);
      const deptHeadAverage = toNumber(deptHeadSummary?.dept_head_average);
      const assignmentStatus = await getInstructorRoleStatus(id, academicYear, semester);
      const hasAssignedCourse = assignmentStatus.isTeaching;
      const totalEvaluations = toNumber(studentSummary?.total_evaluations) + toNumber(peerSummary?.total_evaluations) + toNumber(deptHeadSummary?.total_evaluations);
      const completedEvaluations = toNumber(studentSummary?.completed_evaluations) + toNumber(peerSummary?.completed_evaluations) + toNumber(deptHeadSummary?.completed_evaluations);
      const normalizedPeer = peerAverage <= 30 ? (peerAverage / 30) * 100 : peerAverage;
      const normalizedDeptHead = deptHeadAverage <= 30 ? (deptHeadAverage / 30) * 100 : deptHeadAverage;
      const weighted = calculateWeightedPerformance({ student: studentAverage, deptHead: normalizedDeptHead, peer: normalizedPeer, hasAssignedCourse });
      const finalScore = weighted.totalWeightedScore;

      return {
        evaluatee_id: id,
        target_role: 'instructor',
        student_average: Number(studentAverage.toFixed(2)),
        raw_student_score: Number(studentAverage.toFixed(2)),
        submission_count: toNumber(studentSummary?.submission_count),
        student_weighted: weighted.studentWeighted,
        hasAssignedCourse,
        has_assigned_course: hasAssignedCourse,
        peer_average: Number(normalizedPeer.toFixed(2)),
        dept_head_average: Number(normalizedDeptHead.toFixed(2)),
        final_score: finalScore,
        total_evaluations: totalEvaluations,
        completed_evaluations: completedEvaluations,
        student_required: toNumber(studentSummary?.total_evaluations),
        student_completed: toNumber(studentSummary?.completed_evaluations),
        peer_required: toNumber(peerSummary?.total_evaluations),
        peer_completed: toNumber(peerSummary?.completed_evaluations),
        dept_head_required: toNumber(deptHeadSummary?.total_evaluations),
        dept_head_completed: toNumber(deptHeadSummary?.completed_evaluations),
        completion_rate: totalEvaluations ? Number(((completedEvaluations / totalEvaluations) * 100).toFixed(2)) : 0,
        status: totalEvaluations > 0 && completedEvaluations === totalEvaluations ? 'Completed' : 'Pending',
      };
    }

    const [[studentSummary]] = await pool.query(`
      SELECT AVG(ses.score) AS student_average,
             COUNT(DISTINCT ed.id) AS total_evaluations,
             SUM(CASE WHEN LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved') THEN 1 ELSE 0 END) AS completed_evaluations
      FROM evaluation_dispatches ed
      LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      WHERE ed.department_id = ? AND ed.target_type = 'lab_assistant' AND ed.target_user_id = ?
        AND (? = '' OR ed.academic_year = ?)
        AND (? = '' OR ed.semester = ?)
    `, [departmentId, id, academicYear, academicYear, semester, semester]);
    const [[peerSummary]] = await pool.query(`
      SELECT AVG(pes.score) AS peer_average,
             COUNT(DISTINCT pe.id) AS total_evaluations,
             SUM(CASE WHEN LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved') THEN 1 ELSE 0 END) AS completed_evaluations
      FROM evaluation_dispatches ed
      LEFT JOIN peer_evaluations pe ON pe.dispatch_id = ed.id
      LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
      WHERE ed.department_id = ? AND ed.target_type = 'lab_assistant' AND ed.target_user_id = ?
    `, [departmentId, id]);
    const [[deptHeadSummary]] = await pool.query(`
      SELECT AVG(dhe.total_score) AS dept_head_average,
             COUNT(*) AS total_evaluations,
             SUM(CASE WHEN LOWER(COALESCE(dhe.status, 'pending')) IN ('submitted', 'completed', 'approved') THEN 1 ELSE 0 END) AS completed_evaluations
      FROM dept_head_evaluations dhe
      WHERE dhe.department_id = ? AND dhe.instructor_id = ?
    `, [departmentId, id]);

    const studentAverage = toNumber(studentSummary?.student_average);
    const peerAverage = toNumber(peerSummary?.peer_average);
    const deptHeadAverage = toNumber(deptHeadSummary?.dept_head_average);
    const totalEvaluations = toNumber(studentSummary?.total_evaluations) + toNumber(peerSummary?.total_evaluations) + toNumber(deptHeadSummary?.total_evaluations);
    const completedEvaluations = toNumber(studentSummary?.completed_evaluations) + toNumber(peerSummary?.completed_evaluations) + toNumber(deptHeadSummary?.completed_evaluations);
    const normalizedPeer = peerAverage <= 30 ? (peerAverage / 30) * 100 : peerAverage;
    const normalizedDeptHead = deptHeadAverage <= 30 ? (deptHeadAverage / 30) * 100 : deptHeadAverage;
    const finalScore = Number((studentAverage * 0.5 + normalizedDeptHead * 0.3 + normalizedPeer * 0.2).toFixed(2));

    return {
      evaluatee_id: id,
      target_role: 'lab_assistant',
      student_average: Number(studentAverage.toFixed(2)),
      peer_average: Number(normalizedPeer.toFixed(2)),
      dept_head_average: Number(normalizedDeptHead.toFixed(2)),
      final_score: finalScore,
      total_evaluations: totalEvaluations,
      completed_evaluations: completedEvaluations,
      student_required: toNumber(studentSummary?.total_evaluations),
      student_completed: toNumber(studentSummary?.completed_evaluations),
      peer_required: toNumber(peerSummary?.total_evaluations),
      peer_completed: toNumber(peerSummary?.completed_evaluations),
      dept_head_required: toNumber(deptHeadSummary?.total_evaluations),
      dept_head_completed: toNumber(deptHeadSummary?.completed_evaluations),
      completion_rate: totalEvaluations ? Number(((completedEvaluations / totalEvaluations) * 100).toFixed(2)) : 0,
      status: totalEvaluations > 0 && completedEvaluations === totalEvaluations ? 'Completed' : 'Pending',
    };
  };

  try {
    let targets = [];
    if (evaluateeId > 0) {
      if (targetRole) {
        targets.push([targetRole, evaluateeId]);
      } else {
        const [[instructorMatch]] = await pool.query('SELECT id FROM instructors WHERE department_id = ? AND id = ? LIMIT 1', [departmentId, evaluateeId]);
        const [[labMatch]] = await pool.query('SELECT id FROM lab_assistants WHERE department_id = ? AND id = ? LIMIT 1', [departmentId, evaluateeId]);
        if (instructorMatch) targets.push(['instructor', evaluateeId]);
        if (labMatch) targets.push(['lab_assistant', evaluateeId]);
      }
    } else if (targetRole) {
      const tableName = targetRole === 'lab_assistant' ? 'lab_assistants' : 'instructors';
      const [rows] = await pool.query(`SELECT id FROM ${tableName} WHERE department_id = ? ORDER BY id ASC`, [departmentId]);
      targets = rows.map((row) => [targetRole, Number(row.id)]);
    } else {
      const [instructorRows] = await pool.query('SELECT id FROM instructors WHERE department_id = ? ORDER BY id ASC', [departmentId]);
      const [labRows] = await pool.query('SELECT id FROM lab_assistants WHERE department_id = ? ORDER BY id ASC', [departmentId]);
      targets = [
        ...instructorRows.map((row) => ['instructor', Number(row.id)]),
        ...labRows.map((row) => ['lab_assistant', Number(row.id)]),
      ];
    }

    const rows = [];
    for (const [role, id] of targets) {
      const queryTable = role === 'lab_assistant' ? 'lab_assistants' : 'instructors';
      const [targetRows] = await pool.query(`SELECT id, user_id, TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS full_name FROM ${queryTable} WHERE department_id = ? AND id = ? LIMIT 1`, [departmentId, id]);
      if (!targetRows.length) continue;
      const target = targetRows[0];
      const summary = await buildSummary(role, Number(target.id));
      rows.push({
        ...summary,
        instructor_id: Number(target.id),
        instructor_name: String(target.full_name || '').trim() || 'Unknown target',
        evaluatee_name: String(target.full_name || '').trim() || 'Unknown target',
      });
    }

    return res.json(rows);
  } catch (error) {
    console.error('Department evaluation tracking query failed:', error);
    return res.status(500).json({ message: 'Unable to load evaluation tracking results.' });
  }
});

router.get('/evaluation-tracking-results', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = Number(req.user?.department_id);
  if (!Number.isInteger(departmentId) || departmentId <= 0) return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
  const instructorId = Number(req.query.instructor_id);
  const yearLevel = String(req.query.year_level || '').trim();
  const section = String(req.query.section || '').trim();
  const programType = String(req.query.program_type || '').trim();
  try {
    const [[activePeriod]] = await pool.query(
      `SELECT academic_year, semester FROM evaluation_periods
       WHERE LOWER(status) = 'active' ORDER BY id DESC LIMIT 1`
    );
    const academicYear = String(req.query.academic_year || activePeriod?.academic_year || '').trim();
    const semester = String(req.query.semester || activePeriod?.semester || '').trim();
    const studentFilters = [];
    const studentParams = [];
    if (yearLevel && !/^all/i.test(yearLevel)) { studentFilters.push('LOWER(TRIM(s.year_level)) = LOWER(TRIM(?))'); studentParams.push(yearLevel.replace(/^\d+(st|nd|rd|th) Year \(/i, '').replace(/\)$/, '').trim()); }
    if (section && !/^all/i.test(section)) { studentFilters.push('LOWER(TRIM(REPLACE(s.section, \'Section \', \'\'))) = LOWER(TRIM(REPLACE(?, \'Section \', \'\')))'); studentParams.push(section); }
    if (programType && !/^all/i.test(programType)) { studentFilters.push('LOWER(TRIM(s.program_type)) = LOWER(TRIM(?))'); studentParams.push(programType); }
    const studentFilterSql = studentFilters.length ? ` AND ${studentFilters.join(' AND ')}` : '';
    const instructorFilterId = Number.isInteger(instructorId) && instructorId > 0 ? instructorId : null;
    const [rows] = await pool.query(`
      SELECT i.id AS instructor_id, TRIM(CONCAT(i.first_name, ' ', i.last_name)) AS instructor_name,
        COALESCE(st.student_average, 0) AS student_average, COALESCE(pe.peer_average, 0) AS peer_average, COALESCE(dh.dept_head_average, 0) AS dept_head_average,
        COALESCE(st.submission_count, 0) AS submission_count,
        COALESCE(st.student_total, 0) + COALESCE(pe.peer_total, 0) + COALESCE(dh.dept_head_total, 0) AS total_evaluations,
        COALESCE(st.student_completed, 0) + COALESCE(pe.peer_completed, 0) + COALESCE(dh.dept_head_completed, 0) AS completed_evaluations
      FROM instructors i INNER JOIN users u ON u.id = i.user_id
      LEFT JOIN (
        SELECT ca.instructor_id, AVG(ses.score) AS student_average, COUNT(DISTINCT ses.id) AS submission_count, COUNT(DISTINCT ed.id) AS student_total,
          COUNT(DISTINCT CASE WHEN LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved') THEN ed.id END) AS student_completed
        FROM evaluation_dispatches ed INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
        INNER JOIN students s ON s.id = ed.student_id INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
        WHERE LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
          AND LOWER(COALESCE(ed.target_type, 'instructor')) = 'instructor'${studentFilterSql}
          AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved')
          AND (? = '' OR COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), '')) IS NULL
            OR LOWER(COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), ''))) = LOWER(?)
            OR LOWER(COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), ''))) = LOWER(SUBSTRING_INDEX(?, '/', 1)))
          AND (? = '' OR COALESCE(NULLIF(TRIM(ed.semester), ''), NULLIF(TRIM(ca.semester), '')) IS NULL
            OR LOWER(REPLACE(COALESCE(NULLIF(TRIM(ed.semester), ''), NULLIF(TRIM(ca.semester), '')), 'semester', '')) = LOWER(REPLACE(?, 'semester', '')))
        GROUP BY ca.instructor_id
      ) st ON st.instructor_id = i.id
      LEFT JOIN (
        SELECT pe.evaluatee_id, AVG(pes.score) AS peer_average, COUNT(DISTINCT pe.id) AS peer_total,
          COUNT(DISTINCT CASE WHEN LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved') THEN pe.id END) AS peer_completed
        FROM peer_evaluations pe INNER JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
        INNER JOIN instructors target ON target.id = pe.evaluatee_id
        WHERE target.department_id = ? GROUP BY pe.evaluatee_id
      ) pe ON pe.evaluatee_id = i.id
      LEFT JOIN (
        SELECT instructor_id, AVG(total_score) AS dept_head_average, COUNT(*) AS dept_head_total,
          SUM(CASE WHEN LOWER(COALESCE(status, 'pending')) IN ('submitted', 'completed', 'approved') THEN 1 ELSE 0 END) AS dept_head_completed
        FROM dept_head_evaluations WHERE evaluator_id = ? GROUP BY instructor_id
      ) dh ON dh.instructor_id = i.id
      WHERE i.department_id = ? AND LOWER(COALESCE(u.status, 'active')) = 'active' AND LOWER(u.role) = 'instructor'
        AND (? IS NULL OR i.id = ?)
      ORDER BY instructor_name ASC
    `, [...studentParams, academicYear, academicYear, academicYear, semester, semester, departmentId, req.user.id, departmentId, instructorFilterId, instructorFilterId]);
    const instructorIds = rows.map((row) => Number(row.instructor_id)).filter((id) => Number.isInteger(id) && id > 0);
    const assignmentCounts = new Map();
    if (instructorIds.length) {
      const placeholders = instructorIds.map(() => '?').join(', ');
      const [assignmentRows] = await pool.query(
        `SELECT instructor_id, COUNT(*) AS assignment_count
         FROM course_assignments
         WHERE instructor_id IN (${placeholders})
           AND LOWER(COALESCE(status, 'assigned')) NOT IN ('cancelled', 'inactive', 'unassigned')
           AND (? = '' OR academic_year IS NULL OR LOWER(TRIM(academic_year)) = LOWER(?) OR LOWER(TRIM(academic_year)) = LOWER(SUBSTRING_INDEX(?, '/', 1)))
           AND (? = '' OR semester IS NULL OR LOWER(REPLACE(TRIM(semester), 'semester', '')) = LOWER(REPLACE(TRIM(?), 'semester', '')))
         GROUP BY instructor_id`,
        [...instructorIds, academicYear, academicYear, academicYear, semester, semester]
      );
      assignmentRows.forEach((row) => assignmentCounts.set(Number(row.instructor_id), Number(row.assignment_count || 0)));
    }
    return res.json(rows.map((row) => {
      const student = Number(row.student_average || 0);
      const peer = Number(row.peer_average || 0);
      const deptHead = Number(row.dept_head_average || 0);
      const normalizedPeer = peer <= 30 ? (peer / 30) * 100 : peer;
      const normalizedDeptHead = deptHead <= 30 ? (deptHead / 30) * 100 : deptHead;
      const total = Number(row.total_evaluations || 0);
      const completed = Number(row.completed_evaluations || 0);
      const assignmentCount = assignmentCounts.get(Number(row.instructor_id)) || 0;
      const hasAssignedCourse = assignmentCount > 0;
      const weighted = calculateWeightedPerformance({ student, peer: normalizedPeer, deptHead: normalizedDeptHead, hasAssignedCourse });
      return { ...row, student_average: Number(student.toFixed(2)), raw_student_score: Number(student.toFixed(2)), submission_count: Number(row.submission_count || 0), student_weighted: weighted.studentWeighted, hasAssignedCourse, has_assigned_course: hasAssignedCourse, peer_average: Number(normalizedPeer.toFixed(2)), dept_head_average: Number(normalizedDeptHead.toFixed(2)), final_score: weighted.totalWeightedScore, total_evaluations: total, completed_evaluations: completed, completion_rate: total ? Number((completed / total * 100).toFixed(2)) : 0, status: total > 0 && completed === total ? 'Completed' : 'Pending' };
    }));
  } catch (error) {
    console.error('Department evaluation tracking query failed:', error);
    return res.status(500).json({ message: 'Unable to load evaluation tracking results.' });
  }
});

router.get('/department-summary', authenticateToken, authorizeRoles('dept_head', 'college_dean', 'dean'), async (req, res) => {
  const departmentId = getDepartmentId(req);
  let academicYear = String(req.query.academic_year || '').trim();
  let semester = String(req.query.semester || '').trim();
  if (!departmentId) return res.status(403).json({ message: 'Your department is not defined.' });

  try {
    const [instructors] = await pool.query(
      `SELECT i.id AS instructor_id, i.user_id, 'Instructor' AS role,
              TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS instructor_name
       FROM instructors i
       INNER JOIN users u ON u.id = i.user_id
       WHERE i.department_id = ? AND LOWER(COALESCE(u.status, 'active')) = 'active'
         AND EXISTS (
           SELECT 1
           FROM course_assignments ca
           WHERE ca.instructor_id = i.id
             AND LOWER(COALESCE(ca.status, 'assigned')) <> 'cancelled'
         )
       UNION ALL
      SELECT la.id AS instructor_id, la.user_id, 'Lab Assistant' AS role,
              TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))) AS instructor_name
       FROM lab_assistants la
       INNER JOIN users u ON u.id = la.user_id
       WHERE la.department_id = ? AND LOWER(COALESCE(u.status, 'active')) = 'active'
       ORDER BY instructor_name ASC`,
      [departmentId, departmentId]
    );

    const rows = [];
    for (const instructor of instructors) {
      if (instructor.role === 'Lab Assistant') {
        const [[student]] = await pool.query(
          `SELECT COALESCE(AVG(ses.score), 0) AS score
           FROM student_evaluation_submissions ses
           INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
           WHERE ed.target_type = 'lab_assistant' AND ed.target_user_id IN (?, ?)
             AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved')` ,
           [instructor.instructor_id, instructor.user_id]
        );
        const [[peer]] = await pool.query(
          `SELECT COALESCE(AVG(pes.score), 0) AS score
           FROM peer_evaluation_submissions pes
           INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
           INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
           WHERE ed.target_type = 'lab_assistant' AND ed.target_user_id IN (?, ?)
             AND LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved')` ,
           [instructor.instructor_id, instructor.user_id]
        );
        const [[deptHead]] = await pool.query(
          `SELECT COALESCE(AVG(dhe.total_score), 0) AS score
           FROM dept_head_evaluations dhe
           WHERE dhe.evaluatee_id IN (?, ?) AND LOWER(COALESCE(dhe.target_role, '')) = 'lab_assistant'
             AND LOWER(COALESCE(dhe.status, 'pending')) IN ('submitted', 'completed', 'approved')` ,
           [instructor.instructor_id, instructor.user_id]
        );
        const studentScore = Number(student?.score || 0);
        const peerScore = Number(peer?.score || 0);
        const deptHeadStored = Number(deptHead?.score || 0);
        const deptHeadScore = deptHeadStored;
        const evaluated = computeEvaluation(studentScore, deptHeadScore, peerScore);
        rows.push({
          ...instructor,
          student_average: Number(studentScore.toFixed(2)),
          student_weighted: evaluated.studentWeighted,
          dept_head_score: Number(evaluated.deptHeadRaw.toFixed(2)),
          dept_head_average: Number(evaluated.deptHeadRaw.toFixed(2)),
          dept_head_weighted: evaluated.deptHeadWeighted,
          peer_average: Number(peerScore.toFixed(2)),
          peer_weighted: evaluated.peerWeighted,
          total_score: evaluated.totalScore,
          final_score: evaluated.totalScore,
          totalWeightedScore: evaluated.totalScore,
          status: evaluated.totalScore > 0 ? 'Completed' : 'Pending',
          can_print: evaluated.totalScore > 0,
        });
        continue;
      }
      await calculateAndSaveInstructorResult(instructor.instructor_id, academicYear, semester);
      const [[result]] = await pool.query(
        `SELECT instructor_id, academic_year, semester,
                student_average, student_score, peer_average, peer_score,
                dept_head_score, total_score, final_score
         FROM evaluation_results
         WHERE instructor_id = ?
           AND (? = '' OR academic_year = ?)
           AND (? = '' OR semester = ?)
         ORDER BY id DESC LIMIT 1`,
        [instructor.instructor_id, academicYear, academicYear, semester, semester]
      );
      const student = Number(result?.student_average || result?.student_score || 0);
      const peer = Number(result?.peer_average || result?.peer_score || 0);
      const deptHeadRaw = Number(result?.dept_head_score || 0);
      const deptHead = deptHeadRaw > 0 && deptHeadRaw <= 30 ? (deptHeadRaw / 30) * 100 : deptHeadRaw;
      const evaluated = computeEvaluation(student, deptHeadRaw, peer);
      rows.push({
        ...instructor,
        student_average: Number(student.toFixed(2)),
        student_weighted: evaluated.studentWeighted,
        dept_head_score: Number(evaluated.deptHeadRaw.toFixed(2)),
        dept_head_average: Number(evaluated.deptHeadRaw.toFixed(2)),
        dept_head_weighted: evaluated.deptHeadWeighted,
        peer_average: Number(peer.toFixed(2)),
        peer_weighted: evaluated.peerWeighted,
        total_score: evaluated.totalScore,
        final_score: evaluated.totalScore,
        totalWeightedScore: evaluated.totalScore,
        status: evaluated.totalScore > 0 ? 'Completed' : 'Pending',
        can_print: evaluated.totalScore > 0,
      });
    }
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Department summary query failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to load department summary.' });
  }
});

const calculateProportionalScore = ({ student, peer, deptHead }) => {
  const normalizedDeptHead = Number(deptHead || 0) > 0 && Number(deptHead) <= 30
    ? (Number(deptHead) / 30) * 100
    : Number(deptHead || 0);
  const categories = [
    ['student', student, 0.5],
    ['peer', peer, 0.2],
    ['deptHead', normalizedDeptHead, 0.3],
  ].filter(([, score]) => score !== null && score !== undefined && Number.isFinite(Number(score)));

  if (!categories.length) return 0;
  return Number(categories.reduce((sum, [, score, weight]) => sum + Number(score) * weight, 0).toFixed(2));
};

router.get(['/reports', '/department-report'], authenticateToken, authorizeRoles('dept_head', 'admin', 'college_dean'), async (req, res) => {
  const departmentId = Number(req.user?.department_id || req.query.department_id);
  let academicYear = String(req.query.academic_year || '').trim();
  let semester = String(req.query.semester || '').trim();
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
  }

  try {
    const [[activePeriod]] = await pool.query(
      `SELECT academic_year, semester FROM evaluation_periods
       WHERE LOWER(status) = 'active' ORDER BY id DESC LIMIT 1`
    );
    academicYear = academicYear || String(activePeriod?.academic_year || '').trim();
    semester = semester || String(activePeriod?.semester || '').trim();
    const [instructors] = await pool.query(`
      SELECT i.id, i.user_id,
        TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS name,
        d.name AS department_name, c.name AS college_name, i.employee_id
      FROM instructors i
      INNER JOIN users u ON u.id = i.user_id
      LEFT JOIN departments d ON d.id = i.department_id
      LEFT JOIN colleges c ON c.id = d.college_id
      WHERE i.department_id = ?
        AND LOWER(TRIM(COALESCE(u.role, ''))) = 'instructor'
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
        AND i.user_id <> ?
      ORDER BY name ASC
    `, [departmentId, req.user.id]);
    const [labAssistants] = await pool.query(`
      SELECT la.id, la.user_id,
        TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))) AS name,
        d.name AS department_name, c.name AS college_name, la.employee_id
      FROM lab_assistants la
      INNER JOIN users u ON u.id = la.user_id
      LEFT JOIN departments d ON d.id = la.department_id
      LEFT JOIN colleges c ON c.id = d.college_id
      WHERE la.department_id = ?
        AND LOWER(TRIM(COALESCE(u.role, ''))) = 'lab_assistant'
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
        AND la.user_id <> ?
      ORDER BY name ASC
    `, [departmentId, req.user.id]);

    const unifiedRows = await Promise.all(instructors.map(async (instructor) => {
      const metrics = await getInstructorOverallPerformance({ instructorId: instructor.id, academicYear, semester });
      const hasCourseAssigned = Boolean(metrics.hasAssignedCourse);
      const studentRaw = Number(metrics.studentRaw || 0);
      const peerRaw = Number(metrics.peerRaw || 0);
      const deptHeadRaw = Number(metrics.deptHeadRaw || 0);
      const studentWeighted = Number((studentRaw * (hasCourseAssigned ? 0.50 : 0)).toFixed(2));
      const deptHeadWeighted = Number((deptHeadRaw * (hasCourseAssigned ? 0.30 : 0.60)).toFixed(2));
      const peerWeighted = Number((peerRaw * (hasCourseAssigned ? 0.20 : 0.40)).toFixed(2));
      const totalScore = Number((studentWeighted + deptHeadWeighted + peerWeighted).toFixed(2));
      return {
        ...metrics,
        id: instructor.id,
        evaluatee_id: instructor.id,
        instructor_id: instructor.id,
        user_id: instructor.user_id,
        role: 'Instructor',
        name: instructor.name,
        full_name: instructor.name,
        department: instructor.department_name,
        department_name: instructor.department_name,
        college_name: instructor.college_name,
        employee_id: instructor.employee_id,
        student_average: studentRaw,
        student_score: studentRaw,
        studentRaw,
        student_weighted: studentWeighted,
        studentWeighted,
        peer_average: peerRaw,
        peer_score: peerRaw,
        peerRaw,
        peer_weighted: peerWeighted,
        peerWeighted,
        dept_head_score: deptHeadRaw,
        dept_head_average: deptHeadRaw,
        deptHeadRaw: deptHeadRaw,
        dept_head_weighted: deptHeadWeighted,
        deptHeadWeighted,
        total_score: totalScore,
        final_score: totalScore,
        totalWeightedScore: totalScore,
        breakdown: {
          student: { rawPercentage: Number(studentRaw.toFixed(2)), weight: hasCourseAssigned ? 50 : 0, weightedContribution: studentWeighted, isNA: !hasCourseAssigned },
          deptHead: { rawPercentage: Number(deptHeadRaw.toFixed(2)), rawScore: Number(deptHeadRaw.toFixed(2)), weight: hasCourseAssigned ? 30 : 60, weightedContribution: deptHeadWeighted },
          peer: { rawPercentage: Number(peerRaw.toFixed(2)), weight: hasCourseAssigned ? 20 : 40, weightedContribution: peerWeighted },
        },
        hasCourseAssigned,
        hasAssignedCourses: hasCourseAssigned,
        has_course_assigned: hasCourseAssigned,
        total_students_evaluated_count: Number(metrics.student?.count || 0),
        total_peers_evaluated_count: Number(metrics.peer?.count || 0),
        can_print: metrics.isComplete === true,
        isComplete: metrics.isComplete === true,
        status: metrics.isComplete === true ? 'Completed' : 'Pending',
      };
    }));
    const labAssistantRows = await Promise.all(labAssistants.map(async (labAssistant) => {
      const [[courseCountRow]] = await pool.query(
        'SELECT COUNT(*) AS total FROM course_assignments WHERE lab_assistant_id = ? OR instructor_id = ?',
        [labAssistant.id, labAssistant.id]
      );
      const hasCourseAssigned = Number(courseCountRow?.total || 0) > 0;
      const [[student]] = await pool.query(
        `SELECT COALESCE(AVG(ses.score), 0) AS score, COUNT(DISTINCT ses.id) AS submission_count
         FROM student_evaluation_submissions ses
         INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
         WHERE ed.target_type = 'lab_assistant' AND ed.target_user_id IN (?, ?)
            AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved')` ,
          [labAssistant.id, labAssistant.user_id]
      );
      const [[peer]] = await pool.query(
        `SELECT COALESCE(AVG(pes.score), 0) AS score, COUNT(DISTINCT pes.id) AS submission_count
         FROM peer_evaluation_submissions pes
         INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
         LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
        WHERE (pe.evaluatee_id IN (?, ?) OR (ed.target_type = 'lab_assistant' AND ed.target_user_id IN (?, ?)))
            AND LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved')` ,
          [labAssistant.id, labAssistant.user_id, labAssistant.id, labAssistant.user_id]
      );
      const [[deptHead]] = await pool.query(
        `SELECT COALESCE(AVG(dhe.total_score), 0) AS score
         FROM dept_head_evaluations dhe
         WHERE dhe.evaluatee_id IN (?, ?) AND LOWER(COALESCE(dhe.target_role, '')) = 'lab_assistant'
            AND LOWER(COALESCE(dhe.status, 'pending')) IN ('submitted', 'completed', 'approved')` ,
          [labAssistant.id, labAssistant.user_id]
      );
      const studentRaw = Number(Number(student?.score || 0).toFixed(2));
      const peerRaw = Number(Number(peer?.score || 0).toFixed(2));
      const deptHeadStored = Number(deptHead?.score || 0);
      const deptHeadRaw = Number(deptHeadStored.toFixed(2));
      const studentWeighted = Number((studentRaw * (hasCourseAssigned ? 0.50 : 0)).toFixed(2));
      const peerWeighted = Number((peerRaw * (hasCourseAssigned ? 0.20 : 0.40)).toFixed(2));
      const deptHeadWeighted = Number((deptHeadRaw * (hasCourseAssigned ? 0.30 : 0.60)).toFixed(2));
      const totalScore = Number((studentWeighted + peerWeighted + deptHeadWeighted).toFixed(2));
      const isComplete = hasCourseAssigned
        ? studentRaw > 0 && peerRaw > 0 && deptHeadRaw > 0
        : peerRaw > 0 && deptHeadRaw > 0;
      return {
        id: labAssistant.id,
        evaluatee_id: labAssistant.id,
        instructor_id: labAssistant.id,
        user_id: labAssistant.user_id,
        role: 'Lab Assistant',
        name: labAssistant.name,
        full_name: labAssistant.name,
        department: labAssistant.department_name,
        department_name: labAssistant.department_name,
        college_name: labAssistant.college_name,
        employee_id: labAssistant.employee_id,
        student_average: studentRaw,
        student_score: studentRaw,
        studentRaw,
        student_weighted: studentWeighted,
        studentWeighted,
        peer_average: peerRaw,
        peer_score: peerRaw,
        peerRaw,
        peer_weighted: peerWeighted,
        peerWeighted,
        dept_head_score: deptHeadRaw,
        dept_head_average: deptHeadRaw,
        deptHeadRaw: deptHeadRaw,
        dept_head_weighted: deptHeadWeighted,
        deptHeadWeighted,
        total_score: totalScore,
        final_score: totalScore,
        totalWeightedScore: totalScore,
        total_students_evaluated_count: Number(student?.submission_count || 0),
        total_peers_evaluated_count: Number(peer?.submission_count || 0),
        hasCourseAssigned,
        has_course_assigned: hasCourseAssigned,
        can_print: isComplete,
        isComplete,
        status: isComplete ? 'Completed' : 'Pending',
      };
    }));
    return res.json([...unifiedRows, ...labAssistantRows].sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))));

    const [rows] = await pool.query(`
      SELECT * FROM (
        SELECT
          i.id AS evaluatee_id,
          i.id AS instructor_id,
          i.user_id,
          'Instructor' AS role,
          TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS name,
          TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS full_name,
          COALESCE(NULLIF(d.department_name, ''), d.name, 'N/A') AS department,
          COALESCE(NULLIF(d.department_name, ''), d.name, 'N/A') AS department_name,
          COALESCE(student_scores.student_average, er.student_score, er.student_average, 0) AS student_average,
          ROUND(COALESCE(student_scores.student_average, er.student_score, er.student_average, 0) * 0.50, 2) AS student_weighted,
          COALESCE(student_scores.total_student_evaluators, 0) AS total_student_evaluators,
          COALESCE(student_scores.required_student_evaluators, 0) AS required_student_evaluators,
          COALESCE(student_scores.assigned_classes, '') AS assigned_classes,
          COALESCE(peer_scores.peer_average, er.peer_score, er.peer_average, 0) AS peer_average,
          ROUND(COALESCE(peer_scores.peer_average, er.peer_score, er.peer_average, 0) * 0.20, 2) AS peer_weighted,
          COALESCE(peer_scores.total_peer_evaluators, 0) AS total_peer_evaluators,
          COALESCE(peer_scores.required_peer_evaluators, 0) AS required_peer_evaluators,
          COALESCE(dept_head_scores.dept_head_score, er.dept_head_score, 0) AS dept_head_score,
          ROUND((CASE WHEN COALESCE(dept_head_scores.dept_head_score, er.dept_head_score, 0) BETWEEN 0.01 AND 30 THEN COALESCE(dept_head_scores.dept_head_score, er.dept_head_score, 0) / 30 * 100 ELSE COALESCE(dept_head_scores.dept_head_score, er.dept_head_score, 0) END) * 0.30, 2) AS dept_head_weighted,
          COALESCE(dept_head_scores.total_dept_head_evaluators, 0) AS total_dept_head_evaluators,
          ROUND((COALESCE(student_scores.student_average, er.student_score, er.student_average, 0) * 0.50) + (COALESCE(peer_scores.peer_average, er.peer_score, er.peer_average, 0) * 0.20) + (CASE WHEN COALESCE(dept_head_scores.dept_head_score, er.dept_head_score, 0) BETWEEN 0.01 AND 30 THEN COALESCE(dept_head_scores.dept_head_score, er.dept_head_score, 0) / 30 * 100 ELSE COALESCE(dept_head_scores.dept_head_score, er.dept_head_score, 0) END * 0.30), 2) AS final_score,
          COALESCE(er.total_score, er.final_score, 0) AS total_score,
          er.final_score AS calculated_final_score,
          COALESCE(latest_term.academic_year, '') AS academic_year,
          COALESCE(latest_term.semester, '') AS semester,
          i.employee_id
        FROM instructors i
        INNER JOIN users u ON u.id = i.user_id
        INNER JOIN departments d ON d.id = i.department_id
        LEFT JOIN evaluation_results er ON er.id = (
          SELECT latest.id FROM evaluation_results latest WHERE latest.instructor_id = i.id ORDER BY latest.id DESC LIMIT 1
        )
        LEFT JOIN (
          SELECT ca.instructor_id,
                 AVG(ses.score) AS student_average,
                 COUNT(DISTINCT ses.id) AS total_student_evaluators,
                 COUNT(DISTINCT ed.id) AS required_student_evaluators,
                 GROUP_CONCAT(DISTINCT CONCAT(COALESCE(ca.year_level, 'N/A'), ' (', COALESCE(ca.section, 'N/A'), ')') ORDER BY CONCAT(COALESCE(ca.year_level, 'N/A'), ' (', COALESCE(ca.section, 'N/A'), ')') SEPARATOR ', ') AS assigned_classes
          FROM evaluation_dispatches ed
          INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
          LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
            AND LOWER(TRIM(ses.status)) IN ('submitted', 'completed', 'approved')
          WHERE ed.evaluation_type = 'student'
            AND (? = '' OR COALESCE(ca.academic_year, ed.academic_year) = ? OR COALESCE(ca.academic_year, ed.academic_year) LIKE CONCAT('%', ?, '%'))
            AND (? = '' OR LOWER(TRIM(REPLACE(COALESCE(ca.semester, ed.semester), 'semester', ''))) = LOWER(TRIM(REPLACE(?, 'semester', ''))))
          GROUP BY ca.instructor_id
        ) student_scores ON student_scores.instructor_id = i.id
        LEFT JOIN (
             SELECT pe.evaluatee_id AS instructor_id, AVG(pes.score) AS peer_average,
               COUNT(DISTINCT pes.id) AS total_peer_evaluators,
               COUNT(DISTINCT pe.id) AS required_peer_evaluators
          FROM peer_evaluations pe
          LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
            AND LOWER(TRIM(pes.status)) IN ('submitted', 'completed', 'approved')
          INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
          WHERE 1 = 1
            AND (? = '' OR ed.academic_year = ? OR ed.academic_year LIKE CONCAT('%', ?, '%'))
            AND (? = '' OR LOWER(TRIM(REPLACE(ed.semester, 'semester', ''))) = LOWER(TRIM(REPLACE(?, 'semester', ''))))
          GROUP BY pe.evaluatee_id
        ) peer_scores ON peer_scores.instructor_id = i.id
        LEFT JOIN (
             SELECT COALESCE(NULLIF(evaluatee_id, 0), instructor_id) AS instructor_id, AVG(total_score) AS dept_head_score,
               COUNT(DISTINCT id) AS total_dept_head_evaluators
          FROM dept_head_evaluations
          WHERE LOWER(TRIM(status)) IN ('submitted', 'completed', 'approved')
            AND LOWER(COALESCE(target_role, 'instructor')) IN ('instructor', 'dept_head', 'department_head', 'depthead')
            AND (? = '' OR academic_year = ? OR academic_year LIKE CONCAT('%', ?, '%'))
            AND (? = '' OR LOWER(TRIM(REPLACE(semester, 'semester', ''))) = LOWER(TRIM(REPLACE(?, 'semester', ''))))
          GROUP BY COALESCE(NULLIF(evaluatee_id, 0), instructor_id)
        ) dept_head_scores ON dept_head_scores.instructor_id = i.id
        LEFT JOIN (
          SELECT ca2.instructor_id, ca2.academic_year, ca2.semester
          FROM course_assignments ca2
          WHERE ca2.id = (SELECT MAX(ca3.id) FROM course_assignments ca3 WHERE ca3.instructor_id = ca2.instructor_id)
        ) latest_term ON latest_term.instructor_id = i.id
        WHERE i.department_id = ?
          AND i.user_id <> ?
          AND LOWER(COALESCE(u.status, 'active')) = 'active'

        UNION ALL

        SELECT
          la.id AS evaluatee_id,
          NULL AS instructor_id,
          la.user_id,
          'Lab Assistant' AS role,
          TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))) AS name,
          TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))) AS full_name,
          COALESCE(NULLIF(d.department_name, ''), d.name, 'N/A') AS department,
          COALESCE(NULLIF(d.department_name, ''), d.name, 'N/A') AS department_name,
          COALESCE(la_scores.student_average, 0) AS student_average,
          ROUND(COALESCE(la_scores.student_average, 0) * 0.50, 2) AS student_weighted,
          COALESCE(la_scores.total_student_evaluators, 0) AS total_student_evaluators,
          COALESCE(la_scores.required_student_evaluators, 0) AS required_student_evaluators,
          COALESCE(la_scores.assigned_classes, '') AS assigned_classes,
          COALESCE(la_peer.peer_average, 0) AS peer_average,
          ROUND(COALESCE(la_peer.peer_average, 0) * 0.20, 2) AS peer_weighted,
          COALESCE(la_peer.total_peer_evaluators, 0) AS total_peer_evaluators,
          COALESCE(la_peer.required_peer_evaluators, 0) AS required_peer_evaluators,
          COALESCE(la_dept.dept_head_score, 0) AS dept_head_score,
          ROUND((CASE WHEN COALESCE(la_dept.dept_head_score, 0) BETWEEN 0.01 AND 30 THEN COALESCE(la_dept.dept_head_score, 0) / 30 * 100 ELSE COALESCE(la_dept.dept_head_score, 0) END) * 0.30, 2) AS dept_head_weighted,
          COALESCE(la_dept.total_dept_head_evaluators, 0) AS total_dept_head_evaluators,
          ROUND((COALESCE(la_scores.student_average, 0) * 0.50) + (COALESCE(la_peer.peer_average, 0) * 0.20) + (CASE WHEN COALESCE(la_dept.dept_head_score, 0) BETWEEN 0.01 AND 30 THEN COALESCE(la_dept.dept_head_score, 0) / 30 * 100 ELSE COALESCE(la_dept.dept_head_score, 0) END * 0.30), 2) AS final_score,
          COALESCE(la_scores.student_average, 0) AS total_score,
          NULL AS calculated_final_score,
          '' AS academic_year,
          '' AS semester,
          la.employee_id
        FROM lab_assistants la
        INNER JOIN departments d ON d.id = la.department_id
        LEFT JOIN (
          SELECT ed.target_user_id AS lab_assistant_id,
                 AVG(ses.score) AS student_average,
                 COUNT(DISTINCT ses.id) AS total_student_evaluators,
                 COUNT(DISTINCT ed.id) AS required_student_evaluators,
                 GROUP_CONCAT(DISTINCT CONCAT(COALESCE(ca.year_level, 'N/A'), ' (', COALESCE(ca.section, 'N/A'), ')') ORDER BY CONCAT(COALESCE(ca.year_level, 'N/A'), ' (', COALESCE(ca.section, 'N/A'), ')') SEPARATOR ', ') AS assigned_classes
          FROM evaluation_dispatches ed
          INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
          LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
            AND LOWER(TRIM(COALESCE(ses.status, 'submitted'))) IN ('submitted', 'completed', 'approved')
          WHERE ed.target_type = 'lab_assistant'
            AND ed.department_id = ?
          GROUP BY ed.target_user_id
        ) la_scores ON la_scores.lab_assistant_id = la.id
        LEFT JOIN (
             SELECT pe.evaluatee_id AS lab_assistant_id, AVG(pes.score) AS peer_average,
               COUNT(DISTINCT pes.id) AS total_peer_evaluators,
               COUNT(DISTINCT pe.id) AS required_peer_evaluators
          FROM peer_evaluations pe
          LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
            AND LOWER(TRIM(COALESCE(pes.status, 'submitted'))) IN ('submitted', 'completed', 'approved')
          INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
          WHERE pe.evaluatee_id IS NOT NULL
            AND ed.target_type = 'lab_assistant'
          GROUP BY pe.evaluatee_id
        ) la_peer ON la_peer.lab_assistant_id = la.id
        LEFT JOIN (
             SELECT evaluatee_id AS lab_assistant_id, AVG(total_score) AS dept_head_score,
               COUNT(DISTINCT id) AS total_dept_head_evaluators
          FROM dept_head_evaluations
          WHERE target_role = 'lab_assistant'
            AND department_id = ?
            AND LOWER(TRIM(COALESCE(status, 'pending'))) IN ('submitted', 'completed', 'approved')
          GROUP BY evaluatee_id
        ) la_dept ON la_dept.lab_assistant_id = la.id
        WHERE la.department_id = ?
      ) staff_results
      ORDER BY name ASC
    `, [academicYear, academicYear, academicYear, semester, semester, academicYear, academicYear, academicYear, semester, semester, academicYear, academicYear, academicYear, semester, semester, departmentId, req.user.id, departmentId, departmentId, departmentId]);

    return res.json(rows.map((row) => {
      const student = row.student_average == null ? null : Number(row.student_average);
      const peer = row.peer_average == null ? null : Number(row.peer_average);
      const deptHead = row.dept_head_score == null ? null : Number(row.dept_head_score);
      const totalEvaluators = Number(row.total_student_evaluators ?? row.totalEvaluatorsCount ?? 0);
      const requiredStudentEvaluators = Number(row.required_student_evaluators || 0);
      const totalPeerEvaluators = Number(row.total_peer_evaluators || 0);
      const requiredPeerEvaluators = Number(row.required_peer_evaluators || 0);
      const totalDeptHeadEvaluators = Number(row.total_dept_head_evaluators || 0);
      const hasStudentEval = Number(student || 0) > 0 || totalEvaluators > 0;
      const hasPeerEval = Number(peer || 0) > 0 || totalPeerEvaluators > 0;
      const deptHeadSubmitted = totalDeptHeadEvaluators > 0;
      const hasDeptHeadEval = Number(deptHead || 0) > 0 || deptHeadSubmitted;
      const isReadyToPrint = hasStudentEval && hasDeptHeadEval && hasPeerEval;
      const normalizedDeptHead = deptHead > 0 && deptHead <= 30 ? (deptHead / 30) * 100 : deptHead;
      const weightedStudent = Number((student * 0.50).toFixed(2));
      const weightedDeptHead = Number((normalizedDeptHead * 0.30).toFixed(2));
      const weightedPeer = Number((peer * 0.20).toFixed(2));
      const totalWeightedScore = Number((weightedStudent + weightedDeptHead + weightedPeer).toFixed(2));
      const studentCompletionRate = requiredStudentEvaluators > 0
        ? Number(Math.min((totalEvaluators / requiredStudentEvaluators) * 100, 100).toFixed(2))
        : 0;
      const deptHeadStatus = deptHeadSubmitted ? 'Submitted' : 'Pending';
      const missingRoles = [];
      if (!hasStudentEval) missingRoles.push(`Student Evaluation pending (${totalEvaluators}/${requiredStudentEvaluators || 1} completed)`);
      if (!hasDeptHeadEval) missingRoles.push('Department Head Evaluation pending (0/1 completed)');
      if (!hasPeerEval) missingRoles.push(`Peer Evaluation pending (${totalPeerEvaluators}/${requiredPeerEvaluators || 1} completed)`);
      const assignedClasses = String(row.assigned_classes || row.assignedClasses || '').trim();
      return {
        ...row,
        id: row.evaluatee_id || row.instructor_id || row.id,
        student_average: student,
        student_score: student,
        student_weighted: weightedStudent.toFixed(2),
        peer_average: peer,
        peer_score: peer,
        peer_weighted: weightedPeer.toFixed(2),
        dept_head_score: deptHead,
        dept_head_average: deptHead,
        deptHeadRaw: Number(normalizedDeptHead.toFixed(2)),
        department_score: deptHead,
        dept_head_weighted: weightedDeptHead.toFixed(2),
        deptHeadWeighted: weightedDeptHead,
        total_student_evaluators: totalEvaluators,
        required_student_evaluators: requiredStudentEvaluators,
        total_peer_evaluators: totalPeerEvaluators,
        required_peer_evaluators: requiredPeerEvaluators,
        total_dept_head_evaluators: totalDeptHeadEvaluators,
        hasStudentEval,
        hasDeptHeadEval,
        hasPeerEval,
        dept_head_submitted: deptHeadSubmitted ? 1 : 0,
        isReadyToPrint,
        can_print: isReadyToPrint,
        studentCompletionRate,
        deptHeadStatus,
        pendingSubmissionsCount: Math.max(requiredStudentEvaluators - totalEvaluators, 0)
          + Math.max(requiredPeerEvaluators - totalPeerEvaluators, 0)
          + (deptHeadSubmitted ? 0 : 1),
        isCalculated: totalWeightedScore > 0,
        status: isReadyToPrint ? 'Completed' : 'Pending Submissions',
        missing_roles: missingRoles,
        total_evaluators_count: totalEvaluators,
        assigned_classes: assignedClasses,
        assignedClasses,
        employee_id: row.employee_id || row.employeeId || '',
        final_score: totalWeightedScore,
        totalWeightedScore,
        studentRaw: Number(student.toFixed(2)),
        studentWeighted: weightedStudent,
        deptHeadRaw: Number(normalizedDeptHead.toFixed(2)),
        deptHeadWeighted: weightedDeptHead,
        peerRaw: Number(peer.toFixed(2)),
        peerWeighted: weightedPeer,
      };
    }));
  } catch (error) {
    console.error('Unable to load department reports:', error);
    return res.status(500).json({ success: false, data: [], message: 'Unable to load department reports.' });
  }
});

router.get('/analytics', authenticateToken, authorizeRoles('dept_head'), async (req, res) => {
  const departmentId = Number(req.user?.department_id);
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
  }

  try {
    const [rows] = await pool.query(`
      SELECT
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department,
        ROUND(AVG(er.final_score), 2) AS satisfaction
      FROM evaluation_results er
      INNER JOIN instructors i ON i.id = er.instructor_id
      INNER JOIN departments d ON d.id = er.department_id
      INNER JOIN users u ON u.id = i.user_id
      WHERE er.department_id = ?
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
      GROUP BY d.id, d.department_name, d.name
      ORDER BY department ASC
    `, [departmentId]);

    return res.json(rows.map((row) => ({
      department: row.department || 'Department',
      satisfaction: Number(row.satisfaction || 0),
    })));
  } catch (error) {
    console.error('Unable to load department-head analytics:', error);
    return res.status(500).json({ success: false, data: [], message: 'Unable to load department analytics.' });
  }
});

module.exports = router;