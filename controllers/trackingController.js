const pool = require('../config/db');
const { createNotifications } = require('./notificationController');
const { sendTelegramNotification } = require('../telegram-bot/src/services/notificationService');
const { createEmailTransporter, verifyEmailTransporter } = require('../services/emailService');
const { getStudentReminderRecipients } = require('../services/cronService');
const { sendTelegramReminder } = require('../utils/telegramBot');

const COMPLETED_STATUSES = "('submitted', 'completed', 'approved')";

const getDepartmentId = (req) => {
  const value = req.user?.department_id ?? req.user?.departmentId ?? req.user?.department ?? req.query?.department_id;
  const departmentId = Number(value);
  return Number.isInteger(departmentId) && departmentId > 0 ? departmentId : null;
};

const normalizeFilter = (value) => {
  const normalized = String(value || '').trim();
  return !normalized || normalized.toLowerCase().startsWith('all') ? null : normalized;
};

const getLegacyDeptHeadEvaluationTracking = async (req, res) => {
  const departmentId = getDepartmentId(req);
  if (!departmentId) return res.status(403).json({ message: 'Your department is not defined.' });

  const yearLevel = normalizeFilter(req.query.year_level);
  const section = normalizeFilter(req.query.section)?.replace(/^section\s*/i, '');
  const programType = normalizeFilter(req.query.program_type);
  const evaluateeId = Number(req.query.evaluatee_id || 0) || null;
  const targetRole = ['instructor', 'lab_assistant'].includes(String(req.query.target_role || '').toLowerCase())
    ? String(req.query.target_role).toLowerCase()
    : null;
  const targetFilter = evaluateeId ? 'AND target.id = ?' : '';
  const roleFilter = targetRole ? 'AND target.role = ?' : '';
  const outerParams = [];
  if (evaluateeId) outerParams.push(evaluateeId);
  if (targetRole) outerParams.push(targetRole);

  try {
    const [rows] = await pool.query(`
      SELECT target.id AS evaluatee_id,
             target.user_id,
             target.role,
             target.full_name AS instructor_name,
             target.employee_id,
             target.student_required,
             target.student_completed,
             target.peer_required,
             target.peer_completed,
             target.dept_head_required,
             target.dept_head_completed,
             target.dept_head_status
      FROM (
        SELECT i.id,
               i.user_id,
               'instructor' AS role,
               TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS full_name,
               i.employee_id,
               (
                 SELECT COUNT(DISTINCT ed.id)
                 FROM evaluation_dispatches ed
                 INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
                 WHERE ca.instructor_id = i.id
                   AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
                   AND ed.student_id IS NOT NULL
                   AND (? IS NULL OR LOWER(TRIM(ca.year_level)) = LOWER(TRIM(?)))
                   AND (? IS NULL OR LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(?)))
                   AND (? IS NULL OR LOWER(TRIM(ca.program_type)) = LOWER(TRIM(?)))
               ) AS student_required,
               (
                 SELECT COUNT(DISTINCT ses.id)
                 FROM evaluation_dispatches ed
                 INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
                 INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
                 WHERE ca.instructor_id = i.id
                   AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
                   AND LOWER(COALESCE(ses.status, 'submitted')) IN ${COMPLETED_STATUSES}
                   AND (? IS NULL OR LOWER(TRIM(ca.year_level)) = LOWER(TRIM(?)))
                   AND (? IS NULL OR LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(?)))
                   AND (? IS NULL OR LOWER(TRIM(ca.program_type)) = LOWER(TRIM(?)))
               ) AS student_completed,
               (SELECT COUNT(DISTINCT pe.evaluator_id) FROM peer_evaluations pe INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id INNER JOIN users pu ON pu.id = evaluator.user_id WHERE pe.evaluatee_id = i.id AND pe.evaluator_id <> i.id AND evaluator.department_id = i.department_id AND LOWER(TRIM(COALESCE(pu.role, ''))) IN ('instructor', 'peer') AND LOWER(COALESCE(pu.status, 'active')) = 'active') AS peer_required,
               (SELECT COUNT(DISTINCT pe.evaluator_id) FROM peer_evaluations pe INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id INNER JOIN users pu ON pu.id = evaluator.user_id INNER JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id WHERE pe.evaluatee_id = i.id AND pe.evaluator_id <> i.id AND evaluator.department_id = i.department_id AND LOWER(TRIM(COALESCE(pu.role, ''))) IN ('instructor', 'peer') AND LOWER(COALESCE(pu.status, 'active')) = 'active' AND LOWER(COALESCE(pes.status, 'pending')) IN ${COMPLETED_STATUSES}) AS peer_completed,
               1 AS dept_head_required,
               (SELECT COUNT(*) FROM dept_head_evaluations dhe WHERE (dhe.evaluatee_id = i.id OR (dhe.instructor_id = i.id AND COALESCE(dhe.target_role, 'instructor') = 'instructor')) AND LOWER(COALESCE(dhe.status, 'pending')) IN ${COMPLETED_STATUSES}) AS dept_head_completed,
               (SELECT LOWER(COALESCE(dhe.status, 'pending')) FROM dept_head_evaluations dhe WHERE (dhe.evaluatee_id = i.id OR (dhe.instructor_id = i.id AND COALESCE(dhe.target_role, 'instructor') = 'instructor')) ORDER BY dhe.id DESC LIMIT 1) AS dept_head_status
        FROM instructors i
        INNER JOIN users iu ON iu.id = i.user_id
        WHERE i.department_id = ? AND LOWER(COALESCE(iu.status, 'active')) = 'active'
        UNION ALL
        SELECT la.id,
               la.user_id,
               'lab_assistant' AS role,
               TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))) AS full_name,
               la.employee_id,
               (
                 SELECT COUNT(DISTINCT ed.id)
                 FROM evaluation_dispatches ed
                 INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
                 WHERE ca.department_id = la.department_id
                   AND ca.lab_assistant_id = la.id
                   AND LOWER(COALESCE(ed.evaluation_type, '')) = 'lab_assistant_student'
                   AND ed.student_id IS NOT NULL
                   AND (? IS NULL OR LOWER(TRIM(ca.year_level)) = LOWER(TRIM(?)))
                   AND (? IS NULL OR LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(?)))
                   AND (? IS NULL OR LOWER(TRIM(ca.program_type)) = LOWER(TRIM(?)))
               ) AS student_required,
               (
                 SELECT COUNT(DISTINCT ses.id)
                 FROM evaluation_dispatches ed
                 INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
                 INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
                 WHERE ca.department_id = la.department_id
                   AND ca.lab_assistant_id = la.id
                   AND LOWER(COALESCE(ed.evaluation_type, '')) = 'lab_assistant_student'
                   AND LOWER(COALESCE(ses.status, 'submitted')) IN ${COMPLETED_STATUSES}
                   AND (? IS NULL OR LOWER(TRIM(ca.year_level)) = LOWER(TRIM(?)))
                   AND (? IS NULL OR LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(?)))
                   AND (? IS NULL OR LOWER(TRIM(ca.program_type)) = LOWER(TRIM(?)))
               ) AS student_completed,
               (SELECT COUNT(DISTINCT pe.evaluator_id) FROM peer_evaluations pe INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id INNER JOIN users pu ON pu.id = evaluator.user_id WHERE pe.evaluatee_id = la.id AND evaluator.department_id = la.department_id AND LOWER(TRIM(COALESCE(pu.role, ''))) IN ('instructor', 'peer') AND LOWER(COALESCE(pu.status, 'active')) = 'active') AS peer_required,
               (SELECT COUNT(DISTINCT pe.evaluator_id) FROM peer_evaluations pe INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id INNER JOIN users pu ON pu.id = evaluator.user_id INNER JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id WHERE pe.evaluatee_id = la.id AND evaluator.department_id = la.department_id AND LOWER(TRIM(COALESCE(pu.role, ''))) IN ('instructor', 'peer') AND LOWER(COALESCE(pu.status, 'active')) = 'active' AND LOWER(COALESCE(pes.status, 'pending')) IN ${COMPLETED_STATUSES}) AS peer_completed,
               1 AS dept_head_required,
               (SELECT COUNT(*) FROM dept_head_evaluations dhe WHERE dhe.evaluatee_id = la.id AND dhe.target_role = 'lab_assistant' AND LOWER(COALESCE(dhe.status, 'pending')) IN ${COMPLETED_STATUSES}) AS dept_head_completed,
               (SELECT LOWER(COALESCE(dhe.status, 'pending')) FROM dept_head_evaluations dhe WHERE dhe.evaluatee_id = la.id AND dhe.target_role = 'lab_assistant' ORDER BY dhe.id DESC LIMIT 1) AS dept_head_status
        FROM lab_assistants la
        INNER JOIN users lau ON lau.id = la.user_id
        WHERE la.department_id = ? AND LOWER(COALESCE(lau.status, 'active')) = 'active'
      ) target
      WHERE 1 = 1 ${targetFilter} ${roleFilter}
      ORDER BY target.full_name ASC
    `, [
      yearLevel, yearLevel, section, section, programType, programType,
      yearLevel, yearLevel, section, section, programType, programType,
      departmentId,
      yearLevel, yearLevel, section, section, programType, programType,
      yearLevel, yearLevel, section, section, programType, programType,
      departmentId,
      ...outerParams,
    ]);

    return res.json(rows.map((row) => {
      const studentRequired = Number(row.student_required || 0);
      const studentCompleted = Number(row.student_completed || 0);
      const peerRequired = Number(row.peer_required || 0);
      const peerCompleted = Number(row.peer_completed || 0);
      const deptHeadCompleted = Number(row.dept_head_completed || 0) > 0 ? 1 : 0;
      const studentCompletionPercent = studentRequired ? Number(((studentCompleted / studentRequired) * 100).toFixed(2)) : 0;
      const peerCompletionPercent = peerRequired ? Number(((peerCompleted / peerRequired) * 100).toFixed(2)) : 0;
      const overallProgress = Number(((studentCompletionPercent * 0.50) + (peerCompletionPercent * 0.20) + (deptHeadCompleted * 100 * 0.30)).toFixed(2));
      return ({
      ...row,
      instructor_id: Number(row.evaluatee_id),
      student_required: studentRequired,
      student_completed: studentCompleted,
      student_completion_percent: studentCompletionPercent,
      peer_required: peerRequired,
      peer_completed: peerCompleted,
      peer_completion_percent: peerCompletionPercent,
      dept_head_required: 1,
      dept_head_completed: deptHeadCompleted,
      dept_head_completion_percent: deptHeadCompleted ? 100 : 0,
      overall_progress: overallProgress,
      total_evaluations: studentRequired,
      completed_evaluations: studentCompleted,
      peer_total: peerRequired,
      peer_completed_count: peerCompleted,
    });
    }));
  } catch (error) {
    console.error('Department-head tracking aggregate query failed:', error);
    return res.status(500).json({ message: 'Unable to load evaluation tracking.', error: error.message });
  }
};

const getDeptHeadEvaluationTracking = async (req, res) => {
  const userDepartmentId = getDepartmentId(req);
  const requestedDepartmentId = Number(req.query.departmentId || 0);
  if (!userDepartmentId) return res.status(403).json({ message: 'Your department is not defined.' });
  if (requestedDepartmentId && requestedDepartmentId !== userDepartmentId) {
    return res.status(403).json({ message: 'You can only view your department.' });
  }

  const departmentId = userDepartmentId;
  const academicYear = normalizeFilter(req.query.academicYear);
  const section = normalizeFilter(req.query.section)?.replace(/^section\s*/i, '');
  const program = normalizeFilter(req.query.program);
  const searchInstructor = normalizeFilter(req.query.searchInstructor);
  const completedStatuses = ['submitted', 'completed', 'approved'];

  try {
    const [targets] = await pool.query(`
      SELECT i.id AS evaluatee_id, i.user_id, 'Instructor' AS role,
        TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS instructor_name,
        d.name AS department
      FROM instructors i
      INNER JOIN users u ON u.id = i.user_id
      INNER JOIN departments d ON d.id = i.department_id
      WHERE i.department_id = ? AND LOWER(COALESCE(u.status, 'active')) = 'active'
        AND (? = '' OR LOWER(CONCAT(i.first_name, ' ', i.last_name)) LIKE LOWER(?))
      UNION ALL
      SELECT la.id AS evaluatee_id, la.user_id, 'Lab Assistant' AS role,
        TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))) AS instructor_name,
        d.name AS department
      FROM lab_assistants la
      INNER JOIN users u ON u.id = la.user_id
      INNER JOIN departments d ON d.id = la.department_id
      WHERE la.department_id = ? AND LOWER(COALESCE(u.status, 'active')) = 'active'
        AND (? = '' OR LOWER(CONCAT(la.first_name, ' ', la.last_name)) LIKE LOWER(?))
      ORDER BY instructor_name ASC
    `, [departmentId, searchInstructor || '', `%${searchInstructor || ''}%`, departmentId, searchInstructor || '', `%${searchInstructor || ''}%`]);

    const trackingList = await Promise.all(targets.map(async (target) => {
      const isLabAssistant = target.role === 'Lab Assistant';
      const targetColumn = isLabAssistant ? 'ca.lab_assistant_id' : 'ca.instructor_id';
      const studentType = isLabAssistant ? 'lab_assistant_student' : 'student';
      const targetId = Number(target.evaluatee_id);
      const [[student]] = await pool.query(`
        SELECT COUNT(DISTINCT s.id) AS total,
          COUNT(DISTINCT CASE WHEN EXISTS (
            SELECT 1
            FROM evaluation_dispatches submitted_ed
            INNER JOIN student_evaluation_submissions submitted_ses ON submitted_ses.dispatch_id = submitted_ed.id
            WHERE submitted_ed.student_id = s.id
              AND submitted_ed.assignment_id = ca.id
              AND LOWER(COALESCE(submitted_ed.evaluation_type, '')) = LOWER(?)
              AND LOWER(COALESCE(submitted_ses.status, 'pending')) IN (?, ?, ?)
          ) THEN s.id END) AS completed
        FROM course_assignments ca
        LEFT JOIN students s ON s.id = ca.student_id
          OR (ca.student_id IS NULL
            AND s.department_id = ca.department_id
            AND LOWER(COALESCE(s.year_level, '')) = LOWER(COALESCE(ca.year_level, ''))
            AND LOWER(COALESCE(s.section, '')) = LOWER(COALESCE(ca.section, ''))
            AND (ca.program_type IS NULL OR LOWER(COALESCE(s.program_type, '')) = LOWER(ca.program_type)))
        WHERE ca.department_id = ? AND ${targetColumn} = ?
          AND LOWER(COALESCE(ca.status, 'assigned')) <> 'cancelled'
          AND (? = '' OR LOWER(COALESCE(ca.academic_year, '')) = LOWER(?))
          AND (? = '' OR LOWER(REPLACE(COALESCE(ca.section, ''), 'Section ', '')) = LOWER(?))
          AND (? = '' OR LOWER(COALESCE(ca.program_type, '')) = LOWER(?))
      `, [studentType, completedStatuses[0], completedStatuses[1], completedStatuses[2], departmentId, targetId, academicYear || '', academicYear || '', section || '', section || '', program || '', program || '']);
      const [[peer]] = await pool.query(`
        SELECT COUNT(DISTINCT pe.id) AS total,
          COUNT(DISTINCT CASE WHEN LOWER(COALESCE(pes.status, 'pending')) IN (?, ?, ?) THEN pe.id END) AS completed
        FROM peer_evaluations pe
        INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
        INNER JOIN users evaluator_user ON evaluator_user.id = evaluator.user_id
        LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
        LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
        WHERE pe.evaluatee_id = ? AND evaluator.department_id = ?
          AND LOWER(TRIM(COALESCE(evaluator_user.role, ''))) IN ('instructor', 'peer')
          AND LOWER(COALESCE(evaluator_user.status, 'active')) = 'active'
          AND (? = '' OR LOWER(COALESCE(ed.academic_year, '')) = LOWER(?))
      `, [completedStatuses[0], completedStatuses[1], completedStatuses[2], targetId, departmentId, academicYear || '', academicYear || '']);
      const [[deptHead]] = await pool.query(`
        SELECT COUNT(*) AS completed
        FROM dept_head_evaluations
        WHERE (evaluatee_id = ? OR (instructor_id = ? AND ? = 'Instructor'))
          AND (? = '' OR LOWER(COALESCE(academic_year, '')) = LOWER(?))
          AND LOWER(COALESCE(status, 'pending')) IN (?, ?, ?)
          AND (? = 'Instructor' OR target_role = 'lab_assistant')
      `, [targetId, targetId, target.role, academicYear || '', academicYear || '', ...completedStatuses, target.role]);

      const studentTotal = Number(student?.total || 0);
      const studentCompleted = Number(student?.completed || 0);
      const peerTotal = Number(peer?.total || 0);
      const peerCompleted = Number(peer?.completed || 0);
      const deptHeadCompleted = Number(deptHead?.completed || 0) > 0 ? 1 : 0;
      const totalRequired = studentTotal + peerTotal + 1;
      const completed = Math.min(studentCompleted, studentTotal) + Math.min(peerCompleted, peerTotal) + deptHeadCompleted;
      const percentage = (total, count) => total ? Number(((count / total) * 100).toFixed(2)) : 0;

      return {
        instructorId: String(target.evaluatee_id),
        instructorName: target.instructor_name,
        role: target.role,
        studentCompletion: { completed: studentCompleted, total: studentTotal, percentage: percentage(studentTotal, studentCompleted) },
        peerCompletion: { completed: peerCompleted, total: peerTotal, percentage: percentage(peerTotal, peerCompleted) },
        deptHeadStatus: deptHeadCompleted ? 'Submitted' : 'Pending',
        overallProgress: totalRequired ? Number(((completed / totalRequired) * 100).toFixed(2)) : 0,
        department: target.department,
      };
    }));

    const summary = trackingList.reduce((result, row) => {
      result.totalRequired += row.studentCompletion.total + row.peerCompletion.total + 1;
      result.completed += row.studentCompletion.completed + row.peerCompletion.completed + (row.deptHeadStatus === 'Submitted' ? 1 : 0);
      return result;
    }, { totalRequired: 0, completed: 0 });

    return res.json({
      summaryCards: {
        totalRequired: summary.totalRequired,
        completed: summary.completed,
        pending: Math.max(summary.totalRequired - summary.completed, 0),
        overallCompletionRate: summary.totalRequired ? Number(((summary.completed / summary.totalRequired) * 100).toFixed(2)) : 0,
      },
      trackingList,
    });
  } catch (error) {
    console.error('Department-head tracking aggregate query failed:', error);
    return res.status(500).json({ message: 'Unable to load evaluation tracking.' });
  }
};

const getDeptHeadPendingEvaluators = async (req, res) => {
  const departmentId = getDepartmentId(req);
  const evaluateeId = Number(req.query.evaluatee_id || 0) || null;
  const targetRole = String(req.query.target_role || 'instructor').toLowerCase();
  if (!departmentId || !evaluateeId || !['instructor', 'lab_assistant'].includes(targetRole)) {
    return res.status(400).json({ message: 'A valid evaluatee_id and target_role are required.' });
  }

  try {
    const includeCompleted = String(req.query.include_completed || '') === '1';
    const targetColumn = targetRole === 'lab_assistant' ? 'ca.lab_assistant_id' : 'ca.instructor_id';
    const evaluationType = targetRole === 'lab_assistant' ? 'lab_assistant_student' : 'student';
    const targetTable = targetRole === 'lab_assistant' ? 'lab_assistants' : 'instructors';
    const [[targetProfile]] = await pool.query(
      `SELECT user_id FROM ${targetTable} WHERE id = ? AND department_id = ? LIMIT 1`,
      [evaluateeId, departmentId]
    );
    if (!targetProfile?.user_id) return res.status(404).json({ message: 'The evaluated staff member was not found.' });
    const [assignedStudentRows] = await pool.query(`
      SELECT DISTINCT
        s.id AS student_db_id,
        s.student_id,
        s.first_name,
        s.last_name,
        TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS student_name,
        c.code AS course_code,
        c.name AS course_name,
        ca.id AS assignment_id,
        ca.year_level,
        ca.section,
        ca.program_type,
        ed.id AS dispatch_id,
        TRIM(CONCAT(COALESCE(target_i.first_name, ''), ' ', COALESCE(target_i.last_name, ''))) AS target_instructor_name,
        CASE WHEN EXISTS (
          SELECT 1
          FROM student_evaluation_submissions ses
          WHERE ses.student_id = s.id
            AND ses.dispatch_id = ed.id
            AND LOWER(COALESCE(ses.status, 'pending')) IN ${COMPLETED_STATUSES}
        ) THEN 'Completed' ELSE 'Pending' END AS status
      FROM course_assignments ca
      INNER JOIN students s ON s.id = ca.student_id
      LEFT JOIN evaluation_dispatches ed
        ON ed.assignment_id = ca.id
       AND ed.student_id = s.id
       AND ed.department_id = ca.department_id
       AND LOWER(COALESCE(ed.evaluation_type, '')) = ?
      LEFT JOIN courses c ON c.id = ca.course_id
      LEFT JOIN instructors target_i ON target_i.id = ca.instructor_id
      WHERE ca.department_id = ?
        AND ${targetColumn} = ?
        AND ca.student_id IS NOT NULL
        AND LOWER(COALESCE(ca.status, 'assigned')) <> 'cancelled'
      ORDER BY ca.year_level ASC, ca.section ASC, student_name ASC, c.code ASC
    `, [evaluationType, departmentId, evaluateeId]);
    const pendingStudentRows = assignedStudentRows.filter((row) => !['submitted', 'completed', 'approved'].includes(String(row.status || '').toLowerCase()));
    const students = includeCompleted ? assignedStudentRows : pendingStudentRows;

    const peerTarget = targetRole === 'lab_assistant'
      ? `ed.target_type = 'lab_assistant' AND ed.target_user_id = ? AND LOWER(COALESCE(ed.evaluation_type, '')) IN ('lab_assistant_peer', 'peer')`
      : 'pe.evaluatee_id = ?';
    const selfExclusion = targetRole === 'lab_assistant'
      ? 'evaluator.user_id <> ?'
      : 'evaluator.id <> ? AND evaluator.user_id <> ?';
    const selfExclusionParams = targetRole === 'lab_assistant'
      ? [targetProfile.user_id]
      : [evaluateeId, targetProfile.user_id];
    const [peers] = await pool.query(`
      SELECT DISTINCT
        evaluator.id AS evaluator_id,
        evaluator.user_id AS user_id,
        pe.id AS peer_id,
        evaluator.first_name,
        evaluator.last_name,
        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(evaluator.first_name, ''), ' ', COALESCE(evaluator.last_name, ''))), ''), evaluator_user.email) AS peer_instructor,
        COALESCE(evaluator.employee_id, evaluator_user.email) AS staff_id,
        evaluator_user.role AS evaluator_role,
        c.code AS course_code,
        TRIM(CONCAT(COALESCE(target_i.first_name, ''), ' ', COALESCE(target_i.last_name, ''))) AS target_instructor_name,
        CASE WHEN EXISTS (
          SELECT 1 FROM peer_evaluation_submissions submitted_pes
          WHERE submitted_pes.peer_evaluation_id = pe.id
            AND LOWER(COALESCE(submitted_pes.status, 'pending')) IN ${COMPLETED_STATUSES}
        ) THEN 'Completed' ELSE 'Pending' END AS submission_status
      FROM peer_evaluations pe
      INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
      INNER JOIN users evaluator_user ON evaluator_user.id = evaluator.user_id
      LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
      LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
      LEFT JOIN courses c ON c.id = ca.course_id
      LEFT JOIN instructors target_i ON target_i.id = pe.evaluatee_id
      WHERE ${peerTarget}
        AND ${selfExclusion}
        AND evaluator.department_id = ?
        AND LOWER(TRIM(COALESCE(evaluator_user.role, ''))) IN ('instructor', 'peer')
        AND LOWER(COALESCE(evaluator_user.status, 'active')) = 'active'
        AND (? = 1 OR NOT EXISTS (
          SELECT 1 FROM peer_evaluation_submissions completed_pes
          WHERE completed_pes.peer_evaluation_id = pe.id
            AND LOWER(COALESCE(completed_pes.status, 'pending')) IN ${COMPLETED_STATUSES}
        ))
      ORDER BY peer_instructor ASC, c.code ASC
    `, [evaluateeId, ...selfExclusionParams, departmentId, includeCompleted ? 1 : 0]);

    const pendingPeers = peers.filter((peer) => !['submitted', 'completed', 'approved'].includes(String(peer.submission_status || '').toLowerCase()));
    return res.json({
      students,
      peers,
      assignedPeers: peers,
      pendingPeers,
      assignedStudentsCount: assignedStudentRows.length,
      pendingStudentsCount: pendingStudentRows.length,
      assignedPeersCount: peers.length,
      pendingPeersCount: pendingPeers.length,
      assignedStudents: assignedStudentRows,
    });
  } catch (error) {
    console.error('Department-head pending evaluator query failed:', error);
    return res.status(500).json({ message: 'Unable to load pending evaluators.', error: error.message });
  }
};

const sendDeptHeadEvaluationReminder = async (req, res) => {
  const bodyDepartmentId = Number(req.body?.department_id ?? req.body?.departmentId ?? 0);
  const departmentId = getDepartmentId(req) ?? (bodyDepartmentId > 0 ? bodyDepartmentId : null);
  const sendToAllPending = req.body?.send_to_all_pending === true || String(req.body?.send_to_all_pending || '').toLowerCase() === 'true';
  const instructorId = Number(req.body?.instructorId ?? req.body?.instructor_id ?? req.body?.evaluatee_id ?? req.body?.target_id ?? req.body?.targetId ?? 0);
  const targetRole = String(req.body?.targetRole || req.body?.target_role || req.body?.role || 'instructor').toLowerCase();
  const audience = String(req.body?.audience || 'all').toLowerCase();

  if (!departmentId) return res.status(403).json({ message: 'Your department is not defined.' });
  if (!['all', 'student', 'peer'].includes(audience)) return res.status(400).json({ message: 'audience must be all, student, or peer.' });

  try {
    const recipients = { student: [], peer: [] };

    if (sendToAllPending) {
      const [students] = await pool.query(`
        SELECT u.id AS user_id, u.email, s.first_name,
          COALESCE(NULLIF(TRIM(CONCAT(s.first_name, ' ', s.last_name)), ''), u.email) AS name,
          COUNT(DISTINCT ed.id) AS pending_count
        FROM students s
        INNER JOIN users u ON u.id = s.user_id
        INNER JOIN evaluation_dispatches ed ON ed.student_id = s.id
        LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
        LEFT JOIN instructors i ON i.id = ca.instructor_id
        LEFT JOIN lab_assistants la ON la.id = ca.lab_assistant_id
        LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
        WHERE s.department_id = ?
          AND LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active', 'published')
          AND (ses.id IS NULL OR LOWER(COALESCE(ses.status, 'pending')) NOT IN ('submitted', 'completed', 'approved'))
        GROUP BY u.id, u.email, s.first_name, s.last_name
      `, [departmentId]);

      const [peers] = await pool.query(`
        SELECT DISTINCT u.id AS user_id, u.email,
          COALESCE(NULLIF(TRIM(CONCAT(i.first_name, ' ', i.last_name)), ''), u.email) AS name,
          COALESCE(NULLIF(TRIM(CONCAT(target.first_name, ' ', target.last_name)), ''), NULLIF(TRIM(CONCAT(lab_target.first_name, ' ', lab_target.last_name)), ''), 'the assigned instructor') AS instructor_name
        FROM peer_evaluations pe
        INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
        INNER JOIN users u ON u.id = evaluator.user_id
        LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
        LEFT JOIN instructors target ON target.id = pe.evaluatee_id
        LEFT JOIN lab_assistants lab_target ON lab_target.id = ed.target_user_id AND LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant'
        LEFT JOIN instructors i ON i.user_id = u.id
        LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
        WHERE COALESCE(target.department_id, lab_target.department_id) = ?
          AND LOWER(COALESCE(pe.status, 'pending')) IN ('pending', 'active')
          AND (pes.id IS NULL OR LOWER(COALESCE(pes.status, 'pending')) NOT IN ('submitted', 'completed', 'approved'))
      `, [departmentId]);

      if (audience === 'all' || audience === 'student') recipients.student = students;
      if (audience === 'all' || audience === 'peer') recipients.peer = peers;
    } else {
      if (!Number.isInteger(instructorId) || instructorId <= 0 || !['instructor', 'lab_assistant'].includes(targetRole)) {
        return res.status(400).json({ message: 'A valid instructorId and targetRole are required.' });
      }

      const targetTable = targetRole === 'lab_assistant' ? 'lab_assistants' : 'instructors';
      const [[target]] = await pool.query(
        `SELECT id, TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS name
         FROM ${targetTable} WHERE id = ? AND department_id = ? LIMIT 1`,
        [instructorId, departmentId]
      );
      if (!target) return res.status(404).json({ message: 'Instructor was not found in your department.' });

      if (audience === 'all' || audience === 'student') {
        const studentType = targetRole === 'lab_assistant' ? 'lab_assistant_student' : 'student';
        const targetClause = targetRole === 'lab_assistant'
          ? '(ca.lab_assistant_id = ? OR (ed.target_type = \'lab_assistant\' AND ed.target_user_id = ?))'
          : 'ca.instructor_id = ?';
        const targetParams = targetRole === 'lab_assistant' ? [instructorId, instructorId] : [instructorId];
        const [students] = await pool.query(`
          SELECT u.id AS user_id, u.email, s.first_name,
            TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS name
            , COUNT(DISTINCT ed.id) AS pending_count
          FROM evaluation_dispatches ed
          INNER JOIN students s ON s.id = ed.student_id
          INNER JOIN users u ON u.id = s.user_id
          LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
          WHERE ed.department_id = ? AND LOWER(COALESCE(ed.evaluation_type, '')) = ?
            AND ${targetClause}
            AND LOWER(COALESCE(u.status, 'active')) = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM student_evaluation_submissions ses
              WHERE ses.dispatch_id = ed.id
                AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
            )
          GROUP BY u.id, u.email, s.first_name, s.last_name
        `, [departmentId, studentType, ...targetParams]);
        recipients.student = students;
      }

      if (audience === 'all' || audience === 'peer') {
        const [peers] = await pool.query(`
          SELECT DISTINCT u.id AS user_id, u.email,
            COALESCE(NULLIF(TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))), ''), u.email) AS name
          FROM peer_evaluations pe
          INNER JOIN users u ON u.id = pe.evaluator_id
          LEFT JOIN instructors i ON i.user_id = u.id
          LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
          WHERE pe.evaluatee_id = ?
            AND LOWER(COALESCE(u.status, 'active')) = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM peer_evaluation_submissions completed_pes
              WHERE completed_pes.peer_evaluation_id = pe.id
                AND LOWER(COALESCE(completed_pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
            )
        `, [instructorId]);
        recipients.peer = peers;
      }
    }

    const allRecipients = [...recipients.student, ...recipients.peer];
    if (!allRecipients.length) return res.json({ success: true, sent: 0, students: 0, peers: 0, message: 'No pending evaluators were found.' });

    const targetName = (sendToAllPending ? 'the assigned evaluation targets' : req.body?.target_name || req.body?.instructor_name || 'the assigned instructor');

    if (recipients.student.length) {
      await createNotifications({
        userIds: recipients.student.map((recipient) => recipient.user_id),
        title: 'Pending Evaluation Reminder',
        message: `Please complete your pending student evaluation for ${targetName}.`,
        type: 'evaluation_reminder',
      });
    }
    if (recipients.peer.length) {
      await createNotifications({
        userIds: recipients.peer.map((recipient) => recipient.user_id),
        title: 'Peer Evaluation Reminder',
        message: `Please complete your pending peer evaluation for ${targetName}.`,
        type: 'evaluation_reminder',
      });
    }

    try {
      const emailTransport = createEmailTransporter();
      await verifyEmailTransporter(emailTransport.transporter);
      for (const recipient of allRecipients) {
        if (!recipient.email) continue;
        await emailTransport.transporter.sendMail({
          from: emailTransport.config.from,
          to: recipient.email,
          subject: 'IPES Evaluation Reminder',
          text: `Please complete your pending evaluation for ${targetName}.`,
        });
      }
      emailTransport.transporter.close();
    } catch (emailError) {
      console.error('Department-head evaluation reminder email failed:', emailError?.message || emailError);
    }

    const urgentStudentRecipients = await getStudentReminderRecipients({
      departmentId,
      userIds: recipients.student.map((recipient) => Number(recipient.user_id)),
    });
    const studentTelegramResults = await Promise.allSettled(urgentStudentRecipients.map((recipient) =>
      sendTelegramReminder(
        recipient.telegram_chat_id,
        recipient.name,
        recipient.pending_count,
        recipient.pending_courses
      )
    ));
    const peerTelegramReminder = `🔔 የእኩዮች ምዘና ማሳሰቢያ። እባክዎ ለ${targetName} የተመደበልዎትን ምዘና ከመጨረሻ ቀኑ በፊት ያጠናቁ።`;
    const peerTelegramResults = await Promise.allSettled(recipients.peer.map((recipient) =>
      sendTelegramNotification(recipient.user_id, peerTelegramReminder)
    ));
    const telegramResults = [...studentTelegramResults, ...peerTelegramResults];
    const telegramSent = telegramResults.filter((result) =>
      result.status === 'fulfilled' && (result.value === true || result.value?.success)
    ).length;
    const telegramFailed = studentTelegramResults.filter((result) =>
      result.status === 'rejected' || result.value === false
    ).length + peerTelegramResults.filter((result) => result.status === 'rejected').length;
    const telegramSkipped = peerTelegramResults.filter((result) =>
      result.status === 'fulfilled' && !result.value?.success
    ).length;

    return res.json({
      success: true,
      sent: allRecipients.length,
      telegramSent,
      telegramFailed,
      telegramSkipped,
      students: recipients.student.length,
      peers: recipients.peer.length,
      allPending: sendToAllPending,
    });
  } catch (error) {
    console.error('Department-head evaluation reminder failed:', error);
    return res.status(500).json({ message: 'Unable to send evaluation reminders.' });
  }
};

module.exports = { getDeptHeadEvaluationTracking, getDeptHeadPendingEvaluators, sendDeptHeadEvaluationReminder };
