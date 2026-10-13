const pool = require('../config/db');
const { createNotifications } = require('./notificationController');
const { sendTelegramNotification } = require('../telegram-bot/src/services/notificationService');
const { createEmailTransporter, verifyEmailTransporter } = require('../services/emailService');
const {
  buildEvaluationReminderMessage,
  buildStudentEvaluationReminderMessage,
  buildInstructorPeerReminderMessage,
} = require('../utils/evaluationReminderMessage');

const COMPLETED_STATUSES = "('submitted', 'completed', 'approved')";

const buildReminderForRecipient = (recipient, fallbackTargetName) => {
  const role = String(recipient.role || '').trim().toLowerCase();
  const userType = String(recipient.userType || '').trim().toLowerCase();
  const messageOptions = {
    name: recipient.name,
    pendingCount: recipient.pending_count,
    pendingItems: recipient.pending_items,
    targetName: recipient.instructor_name || fallbackTargetName,
  };

  if (role === 'student' || (!role && userType === 'student')) {
    return buildStudentEvaluationReminderMessage(messageOptions);
  }
  if (role === 'instructor' || userType === 'peer') {
    return buildInstructorPeerReminderMessage(messageOptions);
  }
  return buildEvaluationReminderMessage(messageOptions);
};

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
      const targetId = Number(target.evaluatee_id);
      const targetUserId = Number(target.user_id);
      const targetClause = isLabAssistant
        ? `(ca.lab_assistant_id = ? OR (LOWER(COALESCE(ca.assigned_role, '')) = 'lab_assistant' AND ca.staff_id IN (?, ?)) OR EXISTS (SELECT 1 FROM evaluation_dispatches target_ed WHERE target_ed.assignment_id = ca.id AND LOWER(COALESCE(target_ed.target_type, '')) = 'lab_assistant' AND target_ed.target_user_id IN (?, ?)))`
        : `(${targetColumn} = ? OR (LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'instructor' AND ca.staff_id = ?))`;
      const targetParams = isLabAssistant
        ? [targetId, targetId, targetUserId, targetId, targetUserId]
        : [targetId, targetId];
      const studentTypeFilter = isLabAssistant
        ? "IN ('lab_assistant_student', 'student')"
        : "= 'student'";
      const [[student]] = await pool.query(`
        SELECT COUNT(DISTINCT s.id) AS total,
          COUNT(DISTINCT CASE WHEN EXISTS (
            SELECT 1
            FROM evaluation_dispatches submitted_ed
            INNER JOIN student_evaluation_submissions submitted_ses ON submitted_ses.dispatch_id = submitted_ed.id
            WHERE (submitted_ed.student_id = s.id OR submitted_ed.student_id IS NULL)
              AND submitted_ed.assignment_id = ca.id
              AND LOWER(COALESCE(submitted_ed.evaluation_type, '')) ${studentTypeFilter}
              AND LOWER(COALESCE(submitted_ses.status, 'pending')) IN (?, ?, ?)
              AND (submitted_ses.student_id = s.id OR (submitted_ses.student_id IS NULL AND submitted_ed.student_id = s.id))
          ) OR EXISTS (
            SELECT 1
            FROM student_evaluations submitted_se
            WHERE submitted_se.student_id = s.id
              AND submitted_se.course_id = ca.course_id
              AND submitted_se.target_user_id = ?
              AND LOWER(COALESCE(submitted_se.target_type, 'instructor')) = ?
              AND LOWER(COALESCE(submitted_se.status, 'pending')) IN (?, ?, ?)
          ) THEN s.id END) AS completed
        FROM course_assignments ca
        LEFT JOIN students s ON s.id = ca.student_id
          OR (ca.student_id IS NULL
            AND (
              (s.department_id = ca.department_id
                AND LOWER(COALESCE(s.year_level, '')) = LOWER(COALESCE(ca.year_level, ''))
                AND LOWER(COALESCE(s.section, '')) = LOWER(COALESCE(ca.section, ''))
                AND (ca.program_type IS NULL OR LOWER(COALESCE(s.program_type, '')) = LOWER(ca.program_type)))
              OR EXISTS (
                SELECT 1 FROM evaluation_dispatches mapped_ed
                WHERE mapped_ed.assignment_id = ca.id AND mapped_ed.student_id = s.id
              )
              OR EXISTS (
                SELECT 1 FROM student_evaluations mapped_se
                WHERE mapped_se.student_id = s.id
                  AND mapped_se.course_id = ca.course_id
                  AND mapped_se.target_user_id = ?
                  AND LOWER(COALESCE(mapped_se.target_type, 'instructor')) = ?
              )
            ))
        WHERE ${targetClause}
          AND LOWER(COALESCE(ca.status, 'assigned')) <> 'cancelled'
          AND (? = '' OR LOWER(COALESCE(ca.academic_year, '')) = LOWER(?))
          AND (? = '' OR LOWER(REPLACE(COALESCE(ca.section, ''), 'Section ', '')) = LOWER(?))
          AND (? = '' OR LOWER(COALESCE(ca.program_type, '')) = LOWER(?))
      `, [completedStatuses[0], completedStatuses[1], completedStatuses[2], targetUserId, isLabAssistant ? 'lab_assistant' : 'instructor', ...completedStatuses, targetUserId, isLabAssistant ? 'lab_assistant' : 'instructor', ...targetParams, academicYear || '', academicYear || '', section || '', section || '', program || '', program || '']);
      const peerTarget = isLabAssistant
        ? "((LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant' AND ed.target_user_id IN (?, ?)) OR pe.evaluatee_id = ?)"
        : "(pe.evaluatee_id = ? OR (ed.target_type = 'instructor' AND ed.target_user_id IN (?, ?)))";
      const peerTargetParams = isLabAssistant
        ? [targetId, targetUserId, targetId]
        : [targetId, targetId, targetUserId];
      const peerEvaluatorRoleFilter = isLabAssistant
        ? "LOWER(TRIM(COALESCE(evaluator_user.role, ''))) = 'lab_assistant'"
        : '1 = 1';
      const [[peer]] = await pool.query(`
        SELECT COUNT(DISTINCT pe.id) AS total,
          COUNT(DISTINCT CASE WHEN LOWER(COALESCE(pes.status, 'pending')) IN (?, ?, ?)
            OR LOWER(COALESCE(pe.status, 'pending')) IN (?, ?, ?) THEN pe.id END) AS completed
        FROM peer_evaluations pe
        LEFT JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
        LEFT JOIN users evaluator_user ON evaluator_user.id = COALESCE(pe.evaluator_user_id, evaluator.user_id)
        LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
        LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
        WHERE ${peerTarget}
          AND ${peerEvaluatorRoleFilter}
          AND LOWER(COALESCE(evaluator_user.status, 'active')) = 'active'
          AND (? = '' OR LOWER(COALESCE(ed.academic_year, '')) = LOWER(?))
      `, [...completedStatuses, ...completedStatuses, ...peerTargetParams, academicYear || '', academicYear || '']);
      const [[pendingPeerDispatches]] = isLabAssistant
        ? await pool.query(`
          SELECT COUNT(DISTINCT ed.id) AS total
          FROM evaluation_dispatches ed
          INNER JOIN users evaluator_user ON evaluator_user.id = ed.created_by
          WHERE LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant'
            AND ed.target_user_id IN (?, ?)
            AND LOWER(COALESCE(ed.evaluation_type, '')) IN ('lab_assistant_peer', 'peer')
            AND evaluator_user.id <> ?
            AND LOWER(TRIM(COALESCE(evaluator_user.role, ''))) = 'lab_assistant'
            AND LOWER(COALESCE(evaluator_user.status, 'active')) = 'active'
            AND NOT EXISTS (SELECT 1 FROM peer_evaluations assigned_pe WHERE assigned_pe.dispatch_id = ed.id)
            AND (? = '' OR LOWER(COALESCE(ed.academic_year, '')) = LOWER(?))
        `, [targetId, targetUserId, targetUserId, academicYear || '', academicYear || ''])
        : [[{ total: 0 }]];
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
      const peerTotal = Number(peer?.total || 0) + Number(pendingPeerDispatches?.total || 0);
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
    const targetClause = targetRole === 'lab_assistant'
      ? "(ca.lab_assistant_id = ? OR (LOWER(COALESCE(ca.assigned_role, '')) = 'lab_assistant' AND ca.staff_id IN (?, ?)) OR EXISTS (SELECT 1 FROM evaluation_dispatches target_ed WHERE target_ed.assignment_id = ca.id AND LOWER(COALESCE(target_ed.target_type, '')) = 'lab_assistant' AND target_ed.target_user_id IN (?, ?)))"
      : `(${targetColumn} = ? OR (LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'instructor' AND ca.staff_id = ?))`;
    const evaluationTypeFilter = targetRole === 'lab_assistant'
      ? "IN ('lab_assistant_student', 'student')"
      : "= 'student'";
    const targetTable = targetRole === 'lab_assistant' ? 'lab_assistants' : 'instructors';
    const [[targetProfile]] = await pool.query(
      `SELECT user_id FROM ${targetTable} WHERE id = ? AND department_id = ? LIMIT 1`,
      [evaluateeId, departmentId]
    );
    if (!targetProfile?.user_id) return res.status(404).json({ message: 'The evaluated staff member was not found.' });
    const targetParams = targetRole === 'lab_assistant'
      ? [evaluateeId, evaluateeId, targetProfile.user_id, evaluateeId, targetProfile.user_id]
      : [evaluateeId, evaluateeId];
    const [assignedStudentRows] = await pool.query(`
      SELECT DISTINCT
        s.id AS student_db_id,
        s.student_id,
        s.first_name,
        s.last_name,
        TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS student_name,
        student_user.id AS user_id,
        student_user.email,
        c.code AS course_code,
        c.name AS course_name,
        ca.id AS assignment_id,
        ca.year_level,
        ca.section,
        ca.program_type,
        ed.id AS dispatch_id,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(target_la.first_name, ''), ' ', COALESCE(target_la.last_name, ''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(target_i.first_name, ''), ' ', COALESCE(target_i.last_name, ''))), '')
        ) AS target_instructor_name,
        CASE WHEN EXISTS (
          SELECT 1
          FROM student_evaluation_submissions ses
          WHERE ses.dispatch_id = ed.id
            AND (ses.student_id = s.id OR (ses.student_id IS NULL AND ed.student_id = s.id))
            AND LOWER(COALESCE(ses.status, 'pending')) IN ${COMPLETED_STATUSES}
        ) OR EXISTS (
          SELECT 1 FROM student_evaluations completed_se
          WHERE completed_se.student_id = s.id
            AND completed_se.course_id = ca.course_id
            AND completed_se.target_user_id = ?
            AND LOWER(COALESCE(completed_se.target_type, 'instructor')) = ?
            AND LOWER(COALESCE(completed_se.status, 'pending')) IN ${COMPLETED_STATUSES}
        ) THEN 'Completed' ELSE 'Pending' END AS status
      FROM course_assignments ca
      INNER JOIN students s ON (
        s.id = ca.student_id
        OR (ca.student_id IS NULL
          AND (
            (s.department_id = ca.department_id
              AND LOWER(COALESCE(s.year_level, '')) = LOWER(COALESCE(ca.year_level, ''))
              AND LOWER(COALESCE(s.section, '')) = LOWER(COALESCE(ca.section, ''))
              AND (ca.program_type IS NULL OR LOWER(COALESCE(s.program_type, '')) = LOWER(ca.program_type)))
            OR EXISTS (
              SELECT 1 FROM evaluation_dispatches mapped_ed
              WHERE mapped_ed.assignment_id = ca.id AND mapped_ed.student_id = s.id
            )
            OR EXISTS (
              SELECT 1 FROM student_evaluations mapped_se
              WHERE mapped_se.student_id = s.id
                AND mapped_se.course_id = ca.course_id
                AND mapped_se.target_user_id = ?
                AND LOWER(COALESCE(mapped_se.target_type, 'instructor')) = ?
            )
          ))
      )
      INNER JOIN users student_user ON student_user.id = s.user_id
      LEFT JOIN evaluation_dispatches ed
        ON ed.assignment_id = ca.id
       AND (ed.student_id = s.id OR ed.student_id IS NULL)
       AND LOWER(COALESCE(ed.evaluation_type, '')) ${evaluationTypeFilter}
      LEFT JOIN courses c ON c.id = ca.course_id
      LEFT JOIN instructors target_i ON target_i.id = ca.instructor_id
      LEFT JOIN lab_assistants target_la ON target_la.id = ca.lab_assistant_id
        OR (LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant' AND target_la.user_id = ed.target_user_id)
      WHERE ${targetClause}
        AND LOWER(COALESCE(student_user.status, 'active')) = 'active'
        AND LOWER(COALESCE(ca.status, 'assigned')) <> 'cancelled'
      ORDER BY ca.year_level ASC, ca.section ASC, student_name ASC, c.code ASC
    `, [targetProfile.user_id, targetRole, targetProfile.user_id, targetRole, ...targetParams]);
    const pendingStudentRows = assignedStudentRows.filter((row) => !['submitted', 'completed', 'approved'].includes(String(row.status || '').toLowerCase()));
    const students = includeCompleted ? assignedStudentRows : pendingStudentRows;

    const peerTarget = targetRole === 'lab_assistant'
      ? `((LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant' AND ed.target_user_id IN (?, ?)) OR pe.evaluatee_id = ?) AND (ed.id IS NULL OR LOWER(COALESCE(ed.evaluation_type, '')) IN ('lab_assistant_peer', 'peer'))`
      : "(pe.evaluatee_id = ? OR (ed.target_type = 'instructor' AND ed.target_user_id IN (?, ?)))";
    const peerTargetParams = targetRole === 'lab_assistant'
      ? [evaluateeId, targetProfile.user_id, evaluateeId]
      : [evaluateeId, evaluateeId, targetProfile.user_id];
    const selfExclusion = 'evaluator_user.id <> ?';
    const selfExclusionParams = [targetProfile.user_id];
    const peerEvaluatorRoleFilter = targetRole === 'lab_assistant'
      ? "LOWER(TRIM(COALESCE(evaluator_user.role, ''))) = 'lab_assistant'"
      : '1 = 1';
    const [peers] = await pool.query(`
      SELECT DISTINCT
        evaluator.id AS evaluator_id,
        evaluator_user.id AS user_id,
        pe.id AS peer_id,
        COALESCE(evaluator.first_name, evaluator_la.first_name) AS first_name,
        COALESCE(evaluator.last_name, evaluator_la.last_name) AS last_name,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(evaluator.first_name, ''), ' ', COALESCE(evaluator.last_name, ''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(evaluator_la.first_name, ''), ' ', COALESCE(evaluator_la.last_name, ''))), ''),
          evaluator_user.email
        ) AS peer_instructor,
        COALESCE(evaluator.employee_id, evaluator_la.employee_id, evaluator_user.email) AS staff_id,
        evaluator_user.role AS evaluator_role,
        c.code AS course_code,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(target_i.first_name, ''), ' ', COALESCE(target_i.last_name, ''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(target_la.first_name, ''), ' ', COALESCE(target_la.last_name, ''))), '')
        ) AS target_instructor_name,
        CASE WHEN EXISTS (
          SELECT 1 FROM peer_evaluation_submissions submitted_pes
          WHERE submitted_pes.peer_evaluation_id = pe.id
            AND LOWER(COALESCE(submitted_pes.status, 'pending')) IN ${COMPLETED_STATUSES}
        ) OR LOWER(COALESCE(pe.status, 'pending')) IN ${COMPLETED_STATUSES} THEN 'Completed' ELSE 'Pending' END AS submission_status
      FROM peer_evaluations pe
        LEFT JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
        LEFT JOIN users evaluator_user ON evaluator_user.id = COALESCE(pe.evaluator_user_id, evaluator.user_id)
        LEFT JOIN lab_assistants evaluator_la ON evaluator_la.user_id = evaluator_user.id
      LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
      LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
      LEFT JOIN courses c ON c.id = COALESCE(ca.course_id, pe.course_id)
      LEFT JOIN instructors target_i ON target_i.id = pe.evaluatee_id
        LEFT JOIN lab_assistants target_la ON (target_la.id = ed.target_user_id OR target_la.user_id = ed.target_user_id) AND LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant'
      WHERE ${peerTarget}
        AND ${selfExclusion}
        AND ${peerEvaluatorRoleFilter}
        AND LOWER(COALESCE(evaluator_user.status, 'active')) = 'active'
        AND (? = 1 OR NOT EXISTS (
          SELECT 1 FROM peer_evaluation_submissions completed_pes
          WHERE completed_pes.peer_evaluation_id = pe.id
            AND LOWER(COALESCE(completed_pes.status, 'pending')) IN ${COMPLETED_STATUSES}
        ))
      ORDER BY peer_instructor ASC, c.code ASC
    `, [...peerTargetParams, ...selfExclusionParams, includeCompleted ? 1 : 0]);

    if (targetRole === 'lab_assistant') {
      const [pendingDispatchPeers] = await pool.query(`
        SELECT DISTINCT
          evaluator.id AS evaluator_id,
          evaluator_user.id AS user_id,
          ed.id AS peer_id,
          COALESCE(evaluator.first_name, evaluator_la.first_name) AS first_name,
          COALESCE(evaluator.last_name, evaluator_la.last_name) AS last_name,
          COALESCE(
            NULLIF(TRIM(CONCAT(COALESCE(evaluator.first_name, ''), ' ', COALESCE(evaluator.last_name, ''))), ''),
            NULLIF(TRIM(CONCAT(COALESCE(evaluator_la.first_name, ''), ' ', COALESCE(evaluator_la.last_name, ''))), ''),
            evaluator_user.email
          ) AS peer_instructor,
          COALESCE(evaluator.employee_id, evaluator_la.employee_id, evaluator_user.email) AS staff_id,
          evaluator_user.role AS evaluator_role,
          COALESCE(ed.course_code, c.code) AS course_code,
          COALESCE(
            NULLIF(TRIM(CONCAT(COALESCE(target_la.first_name, ''), ' ', COALESCE(target_la.last_name, ''))), ''),
            NULLIF(TRIM(CONCAT(COALESCE(ed.target_first_name, ''), ' ', COALESCE(ed.target_last_name, ''))), '')
          ) AS target_instructor_name,
          'Pending' AS submission_status
        FROM evaluation_dispatches ed
        INNER JOIN users evaluator_user ON evaluator_user.id = ed.created_by
        LEFT JOIN instructors evaluator ON evaluator.user_id = evaluator_user.id
        LEFT JOIN lab_assistants evaluator_la ON evaluator_la.user_id = evaluator_user.id
        LEFT JOIN lab_assistants target_la
          ON (target_la.id = ed.target_user_id OR target_la.user_id = ed.target_user_id)
         AND LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant'
        LEFT JOIN courses c ON c.id = ed.course_id
        WHERE LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant'
          AND ed.target_user_id IN (?, ?)
          AND LOWER(COALESCE(ed.evaluation_type, '')) IN ('lab_assistant_peer', 'peer')
          AND ed.created_by <> ?
          AND LOWER(TRIM(COALESCE(evaluator_user.role, ''))) = 'lab_assistant'
          AND LOWER(COALESCE(evaluator_user.status, 'active')) = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM peer_evaluations assigned_pe WHERE assigned_pe.dispatch_id = ed.id
          )
        ORDER BY peer_instructor ASC, course_code ASC
      `, [evaluateeId, targetProfile.user_id, targetProfile.user_id]);
      peers.push(...pendingDispatchPeers);
    }

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
  const instructorId = Number(req.body?.instructorId ?? req.body?.instructor_id ?? req.body?.evaluatee_id ?? req.body?.target_id ?? req.body?.targetId ?? 0);
  const targetRole = String(req.body?.targetRole || req.body?.target_role || req.body?.role || 'instructor').toLowerCase();
  const userType = String(req.body?.userType ?? req.body?.user_type ?? '').trim().toLowerCase();
  const rawRecipientUserId = req.body?.recipient_user_id ?? req.body?.userId ?? req.body?.user_id;
  const recipientUserId = rawRecipientUserId == null || String(rawRecipientUserId).trim() === ''
    ? null
    : Number(rawRecipientUserId);
  const audience = String(req.body?.audience || (userType === 'peer' ? 'peer' : userType === 'student' ? 'student' : 'all')).toLowerCase();
  const bulkSummary = req.body?.bulk_summary === true || String(req.body?.bulk_summary || '').toLowerCase() === 'true';
  const sendToAllPending = req.body?.send_to_all_pending === true
    || String(req.body?.send_to_all_pending || '').toLowerCase() === 'true'
    || (recipientUserId !== null && audience === 'peer');
  let targetName = String(req.body?.target_name || req.body?.instructor_name || '').trim();

  if (!departmentId) return res.status(403).json({ message: 'Your department is not defined.' });
  if (!['all', 'student', 'peer'].includes(audience)) return res.status(400).json({ message: 'audience must be all, student, or peer.' });
  if (recipientUserId !== null && (!Number.isInteger(recipientUserId) || recipientUserId <= 0)) {
    return res.status(400).json({ message: 'A valid recipient_user_id is required.' });
  }

  try {
    const recipients = { student: [], peer: [] };

    if (sendToAllPending) {
      const [students] = await pool.query(`
        SELECT u.id AS user_id, u.email, LOWER(TRIM(COALESCE(u.role, ''))) AS role,
          COALESCE(NULLIF(TRIM(CONCAT(s.first_name, ' ', s.last_name)), ''), u.email) AS name,
          COUNT(DISTINCT ed.id) AS pending_count,
          GROUP_CONCAT(DISTINCT CONCAT_WS(' - ',
            NULLIF(c.code, ''), NULLIF(c.name, ''),
            COALESCE(
              NULLIF(TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))), ''),
              NULLIF(TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))), ''),
              NULLIF(TRIM(CONCAT(COALESCE(ed.target_first_name, ''), ' ', COALESCE(ed.target_last_name, ''))), ''),
              'Assigned staff'
            )
          ) ORDER BY c.code SEPARATOR ' | ') AS pending_items
        FROM students s
        INNER JOIN users u ON u.id = s.user_id
        INNER JOIN evaluation_dispatches ed ON ed.student_id = s.id
        LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
        LEFT JOIN instructors i ON i.id = ca.instructor_id
        LEFT JOIN lab_assistants la ON la.id = ca.lab_assistant_id
        LEFT JOIN courses c ON c.id = COALESCE(ed.course_id, ca.course_id)
        WHERE s.department_id = ?
          AND (? = 0 OR u.id = ?)
          AND LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active', 'published')
          AND NOT EXISTS (
            SELECT 1 FROM student_evaluation_submissions completed_ses
            WHERE completed_ses.dispatch_id = ed.id
              AND LOWER(COALESCE(completed_ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
          )
        GROUP BY u.id, u.email, u.role, s.first_name, s.last_name
      `, [departmentId, recipientUserId || 0, recipientUserId || 0]);

      const [peers] = await pool.query(`
        SELECT u.id AS user_id, u.email, LOWER(TRIM(COALESCE(u.role, ''))) AS role,
          COALESCE(
            NULLIF(TRIM(CONCAT(COALESCE(evaluator_profile.first_name, ''), ' ', COALESCE(evaluator_profile.last_name, ''))), ''),
            NULLIF(TRIM(CONCAT(COALESCE(evaluator_lab.first_name, ''), ' ', COALESCE(evaluator_lab.last_name, ''))), ''),
            u.email
          ) AS name,
          COUNT(DISTINCT pe.id) AS pending_count,
          GROUP_CONCAT(DISTINCT CONCAT_WS(' - ',
            COALESCE(
              NULLIF(CONCAT_WS(' ',
                NULLIF(TRIM(CONCAT(COALESCE(target.first_name, ''), ' ', COALESCE(target.last_name, ''))), ''),
                CASE WHEN target_department.id IS NULL THEN NULL ELSE CONCAT('(', COALESCE(NULLIF(target_department.department_name, ''), target_department.name), ')') END
              ), ''),
              NULLIF(CONCAT_WS(' ',
                NULLIF(TRIM(CONCAT(COALESCE(lab_target.first_name, ''), ' ', COALESCE(lab_target.last_name, ''))), ''),
                CASE WHEN target_department.id IS NULL THEN NULL ELSE CONCAT('(', COALESCE(NULLIF(target_department.department_name, ''), target_department.name), ')') END
              ), ''),
              NULLIF(TRIM(CONCAT(COALESCE(ed.target_first_name, ''), ' ', COALESCE(ed.target_last_name, ''))), ''),
              'Assigned staff'
            ),
            'Peer Evaluation'
          ) ORDER BY target.first_name SEPARATOR ' | ') AS pending_items
        FROM peer_evaluations pe
        LEFT JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
        INNER JOIN users u ON u.id = COALESCE(pe.evaluator_user_id, evaluator.user_id)
        LEFT JOIN instructors evaluator_profile ON evaluator_profile.user_id = u.id
        LEFT JOIN lab_assistants evaluator_lab ON evaluator_lab.user_id = u.id
        LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
        LEFT JOIN instructors target ON target.id = pe.evaluatee_id
        LEFT JOIN lab_assistants lab_target ON (lab_target.id = ed.target_user_id OR lab_target.user_id = ed.target_user_id) AND LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant'
        LEFT JOIN departments target_department ON target_department.id = COALESCE(target.department_id, lab_target.department_id)
        WHERE COALESCE(target.department_id, lab_target.department_id) = ?
          AND (? = 0 OR u.id = ?)
          AND LOWER(COALESCE(pe.status, 'pending')) IN ('pending', 'active')
          AND LOWER(COALESCE(u.status, 'active')) = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM peer_evaluation_submissions completed_pes
            WHERE completed_pes.peer_evaluation_id = pe.id
              AND LOWER(COALESCE(completed_pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
          )
        GROUP BY u.id, u.email, u.role, evaluator_profile.first_name, evaluator_profile.last_name, evaluator_lab.first_name, evaluator_lab.last_name
      `, [departmentId, recipientUserId || 0, recipientUserId || 0]);

      if (audience === 'all' || audience === 'student') recipients.student = students.map((student) => ({
        ...student,
        userType: 'student',
        pending_items: String(student.pending_items || '').split(' | ').filter(Boolean),
      }));
      if (audience === 'all' || audience === 'peer') recipients.peer = peers.map((peer) => ({
        ...peer,
        userType: 'peer',
        pending_items: String(peer.pending_items || '').split(' | ').filter(Boolean),
      }));
    } else {
      if (!Number.isInteger(instructorId) || instructorId <= 0 || !['instructor', 'lab_assistant'].includes(targetRole)) {
        return res.status(400).json({ message: 'A valid instructorId and targetRole are required.' });
      }

      const targetTable = targetRole === 'lab_assistant' ? 'lab_assistants' : 'instructors';
      const [[target]] = await pool.query(
        `SELECT id, user_id, TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS name
         FROM ${targetTable} WHERE id = ? AND department_id = ? LIMIT 1`,
        [instructorId, departmentId]
      );
      if (!target) return res.status(404).json({ message: 'Instructor was not found in your department.' });
      const targetUserId = Number(target.user_id);
      targetName = targetName || target.name || 'the assigned staff member';

      if (audience === 'all' || audience === 'student') {
        const studentType = targetRole === 'lab_assistant' ? 'lab_assistant_student' : 'student';
        const targetColumn = targetRole === 'lab_assistant' ? 'ca.lab_assistant_id' : 'ca.instructor_id';
        const targetClause = targetRole === 'lab_assistant'
          ? '(ca.lab_assistant_id = ? OR (LOWER(COALESCE(ca.assigned_role, \'\')) = \'lab_assistant\' AND ca.staff_id IN (?, ?)) OR EXISTS (SELECT 1 FROM evaluation_dispatches target_ed WHERE target_ed.assignment_id = ca.id AND LOWER(COALESCE(target_ed.target_type, \'\')) = \'lab_assistant\' AND target_ed.target_user_id IN (?, ?)))'
          : `(${targetColumn} = ? OR (LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'instructor' AND ca.staff_id = ?))`;
        const targetParams = targetRole === 'lab_assistant'
          ? [instructorId, instructorId, targetUserId, instructorId, targetUserId]
          : [instructorId, instructorId];
        const [students] = await pool.query(`
          SELECT u.id AS user_id, u.email, LOWER(TRIM(COALESCE(u.role, ''))) AS role, s.first_name,
            TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS name,
            COUNT(DISTINCT ca.id) AS pending_count,
            GROUP_CONCAT(DISTINCT CONCAT_WS(' - ', NULLIF(c.code, ''), NULLIF(c.name, '')) ORDER BY c.code SEPARATOR ' | ') AS pending_items
          FROM course_assignments ca
          INNER JOIN students s ON s.id = ca.student_id
            OR (ca.student_id IS NULL AND (
              (s.department_id = ca.department_id
                AND LOWER(COALESCE(s.year_level, '')) = LOWER(COALESCE(ca.year_level, ''))
                AND LOWER(COALESCE(s.section, '')) = LOWER(COALESCE(ca.section, ''))
                AND (ca.program_type IS NULL OR LOWER(COALESCE(s.program_type, '')) = LOWER(ca.program_type)))
              OR EXISTS (SELECT 1 FROM evaluation_dispatches mapped_ed WHERE mapped_ed.assignment_id = ca.id AND mapped_ed.student_id = s.id)
              OR EXISTS (SELECT 1 FROM student_evaluations mapped_se WHERE mapped_se.student_id = s.id AND mapped_se.course_id = ca.course_id AND mapped_se.target_user_id = ? AND LOWER(COALESCE(mapped_se.target_type, 'instructor')) = ?)
            ))
          INNER JOIN users u ON u.id = s.user_id
          LEFT JOIN courses c ON c.id = ca.course_id
          WHERE ${targetClause}
            AND (? = 0 OR u.id = ?)
            AND LOWER(COALESCE(ca.status, 'assigned')) <> 'cancelled'
            AND LOWER(COALESCE(u.status, 'active')) = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM evaluation_dispatches pending_ed
              INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = pending_ed.id
              WHERE pending_ed.assignment_id = ca.id
                AND (pending_ed.student_id = s.id OR pending_ed.student_id IS NULL)
                AND LOWER(COALESCE(pending_ed.evaluation_type, '')) IN (?, ?)
                AND LOWER(COALESCE(ses.status, 'pending')) IN ${COMPLETED_STATUSES}
            )
            AND NOT EXISTS (
              SELECT 1 FROM student_evaluations completed_se
              WHERE completed_se.student_id = s.id
                AND completed_se.course_id = ca.course_id
                AND completed_se.target_user_id = ?
                AND LOWER(COALESCE(completed_se.target_type, 'instructor')) = ?
                AND LOWER(COALESCE(completed_se.status, 'pending')) IN ${COMPLETED_STATUSES}
            )
          GROUP BY u.id, u.email, u.role, s.first_name, s.last_name
        `, [targetUserId, targetRole, ...targetParams, recipientUserId || 0, recipientUserId || 0, studentType, 'student', targetUserId, targetRole]);
        recipients.student = students.map((student) => ({
          ...student,
          userType: 'student',
          pending_items: String(student.pending_items || targetName).split(' | ').map((course) => `${course} - ${targetName}`),
        }));
      }

      if (audience === 'all' || audience === 'peer') {
        const [peers] = await pool.query(`
          SELECT u.id AS user_id, u.email, LOWER(TRIM(COALESCE(u.role, ''))) AS role,
            COALESCE(NULLIF(TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))), ''), NULLIF(TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))), ''), u.email) AS name,
            COUNT(DISTINCT pe.id) AS pending_count,
            GROUP_CONCAT(DISTINCT CONCAT_WS(' - ',
              NULLIF(ed.course_code, ''), NULLIF(c.code, ''),
              NULLIF(ed.course_name, ''), NULLIF(c.name, ''),
              COALESCE(
                NULLIF(TRIM(CONCAT(COALESCE(target.first_name, ''), ' ', COALESCE(target.last_name, ''))), ''),
                NULLIF(TRIM(CONCAT(COALESCE(lab_target.first_name, ''), ' ', COALESCE(lab_target.last_name, ''))), ''),
                ?
              )
            ) ORDER BY COALESCE(c.code, ed.course_code) SEPARATOR ' | ') AS pending_items
          FROM peer_evaluations pe
          LEFT JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
          INNER JOIN users u ON u.id = COALESCE(pe.evaluator_user_id, evaluator.user_id)
          LEFT JOIN instructors i ON i.user_id = u.id
          LEFT JOIN lab_assistants la ON la.user_id = u.id
          LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
          LEFT JOIN instructors target ON target.id = pe.evaluatee_id
          LEFT JOIN lab_assistants lab_target ON (lab_target.id = ed.target_user_id OR lab_target.user_id = ed.target_user_id) AND LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant'
          LEFT JOIN courses c ON c.id = COALESCE(ed.course_id, pe.course_id)
          LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
          WHERE ${targetRole === 'lab_assistant'
            ? "((LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant' AND ed.target_user_id IN (?, ?)) OR pe.evaluatee_id = ?)"
            : "(pe.evaluatee_id = ? OR (ed.target_type = 'instructor' AND ed.target_user_id IN (?, ?)))"}
            AND (? = 0 OR u.id = ?)
            AND LOWER(COALESCE(pe.status, 'pending')) IN ('pending', 'active')
            AND LOWER(COALESCE(u.status, 'active')) = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM peer_evaluation_submissions completed_pes
              WHERE completed_pes.peer_evaluation_id = pe.id
                AND LOWER(COALESCE(completed_pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
            )
          GROUP BY u.id, u.email, u.role, i.first_name, i.last_name, la.first_name, la.last_name
        `, [targetName,
          ...(targetRole === 'lab_assistant' ? [instructorId, targetUserId, instructorId] : [instructorId, instructorId, targetUserId]),
          recipientUserId || 0,
          recipientUserId || 0,
        ]);
        recipients.peer = peers.map((peer) => ({
          ...peer,
          userType: 'peer',
          pending_items: String(peer.pending_items || targetName).split(' | ').filter(Boolean),
        }));
      }
    }

    const allRecipients = [...recipients.student, ...recipients.peer];
    if (!allRecipients.length) {
      if (bulkSummary) {
        return res.status(200).json({ success: true, sentCount: 0, unlinkedCount: 0, message: 'Bulk reminders processed.' });
      }
      return res.json({ success: true, sent: 0, students: 0, peers: 0, message: 'No pending evaluators were found.' });
    }

    if (recipientUserId !== null) {
      const selectedRecipient = allRecipients.find((recipient) => Number(recipient.user_id) === recipientUserId);
      if (!selectedRecipient) {
        return res.status(404).json({ success: false, message: 'No pending evaluation was found for this user.' });
      }
      const [[telegramAccount]] = await pool.query(
        'SELECT telegram_chat_id FROM users WHERE id = ? LIMIT 1',
        [recipientUserId]
      );
      if (!telegramAccount?.telegram_chat_id) {
        return res.status(400).json({
          success: false,
          notLinked: true,
          message: 'User has not linked their Telegram account yet.',
          recipientName: selectedRecipient.name || null,
        });
      }
    }

    targetName = targetName || (sendToAllPending ? 'the assigned evaluation targets' : 'the assigned staff member');

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
      const validRecipients = allRecipients.filter((recipient) => recipient.email && String(recipient.email).trim());
      if (!validRecipients.length) {
        return;
      }
      const emailTransport = createEmailTransporter();
      await verifyEmailTransporter(emailTransport.transporter);
      for (const recipient of validRecipients) {
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

    if (bulkSummary) {
      let sentCount = 0;
      let unlinkedCount = 0;
      const uniqueRecipients = [...new Map(allRecipients.map((recipient) => [Number(recipient.user_id), recipient])).values()];
      for (const recipient of uniqueRecipients) {
        try {
          const result = await sendTelegramNotification(recipient.user_id, buildReminderForRecipient(recipient, targetName));
          if (result?.success) sentCount += 1;
          else if (result?.reason === 'telegram_chat_not_linked') unlinkedCount += 1;
        } catch (telegramError) {
          console.error(`Bulk Telegram reminder failed for user ${recipient.user_id}:`, telegramError?.message || telegramError);
        }
      }

      return res.status(200).json({
        success: true,
        sentCount,
        unlinkedCount,
        message: 'Bulk reminders processed.',
      });
    }

    const studentTelegramResults = await Promise.allSettled(recipients.student.map((recipient) =>
      sendTelegramNotification(recipient.user_id, buildReminderForRecipient(recipient, targetName))
    ));
    const peerTelegramResults = await Promise.allSettled(recipients.peer.map((recipient) =>
      sendTelegramNotification(recipient.user_id, buildReminderForRecipient(recipient, targetName))
    ));
    const telegramResults = [...studentTelegramResults, ...peerTelegramResults];
    const telegramSent = telegramResults.filter((result) =>
      result.status === 'fulfilled' && result.value?.success
    ).length;
    const telegramFailed = telegramResults.filter((result) => result.status === 'rejected').length;
    const telegramSkipped = telegramResults.filter((result) =>
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
