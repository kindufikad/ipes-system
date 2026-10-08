const express = require('express');
const pool = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { calculateLikertPercentage } = require('../utils/likertScoring');
const { sanitizeEvaluationFeedback } = require('../utils/validationUtility');
const { computeEvaluation } = require('../utils/calculateEvaluationScores');

const router = express.Router();

const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isPeerEvaluationOpen = async (departmentId, academicYear, semester) => {
  const [[publication]] = await pool.query(
    `SELECT id FROM peer_evaluation_publications
     WHERE department_id = ? AND academic_year = ? AND semester = ? AND status = 'published'
     LIMIT 1`,
    [departmentId, academicYear, semester]
  );
  if (publication?.id) return true;

  const [[activeForm]] = await pool.query(
    `SELECT id FROM evaluation_forms
     WHERE department_id = ? AND academic_year = ? AND semester = ?
       AND LOWER(COALESCE(form_type, '')) IN ('peer', 'peer_evaluation')
       AND is_published = 1
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     LIMIT 1`,
    [departmentId, academicYear, semester]
  );
  return Boolean(activeForm?.id);
};

const getPeerStaff = async ({ departmentId, excludeUserId }) => {
  const numericDepartmentId = Number(departmentId);
  const numericExcludeUserId = Number(excludeUserId);

  if (!Number.isInteger(numericDepartmentId) || numericDepartmentId <= 0) {
    return [];
  }

  const [rows] = await pool.query(`
        SELECT staff.target_record_id, staff.user_id, staff.first_name, staff.last_name, staff.employee_id, staff.target_role,
          staff.department_id, staff.department_name, staff.college_name,
           CASE WHEN pes.id IS NULL THEN 'pending' ELSE 'completed' END AS evaluation_status,
           pes.id AS submission_id, pes.score AS total_score, pes.strengths, pes.suggestions,
           pes.responses, pes.status AS submission_status
    FROM (
      SELECT la.id AS target_record_id, la.user_id, la.first_name, la.last_name, la.employee_id,
             'lab_assistant' AS target_role, la.department_id,
             COALESCE(NULLIF(d.department_name, ''), d.name, 'N/A') AS department_name,
             c.name AS college_name
      FROM lab_assistants la
      INNER JOIN users u ON u.id = la.user_id
      LEFT JOIN departments d ON d.id = la.department_id
      LEFT JOIN colleges c ON c.id = d.college_id
      WHERE la.department_id = ? AND la.user_id <> ?
        AND LOWER(COALESCE(u.role, 'lab_assistant')) = 'lab_assistant'
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
    ) staff
    LEFT JOIN evaluation_dispatches ed
      ON ed.target_type = staff.target_role AND ed.target_user_id = staff.target_record_id
      AND ed.evaluation_type IN ('peer', 'lab_assistant_peer') AND ed.created_by = ?
    LEFT JOIN peer_evaluations pe ON pe.dispatch_id = ed.id
    LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
    ORDER BY staff.first_name ASC, staff.last_name ASC
  `, [numericDepartmentId, numericExcludeUserId || 0, numericExcludeUserId || 0]);

  return rows || [];
};

// Get lab assistant's own performance dashboard data
router.get('/my-performance', authenticateToken, authorizeRoles('lab_assistant', 'instructor'), async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    let staff = null;
    const [staffRows] = await pool.query(`
      SELECT la.id, la.user_id, la.first_name, la.last_name, la.employee_id, la.department_id,
             COALESCE(NULLIF(d.department_name, ''), d.name, 'N/A') AS department_name
      FROM lab_assistants la
      LEFT JOIN departments d ON d.id = la.department_id
      WHERE la.user_id = ?
      LIMIT 1
    `, [userId]);

    if (staffRows && staffRows.length) {
      staff = staffRows[0];
    } else {
      const [instructorRows] = await pool.query(`
        SELECT i.id, i.user_id, i.first_name, i.last_name, i.employee_id, i.department_id,
               COALESCE(NULLIF(d.department_name, ''), d.name, 'N/A') AS department_name
        FROM instructors i
        LEFT JOIN departments d ON d.id = i.department_id
        WHERE i.user_id = ?
        LIMIT 1
      `, [userId]);
      if (instructorRows.length) staff = instructorRows[0];
    }

    if (!staff) {
      return res.status(200).json({
        success: true,
        department_name: 'N/A',
        performance: {
          student_score: 0,
          peer_score: 0,
          dept_head_score: 0,
          final_score: 0,
          average_score: 0,
          total_evaluations: 0,
          strengths: [],
          improvements: [],
        },
        message: 'No performance records are available yet.'
      });
    }

    const academicYear = String(req.query.academic_year || '').trim();
    const semester = String(req.query.semester || '').trim();

    const [studentRows] = await pool.query(`
      SELECT ses.score, ses.strengths, ses.improvements, ses.feedback
      FROM evaluation_dispatches ed
      LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      WHERE ed.target_type = 'lab_assistant'
        AND ed.target_user_id IN (?, ?)
        AND ed.evaluation_type IN ('student', 'lab_assistant_student')
        AND (? = '' OR ed.academic_year = ?)
        AND (? = '' OR ed.semester = ?)
        AND ses.id IS NOT NULL
      `, [staff.id, userId, academicYear, academicYear, semester, semester]);

    const [peerRows] = await pool.query(`
      SELECT pes.score, pes.strengths, pes.suggestions
      FROM evaluation_dispatches ed
      LEFT JOIN peer_evaluations pe ON pe.dispatch_id = ed.id
      LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
      WHERE ed.target_type = 'lab_assistant'
        AND ed.target_user_id IN (?, ?)
        AND ed.evaluation_type IN ('peer', 'lab_assistant_peer')
        AND (? = '' OR ed.academic_year = ?)
        AND (? = '' OR ed.semester = ?)
        AND pes.id IS NOT NULL
      `, [staff.id, userId, academicYear, academicYear, semester, semester]);

    const [deptHeadRows] = await pool.query(`
      SELECT dhe.total_score AS score, dhe.strengths, dhe.weaknesses AS improvements, dhe.feedback
      FROM dept_head_evaluations dhe
      WHERE dhe.target_role = 'lab_assistant'
        AND (dhe.evaluatee_id IN (?, ?) OR dhe.instructor_id IN (?, ?))
        AND LOWER(COALESCE(dhe.status, 'pending')) IN ('submitted', 'completed', 'approved')
    `, [staff.id, userId, staff.id, userId]);

    const studentScore = studentRows.length
      ? Number((studentRows.reduce((sum, row) => sum + normalizeNumber(row.score), 0) / studentRows.length).toFixed(2))
      : 0;
    const peerScore = peerRows.length
      ? Number((peerRows.reduce((sum, row) => sum + normalizeNumber(row.score), 0) / peerRows.length).toFixed(2))
      : 0;
    const deptHeadScore = deptHeadRows.length
      ? Number((deptHeadRows.reduce((sum, row) => sum + normalizeNumber(row.score), 0) / deptHeadRows.length).toFixed(2))
      : 0;
    const completion = {
      isStudentComplete: studentRows.length > 0,
      isDeptHeadComplete: deptHeadRows.length > 0,
      isPeerComplete: peerRows.length > 0,
    };
    const isComplete = completion.isStudentComplete && completion.isDeptHeadComplete && completion.isPeerComplete;
    const evaluated = computeEvaluation(studentScore, deptHeadScore, peerScore);
    const finalScore = isComplete ? evaluated.totalScore : null;
    const collectFeedback = (values) => [...new Set(values
      .map((value) => sanitizeEvaluationFeedback(value))
      .filter(Boolean))];
    const strengths = collectFeedback([
      ...studentRows.flatMap((row) => [row.strengths, row.feedback]),
      ...peerRows.map((row) => row.strengths),
      ...deptHeadRows.map((row) => row.strengths),
    ]);
    const improvements = collectFeedback([
      ...studentRows.map((row) => row.improvements),
      ...peerRows.map((row) => row.suggestions),
      ...deptHeadRows.flatMap((row) => [row.improvements, row.feedback]),
    ]);

    const departmentName = String(staff.department_name || 'N/A').trim() || 'N/A';
    const response = {
      success: true,
      department_name: departmentName,
      performance: {
        student_score: studentScore,
        peer_score: peerScore,
        dept_head_score: deptHeadScore,
        final_score: finalScore,
        average_score: finalScore,
        total_evaluations: studentRows.length + peerRows.length + deptHeadRows.length,
        strengths,
        improvements,
      },
      studentScore,
      peerScore,
      deptHeadScore,
      totalPerformance: finalScore,
      totalScore: finalScore,
      isComplete,
      statusBadge: isComplete ? 'Completed' : 'Pending Complete Evaluation',
      completion,
      strengths,
      improvements,
    };

    return res.json(response);
  } catch (error) {
    console.error('[ERROR] Lab assistant performance fetch failed:', error);
    return res.status(200).json({
      success: true,
      department_name: 'N/A',
      performance: {
        student_score: 0,
        peer_score: 0,
        dept_head_score: 0,
        final_score: 0,
        average_score: 0,
        total_evaluations: 0,
        strengths: [],
        improvements: [],
      },
      message: 'No performance records are available yet.'
    });
  }
});

// Get peer evaluation targets for lab assistant (other lab assistants in the same department)
router.get('/peer-evaluation-targets', authenticateToken, authorizeRoles('lab_assistant'), async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    let departmentId = Number(req.user?.department_id || 0);

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    if (!departmentId) {
      const [[profile]] = await pool.query(
        'SELECT department_id FROM lab_assistants WHERE user_id = ? LIMIT 1',
        [userId]
      );
      departmentId = Number(profile?.department_id || 0);
      if (departmentId) req.user.department_id = departmentId;
    }

    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({
        success: false,
        evaluations: [],
        isPublished: false,
        message: 'Your department is not assigned yet. Please notify the Department Head to assign your department.'
      });
    }

    const academicYear = String(req.query.academic_year || new Date().getFullYear());
    const semester = String(req.query.semester || 'Semester I');
    if (!await isPeerEvaluationOpen(departmentId, academicYear, semester)) {
      return res.json({ success: true, evaluations: [], pendingCount: 0, isPublished: false, academicYear, semester });
    }

    const peerTargets = await getPeerStaff({ departmentId, excludeUserId: userId });

    const normalized = (peerTargets || []).map((row) => ({
      id: row.user_id,
      target_user_id: row.user_id,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Lab Assistant',
      employee_id: row.employee_id || 'N/A',
      department_name: row.department_name || 'N/A',
      college_name: row.college_name || 'N/A',
      target_role: row.target_role,
      status: row.evaluation_status || 'pending',
      total_score: row.total_score || 0,
      is_evaluated: row.evaluation_status === 'completed',
      submission_id: row.submission_id || null,
      strengths: row.strengths || '',
      suggestions: row.suggestions || '',
      responses: row.responses || {},
      answers: row.responses || {},
      ratings: row.responses || {},
      submission_status: row.submission_status || null,
    }));

    return res.json({
      success: true,
      evaluations: normalized,
      pendingCount: normalized.filter((item) => item.status === 'pending').length,
      isPublished: true,
      academicYear,
      semester,
    });
  } catch (error) {
    console.error('[ERROR] Lab assistant peer targets fetch failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to load peer evaluation targets.',
      error: error.message,
    });
  }
});

router.post('/evaluate-peer', authenticateToken, authorizeRoles('lab_assistant'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const evaluatorId = Number(req.user?.id || req.body?.evaluator_id);
    let evaluatorDepartmentId = Number(req.user?.department_id || 0);
    const academicYear = String(req.body?.academicYear || req.body?.academic_year || new Date().getFullYear()).trim();
    const semester = String(req.body?.semester || 'Semester I').trim();
    const targetEvaluatedId = req.body?.evaluatedId || req.body?.evaluated_id || req.body?.target_user_id;
    const evaluatedId = Number(targetEvaluatedId);
    const ratings = (req.body?.ratings || req.body?.answers) && typeof (req.body?.ratings || req.body?.answers) === 'object'
      ? (req.body.ratings || req.body.answers)
      : {};
    const values = Object.values(ratings).map((value) => String(value).toUpperCase() === 'NA' ? null : Number(value));
    const validRatings = values.length === 19 && values.every((value) => value === null || (Number.isInteger(value) && value >= 1 && value <= 5));

    if (!Number.isInteger(evaluatorId) || evaluatorId <= 0 || !academicYear || !semester || !Number.isInteger(evaluatedId) || evaluatedId <= 0) {
      return res.status(400).json({ success: false, message: 'evaluator_id, evaluated_id, academic_year, and semester are required.' });
    }
    if (!validRatings) {
      return res.status(400).json({ success: false, message: 'All 19 ARA criteria ratings are required.' });
    }

    if (!evaluatorDepartmentId) {
      const [[evaluatorProfile]] = await connection.query(
        'SELECT department_id FROM lab_assistants WHERE user_id = ? LIMIT 1',
        [evaluatorId]
      );
      evaluatorDepartmentId = Number(evaluatorProfile?.department_id || 0);
    }
    if (!evaluatorDepartmentId || !await isPeerEvaluationOpen(evaluatorDepartmentId, academicYear, semester)) {
      return res.status(403).json({ success: false, message: 'Peer evaluation is not currently active for your department.' });
    }

    const targetRole = 'lab_assistant';
    if (String(req.body?.target_role || 'lab_assistant').trim().toLowerCase() !== targetRole) {
      return res.status(400).json({ success: false, message: 'Lab assistants may only evaluate other lab assistants.' });
    }
    const targetTable = targetRole === 'instructor' ? 'instructors' : 'lab_assistants';
    const [targetRows] = await connection.query(`
      SELECT target.id, target.user_id, target.department_id, target.first_name, target.last_name
      FROM ${targetTable} target
      INNER JOIN users u ON u.id = target.user_id
      WHERE (target.id = ? OR target.user_id = ?) AND target.department_id = ?
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
      LIMIT 1
    `, [evaluatedId, evaluatedId, evaluatorDepartmentId]);
    if (!targetRows.length || Number(targetRows[0].user_id) === evaluatorId) {
      return res.status(404).json({ success: false, message: 'The selected Lab Assistant is not available for evaluation.' });
    }

    const target = targetRows[0];
    const [dispatchRows] = await connection.query(`
      SELECT id FROM evaluation_dispatches
      WHERE department_id = ? AND target_type = ? AND target_user_id = ?
        AND created_by = ?
        AND evaluation_type IN ('peer', 'lab_assistant_peer')
        AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'active', 'published', 'submitted')
      ORDER BY id DESC LIMIT 1
    `, [target.department_id, targetRole, target.id, evaluatorId]);

    let dispatchId = dispatchRows[0]?.id;
    await connection.beginTransaction();
    if (!dispatchId) {
      const [dispatchResult] = await connection.query(
        `INSERT INTO evaluation_dispatches
          (department_id, academic_year, semester, evaluation_type, evaluation_template, created_by, status, target_type, target_user_id, target_first_name, target_last_name, target_employee_id, payload)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)` ,
        [target.department_id, academicYear, semester, targetRole === 'instructor' ? 'peer' : 'lab_assistant_peer', targetRole === 'instructor' ? null : 'ARA_PEER_FORM', evaluatorId, targetRole, target.id, target.first_name || '', target.last_name || '', req.body?.target_employee_id || '', JSON.stringify({ source: 'dynamic_peer_evaluation' })]
      );
      dispatchId = dispatchResult.insertId;
    }
    const score = Number(calculateLikertPercentage(ratings).toFixed(2));
    const evaluateeId = null;
    const [existingRows] = await connection.query('SELECT id FROM peer_evaluations WHERE dispatch_id = ? LIMIT 1', [dispatchId]);
    let peerEvaluationId = existingRows[0]?.id;
    if (peerEvaluationId) {
      await connection.query('UPDATE peer_evaluations SET status = \'submitted\' WHERE id = ?', [peerEvaluationId]);
    } else {
      const [result] = await connection.query(
        'INSERT INTO peer_evaluations (evaluator_id, evaluator_user_id, evaluatee_id, course_id, dispatch_id, status) VALUES (NULL, ?, ?, NULL, ?, \'submitted\')',
        [evaluatorId, evaluateeId, dispatchId]
      );
      peerEvaluationId = result.insertId;
    }
    const submissionValues = [score, String(req.body?.strengths || ''), String(req.body?.improvements || req.body?.suggestions || ''), JSON.stringify(ratings), peerEvaluationId, evaluatorId];
    const [existingSubmissionRows] = await connection.query(
      'SELECT id FROM peer_evaluation_submissions WHERE peer_evaluation_id = ? AND evaluator_id = ? LIMIT 1',
      [peerEvaluationId, evaluatorId]
    );
    if (existingSubmissionRows[0]?.id) {
      await connection.query(
        `UPDATE peer_evaluation_submissions
         SET evaluatee_id = ?, score = ?, strengths = ?, suggestions = ?, responses = ?, status = 'submitted'
         WHERE id = ?`,
        [evaluateeId, ...submissionValues.slice(0, 4), existingSubmissionRows[0].id]
      );
    } else {
      await connection.query(
        `INSERT INTO peer_evaluation_submissions (peer_evaluation_id, evaluator_id, evaluatee_id, score, strengths, suggestions, responses, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')`,
        [peerEvaluationId, evaluatorId, evaluateeId, ...submissionValues.slice(0, 4)]
      );
    }
    await connection.query('UPDATE evaluation_dispatches SET status = \'submitted\' WHERE id = ?', [dispatchId]);
    await connection.commit();
    return res.status(201).json({ success: true, id: peerEvaluationId, score });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('ARA peer rollback failed:', rollbackError); }
    console.error('Peer Evaluation Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
