const pool = require('../config/db');
const { createNotifications } = require('./notificationController');
const { validateEvaluationFeedbackPair } = require('../utils/validationUtility');
const { calculateAndSaveInstructorResult } = require('../utils/evaluationCalculator');
const { calculateLikertPercentage } = require('../utils/likertScoring');

const ACADEMIC_DIRECTORATE_RATING_KEYS = [
  'leadership',
  'strategic_planning',
  'academic_quality',
  'stakeholder_engagement',
  'accountability',
];

exports.getAcademicDirectorateCandidates = async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS evaluation_periods (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      academic_year VARCHAR(64) NOT NULL,
      semester VARCHAR(64) NOT NULL,
      deadline DATETIME NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      updated_by INT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_evaluation_period_term (academic_year, semester),
      INDEX idx_evaluation_period_status (status, deadline)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [rows] = await pool.query(`
      SELECT u.id AS academic_directorate_id,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', i.first_name, i.last_name)), ''), u.email) AS full_name,
        u.email, u.role,
        i.employee_id,
        COALESCE(d.department_name, d.name) AS department_name,
        c.name AS college_name,
        active_period.academic_year,
        active_period.semester,
        active_period.deadline,
        evaluation.id AS evaluation_id,
        evaluation.status AS evaluation_status,
        evaluation.score AS evaluation_score,
        evaluation.weighted_score,
        evaluation.ratings,
        evaluation.strengths,
        evaluation.weaknesses
      FROM users u
      LEFT JOIN instructors i ON i.user_id = u.id
      LEFT JOIN departments d ON d.id = i.department_id
      LEFT JOIN colleges c ON c.id = d.college_id
      LEFT JOIN (
        SELECT academic_year, semester, deadline
        FROM evaluation_periods
        WHERE LOWER(status) = 'active'
        ORDER BY id DESC
        LIMIT 1
      ) active_period ON 1 = 1
      LEFT JOIN vice_president_evaluations evaluation
        ON evaluation.academic_directorate_id = u.id AND evaluation.evaluator_id = ?
      WHERE LOWER(u.role) IN ('academic_directorate', 'academic_director', 'directorate')
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
      ORDER BY full_name ASC
    `, [req.user.id]);
    return res.json(rows);
  } catch (error) {
    console.error('Unable to load Academic Directorate candidates:', error);
    return res.status(500).json({ message: 'Unable to load Academic Directorate candidates.' });
  }
};

exports.getVicePresidentAcademicDirectorateEvaluations = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT e.id, e.academic_directorate_id, e.ratings, e.score, e.weighted_score,
        e.strengths, e.weaknesses, e.status, e.created_at, e.updated_at,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', target_i.first_name, target_i.last_name)), ''), target.email) AS full_name,
        target.email
      FROM vice_president_evaluations e
      INNER JOIN users target ON target.id = e.academic_directorate_id
      LEFT JOIN instructors target_i ON target_i.user_id = target.id
      WHERE e.evaluator_id = ?
      ORDER BY e.updated_at DESC, e.id DESC
    `, [req.user.id]);
    return res.json(rows);
  } catch (error) {
    console.error('Unable to load Vice President evaluations:', error);
    return res.status(500).json({ message: 'Unable to load previous evaluations.' });
  }
};

exports.evaluateAcademicDirectorate = async (req, res) => {
  const academicDirectorateId = Number(req.body?.academic_directorate_id || 0);
  const ratings = req.body?.ratings;
  const strengths = String(req.body?.strengths || '').trim();
  const weaknesses = String(req.body?.weaknesses || '').trim();

  if (!Number.isInteger(academicDirectorateId) || academicDirectorateId <= 0) {
    return res.status(400).json({ message: 'Select an Academic Directorate candidate.' });
  }
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)
    || ACADEMIC_DIRECTORATE_RATING_KEYS.some((key) => {
      const value = ratings[key];
      return value !== 'NA' && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 5);
    })
    || ACADEMIC_DIRECTORATE_RATING_KEYS.every((key) => ratings[key] === 'NA')) {
    return res.status(400).json({ message: 'Rate each criterion from 1 to 5 or mark it NA; at least one criterion must have a numeric rating.' });
  }

  try {
    const [[candidate]] = await pool.query(
      `SELECT id FROM users
       WHERE id = ? AND LOWER(role) IN ('academic_directorate', 'academic_director', 'directorate')
         AND LOWER(COALESCE(status, 'active')) = 'active'
       LIMIT 1`,
      [academicDirectorateId]
    );
    if (!candidate) return res.status(404).json({ message: 'Active Academic Directorate candidate not found.' });

    const values = ACADEMIC_DIRECTORATE_RATING_KEYS
      .map((key) => ratings[key])
      .filter((value) => value !== 'NA')
      .map(Number);
    const score = Number(((values.reduce((sum, value) => sum + value, 0) / (values.length * 5)) * 100).toFixed(2));
    const weightedScore = Number((score * 0.3).toFixed(2));
    await pool.query(
      `INSERT INTO vice_president_evaluations
        (evaluator_id, academic_directorate_id, ratings, score, weighted_score, strengths, weaknesses, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
       ON DUPLICATE KEY UPDATE ratings = VALUES(ratings), score = VALUES(score),
         weighted_score = VALUES(weighted_score), strengths = VALUES(strengths),
         weaknesses = VALUES(weaknesses), status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, academicDirectorateId, JSON.stringify(ratings), score, weightedScore, strengths, weaknesses]
    );
    return res.status(200).json({ success: true, score, weighted_score: weightedScore, weight: 30, status: 'COMPLETED' });
  } catch (error) {
    console.error('Academic Directorate evaluation submission failed:', error);
    return res.status(500).json({ message: 'Unable to submit the evaluation.' });
  }
};

/**
 * DEPARTMENT HEAD EVALUATION SUBMISSION
 * Supports flexible routing for both Instructors and Lab Assistants
 * Ensures proper status updates and notifications
 */
exports.submitDepartmentHeadEvaluation = async (req, res) => {
  const {
    evaluated_id,
    target_type = 'instructor',
    evaluator_role = 'dept_head',
    academic_year,
    semester,
    score = 0,
    criteria_scores = {},
    strengths = '',
    improvements = '',
    comments = '',
  } = req.body;

  // Validation
  if (!evaluated_id || !target_type) {
    return res.status(400).json({
      success: false,
      message: 'evaluated_id and target_type are required',
    });
  }

  const targetTypeNormalized = String(target_type).toLowerCase();
  if (!['instructor', 'lab_assistant'].includes(targetTypeNormalized)) {
    return res.status(400).json({
      success: false,
      message: 'target_type must be "instructor" or "lab_assistant"',
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const evaluatorId = req.user.id;
    const departmentId = req.user.department_id || req.user.departmentId;

    // Verify target exists based on type
    if (targetTypeNormalized === 'instructor') {
      const [[instructorCheck]] = await connection.query(
        'SELECT user_id, department_id FROM instructors WHERE id = ? LIMIT 1',
        [evaluated_id]
      );
      if (!instructorCheck) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Instructor not found',
        });
      }
    } else if (targetTypeNormalized === 'lab_assistant') {
      const [[labAssistantCheck]] = await connection.query(
        'SELECT user_id, department_id FROM lab_assistants WHERE id = ? LIMIT 1',
        [evaluated_id]
      );
      if (!labAssistantCheck) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Lab Assistant not found',
        });
      }
    }

    // Upsert evaluation into flexible evaluations table
    const [[existingEval]] = await connection.query(
      `SELECT id FROM evaluations
       WHERE evaluator_id = ? AND target_user_id = ? AND target_type = ? 
         AND evaluator_role = ? AND academic_year = ? AND semester = ? LIMIT 1`,
      [evaluatorId, evaluated_id, targetTypeNormalized, evaluatorRole, academic_year || null, semester || null]
    );

    if (existingEval) {
      // Update existing evaluation
      await connection.query(
        `UPDATE evaluations
         SET score = ?, criteria_scores = ?, strengths = ?, improvements = ?, 
             comments = ?, status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          Number(score),
          JSON.stringify(criteria_scores),
          String(strengths).trim(),
          String(improvements).trim(),
          String(comments).trim(),
          existingEval.id,
        ]
      );
    } else {
      // Insert new evaluation
      await connection.query(
        `INSERT INTO evaluations
         (evaluator_id, evaluator_role, target_user_id, target_type, department_id, 
          academic_year, semester, score, criteria_scores, strengths, improvements, comments, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
        [
          evaluatorId,
          evaluatorRole,
          evaluated_id,
          targetTypeNormalized,
          departmentId || null,
          academic_year || null,
          semester || null,
          Number(score),
          JSON.stringify(criteria_scores),
          String(strengths).trim(),
          String(improvements).trim(),
          String(comments).trim(),
        ]
      );
    }

    if (targetTypeNormalized === 'instructor') {
      await calculateAndSaveInstructorResult(evaluated_id, academic_year, semester, connection);
    }

    await connection.commit();

    // Send notification to evaluated staff
    try {
      const userField = targetTypeNormalized === 'instructor' ? 'instructor_id' : 'lab_assistant_id';
      const [[targetUser]] = await pool.query(
        `SELECT user_id FROM ${targetTypeNormalized === 'instructor' ? 'instructors' : 'lab_assistants'} 
         WHERE id = ? LIMIT 1`,
        [evaluated_id]
      );

      if (targetUser?.user_id) {
        await createNotifications({
          userIds: [targetUser.user_id],
          title: 'Evaluation Completed',
          message: `Your ${targetTypeNormalized === 'lab_assistant' ? 'ARA' : 'performance'} evaluation has been submitted by your Department Head.`,
          type: 'evaluation_completed',
        });
      }
    } catch (notifError) {
      console.error('Notification error:', notifError);
    }

    return res.status(200).json({
      success: true,
      message: `${targetTypeNormalized === 'lab_assistant' ? 'ARA' : 'Instructor'} evaluation submitted successfully`,
      data: { evaluated_id, target_type: targetTypeNormalized, status: 'COMPLETED' },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Submit evaluation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit evaluation',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

/**
 * STUDENT DUAL-ROUTING EVALUATION SUBMISSION
 * Routes evaluation to BOTH instructor AND lab assistant for the same course
 * Creates separate records for each target
 */
exports.submitStudentEvaluation = async (req, res) => {
  const {
    dispatch_id,
    course_id,
    assignment_id,
    score = 0,
    feedback = '',
    strengths = '',
    improvements = '',
    responses = {},
  } = req.body;

  if (!dispatch_id) {
    return res.status(400).json({
      success: false,
      message: 'dispatch_id is required',
    });
  }

  const hasResponses = Array.isArray(responses)
    ? responses.length > 0
    : Object.keys(responses || {}).length > 0;
  const calculatedScore = hasResponses
    ? Number(calculateLikertPercentage(responses).toFixed(2))
    : Number(score || 0);

  const feedbackValidation = validateEvaluationFeedbackPair(strengths, improvements);
  if (!feedbackValidation.valid) {
    return res.status(400).json({
      success: false,
      message: feedbackValidation.errors[0] || 'Please provide constructive and professional feedback.',
      errors: feedbackValidation.errors,
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[student]] = await connection.query(
      'SELECT id, department_id, CONCAT(COALESCE(first_name, \'\'), \' \', COALESCE(last_name, \'\')) AS student_name FROM students WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );
    if (!student) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Student record not found' });
    }

    const [[dispatch]] = await connection.query(
            `SELECT ed.id, ed.student_id, ed.assignment_id, ed.course_id, ed.course_name,
              ed.academic_year, ed.semester,
              ed.department_id, ed.target_type, ed.target_user_id,
              ca.instructor_id, ca.lab_assistant_id,
              i.user_id AS instructor_user_id, la.user_id AS lab_assistant_user_id
       FROM evaluation_dispatches ed
       LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
       LEFT JOIN instructors i ON i.id = COALESCE(ca.instructor_id, ed.target_user_id)
       LEFT JOIN lab_assistants la ON la.id = COALESCE(ca.lab_assistant_id, ed.target_user_id)
       WHERE ed.id = ?
         AND (ed.student_id = ? OR (ed.student_id IS NULL AND ed.department_id = ?))
         AND LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active', 'published', 'submitted')
       LIMIT 1`,
      [dispatch_id, student.id, student.department_id]
    );

    if (!dispatch) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Evaluation dispatch not found',
      });
    }

    const [[deadlineSettings]] = await connection.query(
      'SELECT deadline_at, auto_lock FROM evaluation_deadline_settings WHERE department_id = ? LIMIT 1',
      [student.department_id]
    ).catch(() => [[null]]);
    if (deadlineSettings?.auto_lock && deadlineSettings.deadline_at && new Date(deadlineSettings.deadline_at).getTime() <= Date.now()) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'The evaluation deadline has passed. Please contact your Department Head.' });
    }

    const submissionValues = [
      calculatedScore,
      String(feedback).trim(),
      JSON.stringify(responses),
      String(strengths).trim(),
      String(improvements).trim(),
      dispatch.id,
    ];
    const [[existingSubmission]] = await connection.query(
      'SELECT id FROM student_evaluation_submissions WHERE dispatch_id = ? LIMIT 1',
      [dispatch.id]
    );
    if (existingSubmission) {
      await connection.query(
        `UPDATE student_evaluation_submissions
         SET score = ?, feedback = ?, responses = ?, strengths = ?, improvements = ?, status = 'submitted'
         WHERE dispatch_id = ?`,
        submissionValues
      );
    } else {
      await connection.query(
        `INSERT INTO student_evaluation_submissions
         (dispatch_id, student_id, student_name, score, feedback, responses, strengths, improvements, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', NOW())`,
        [dispatch.id, student.id, student.student_name || req.user.username || '', ...submissionValues.slice(0, 5)]
      );
    }
    await connection.query("UPDATE evaluation_dispatches SET status = 'submitted' WHERE id = ?", [dispatch.id]);
    if (dispatch.instructor_id) {
      await calculateAndSaveInstructorResult(dispatch.instructor_id, dispatch.academic_year, dispatch.semester, connection);
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: 'Course evaluation submitted to all assigned staff',
      data: {
        course_id: dispatch.course_id || course_id || null,
        dispatch_id: dispatch.id,
        target_type: dispatch.target_type || 'instructor',
        submitted_count: 1,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Student evaluation submission error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit course evaluation',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

/**
 * GET ACTIVE EVALUATION FORMS (with 3-day expiration check)
 * Automatically filters out expired forms
 */
exports.getActiveEvaluationForms = async (req, res) => {
  const { department_id, academic_year, semester, form_type } = req.query;

  try {
    let query = `
      SELECT * FROM evaluation_forms
      WHERE is_published = 1 AND expires_at >= NOW()
    `;
    const params = [];

    if (department_id) {
      query += ' AND department_id = ?';
      params.push(Number(department_id));
    }

    if (academic_year) {
      query += ' AND academic_year = ?';
      params.push(String(academic_year));
    }

    if (semester) {
      query += ' AND semester = ?';
      params.push(String(semester));
    }

    if (form_type) {
      query += ' AND form_type = ?';
      params.push(String(form_type));
    }

    query += ' ORDER BY published_at DESC';

    const [rows] = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      data: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error('Get active forms error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch active evaluation forms',
      error: error.message,
    });
  }
};

/**
 * PUBLISH EVALUATION FORM (with 3-day expiration)
 * Sets published_at and expires_at (NOW + 3 days)
 */
exports.publishEvaluationForm = async (req, res) => {
  const {
    department_id,
    academic_year,
    semester,
    form_type = 'student',
    target_role = 'instructor',
  } = req.body;

  if (!department_id || !academic_year || !semester) {
    return res.status(400).json({
      success: false,
      message: 'department_id, academic_year, and semester are required',
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const publisherUserId = req.user.id;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 days

    const [[existingForm]] = await connection.query(
      `SELECT id FROM evaluation_forms
       WHERE department_id = ? AND academic_year = ? AND semester = ? AND form_type = ? AND target_role = ?
       LIMIT 1`,
      [department_id, academic_year, semester, form_type, target_role]
    );

    if (existingForm) {
      // Update existing form
      await connection.query(
        `UPDATE evaluation_forms
         SET published_at = NOW(), expires_at = ?, is_published = 1, published_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [expiresAt, publisherUserId, existingForm.id]
      );
    } else {
      // Create new form
      await connection.query(
        `INSERT INTO evaluation_forms
         (department_id, academic_year, semester, form_type, target_role, published_at, expires_at, is_published, published_by)
         VALUES (?, ?, ?, ?, ?, NOW(), ?, 1, ?)`,
        [department_id, academic_year, semester, form_type, target_role, expiresAt, publisherUserId]
      );
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: 'Evaluation form published successfully (valid for 72 hours)',
      data: {
        department_id,
        academic_year,
        semester,
        form_type,
        published_at: now,
        expires_at: expiresAt,
        duration_hours: 72,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Publish form error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to publish evaluation form',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

/**
 * AUTO-EXPIRE FORMS CRON JOB (called by middleware or scheduled task)
 * Marks forms as unpublished if expires_at < NOW()
 */
exports.autoExpireForms = async () => {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `UPDATE evaluation_forms
       SET is_published = 0, updated_at = CURRENT_TIMESTAMP
       WHERE is_published = 1 AND expires_at < NOW()`
    );

    console.log(`Auto-expired ${result.affectedRows} evaluation forms`);
    return { success: true, expired_count: result.affectedRows };
  } catch (error) {
    console.error('Auto-expire forms error:', error);
    return { success: false, error: error.message };
  } finally {
    connection.release();
  }
};

exports.getInstructorEvaluationDetails = async (req, res) => {
  const instructorId = Number(req.params.instructorId);
  const departmentId = Number(req.user?.department_id || req.user?.departmentId || 0);

  if (!Number.isInteger(instructorId) || instructorId <= 0) {
    return res.status(400).json({ message: 'A valid instructorId is required.' });
  }
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return res.status(403).json({ message: 'Your department is not defined.' });
  }

  try {
    const [[instructor]] = await pool.query(`
      SELECT id, department_id,
        TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS instructor_name
      FROM instructors
      WHERE id = ? AND department_id = ?
      LIMIT 1
    `, [instructorId, departmentId]);

    if (!instructor) {
      return res.status(404).json({ message: 'Instructor not found in your department.' });
    }

    const [students] = await pool.query(`
      SELECT DISTINCT
        s.id AS student_db_id,
        s.student_id,
        s.first_name,
        s.last_name,
        TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS student_name,
        student_user.email,
        c.code AS course_code,
        c.name AS course_name,
        ca.id AS assignment_id,
        TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS target_instructor_name,
        CASE WHEN EXISTS (
          SELECT 1
          FROM evaluation_dispatches ed
          INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
          WHERE ed.assignment_id = ca.id
            AND ed.student_id = s.id
            AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
            AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
        ) THEN 'Completed' ELSE 'Pending' END AS status,
        (
          SELECT MAX(ses.submitted_at)
          FROM evaluation_dispatches ed
          INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
          WHERE ed.assignment_id = ca.id
            AND ed.student_id = s.id
            AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
            AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
        ) AS submitted_at
      FROM course_assignments ca
      INNER JOIN students s ON ca.student_id = s.id OR (
        ca.student_id IS NULL
        AND s.department_id = ca.department_id
        AND LOWER(COALESCE(s.year_level, '')) = LOWER(COALESCE(ca.year_level, ''))
        AND LOWER(COALESCE(s.section, '')) = LOWER(COALESCE(ca.section, ''))
        AND (ca.program_type IS NULL OR LOWER(COALESCE(s.program_type, '')) = LOWER(ca.program_type))
      )
      INNER JOIN users student_user ON student_user.id = s.user_id
      LEFT JOIN courses c ON c.id = ca.course_id
      LEFT JOIN instructors i ON i.id = ca.instructor_id
      WHERE ca.instructor_id = ?
        AND LOWER(COALESCE(ca.status, 'assigned')) <> 'cancelled'
      ORDER BY student_name ASC, c.code ASC
    `, [instructorId]);

    const [peers] = await pool.query(`
      SELECT DISTINCT
        evaluator.id AS evaluator_id,
        evaluator.user_id,
        pe.id AS peer_id,
        evaluator.first_name,
        evaluator.last_name,
        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(evaluator.first_name, ''), ' ', COALESCE(evaluator.last_name, ''))), ''), evaluator_user.email) AS peer_instructor,
        COALESCE(evaluator.employee_id, evaluator_user.email) AS staff_id,
        evaluator_user.email,
        evaluator_user.role AS evaluator_role,
        c.code AS course_code,
        TRIM(CONCAT(COALESCE(target_i.first_name, ''), ' ', COALESCE(target_i.last_name, ''))) AS target_instructor_name,
        CASE WHEN LOWER(COALESCE(pe.status, 'pending')) IN ('submitted', 'completed', 'approved') OR EXISTS (
          SELECT 1
          FROM peer_evaluation_submissions pes
          WHERE pes.peer_evaluation_id = pe.id
            AND LOWER(COALESCE(pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
        ) THEN 'Completed' ELSE 'Pending' END AS submission_status,
        (
          SELECT MAX(pes.created_at)
          FROM peer_evaluation_submissions pes
          WHERE pes.peer_evaluation_id = pe.id
            AND LOWER(COALESCE(pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
        ) AS submitted_at
      FROM peer_evaluations pe
      INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
      INNER JOIN users evaluator_user ON evaluator_user.id = evaluator.user_id
      INNER JOIN instructors target_i ON target_i.id = pe.evaluatee_id
      LEFT JOIN courses c ON c.id = pe.course_id
      WHERE pe.evaluatee_id = ?
        AND pe.evaluator_id <> ?
        AND evaluator.department_id = ?
        AND LOWER(COALESCE(evaluator_user.status, 'active')) = 'active'
        AND LOWER(TRIM(COALESCE(evaluator_user.role, ''))) IN ('instructor', 'peer')
      ORDER BY peer_instructor ASC, c.code ASC
    `, [instructorId, instructorId, departmentId]);

    const pendingStudentsCount = students.filter((student) => student.status !== 'Completed').length;
    const pendingPeersCount = peers.filter((peer) => peer.submission_status !== 'Completed').length;

    return res.json({
      instructorId,
      instructorName: instructor.instructor_name,
      students,
      peers,
      assignedStudentsCount: students.length,
      pendingStudentsCount,
      assignedPeersCount: peers.length,
      pendingPeersCount,
    });
  } catch (error) {
    console.error('Instructor evaluation details fetch failed:', error);
    return res.status(500).json({ message: 'Unable to load instructor evaluation details.' });
  }
};

/**
 * GET INSTRUCTOR/LAB ASSISTANT PERFORMANCE (updated to include student evaluations)
 */
exports.getPerformanceWithStudentEvaluations = async (req, res) => {
  const { target_id, target_type = 'instructor' } = req.query;

  if (!target_id) {
    return res.status(400).json({
      success: false,
      message: 'target_id is required',
    });
  }

  try {
    // Get average student evaluation scores
    const [[studentAvg]] = await pool.query(
      `SELECT 
         COALESCE(AVG(score), 0) AS avg_score,
         COUNT(*) AS submission_count
      FROM student_evaluation_submissions ses
      INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
      WHERE ed.target_user_id = ? AND COALESCE(ed.target_type, 'instructor') = ?`,
          [target_id, target_type]
    );

    // Get department head evaluation
    const [[deptHeadEval]] = await pool.query(
      `SELECT score, criteria_scores FROM evaluations
       WHERE target_user_id = ? AND target_type = ? AND evaluator_role = 'dept_head'
       ORDER BY created_at DESC LIMIT 1`,
      [target_id, target_type]
    );

    // Combine results
    const performance = {
      student_score: Number(studentAvg.avg_score || 0),
      student_evaluation_count: Number(studentAvg.submission_count || 0),
      dept_head_score: deptHeadEval ? Number(deptHeadEval.score) : 0,
      average_score:
        (Number(studentAvg.avg_score || 0) + (deptHeadEval ? Number(deptHeadEval.score) : 0)) / 2,
    };

    return res.status(200).json({
      success: true,
      data: performance,
    });
  } catch (error) {
    console.error('Get performance error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch performance data',
      error: error.message,
    });
  }
};
