const express = require('express');
const pool = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { calculateLikertPercentage, getRatedLikertValues, isValidLikertResponse } = require('../utils/likertScoring');
const { calculateAndSaveInstructorResult } = require('../utils/evaluationCalculator');
const { calculateDeanPerformanceScore } = require('../utils/deanPerformanceScore');
const { getDirectoratePerformance } = require('../controllers/directoratePerformanceController');

const router = express.Router();
router.use(authenticateToken, authorizeRoles('academic_directorate', 'academic_director', 'directorate'));

const getAcademicYearTokens = (academicYear) => {
  const tokens = String(academicYear || '').match(/(?:19|20)\d{2}/g);
  return [...new Set(tokens?.length ? tokens : [String(academicYear || '').trim()].filter(Boolean))];
};
const getSemesterTokens = (semester) => {
  const normalized = String(semester || '')
    .trim()
    .toLowerCase()
    .replace(/^semester\s*/, '')
    .replace(/^sem\s*/, '')
    .replace(/\s+/g, '');
  if (['1', 'i', 'first'].includes(normalized)) return ['i', '1'];
  if (['2', 'ii', 'second'].includes(normalized)) return ['ii', '2'];
  if (['3', 'iii', 'third'].includes(normalized)) return ['iii', '3'];
  return normalized ? [normalized] : [];
};
const buildTermFilter = (academicYearExpression, semesterExpression, academicYearTokens, semesterTokens) => {
  const yearPlaceholders = academicYearTokens.map(() => '?').join(', ');
  const semesterPlaceholders = semesterTokens.map(() => '?').join(', ');
  const normalizedYear = `REPLACE(REPLACE(TRIM(${academicYearExpression}), '-', '/'), ' ', '')`;
  const normalizedSemester = `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${semesterExpression}), 'semester', ''), 'sem', ''), ' ', ''), '-', ''))`;
  return {
    sql: `AND (
        ${academicYearExpression} IS NULL
        OR ${normalizedYear} IN (${yearPlaceholders})
        OR SUBSTRING_INDEX(${normalizedYear}, '/', 1) IN (${yearPlaceholders})
        OR SUBSTRING_INDEX(${normalizedYear}, '/', -1) IN (${yearPlaceholders})
      )
      AND (
        ${semesterExpression} IS NULL
        OR ${normalizedSemester} IN (${semesterPlaceholders})
      )`,
    values: [
      ...academicYearTokens,
      ...academicYearTokens,
      ...academicYearTokens,
      ...semesterTokens,
    ],
  };
};

const normalizeWeightedScore = ({ student, peer, deptHead }) => {
  const categories = [
    ['student', student, 20, 0.5],
    ['peer', peer, 20, 0.2],
    ['deptHead', deptHead, 30, 0.3],
  ].filter(([, score]) => Number.isFinite(Number(score)));
  return Number(categories.reduce((total, [, score, maximum, weight]) => (
    total + (Math.min(Math.max(Number(score), 0), maximum) / maximum * 100 * weight)
  ), 0).toFixed(2));
};

const sendServerError = (res, error, message) => {
  console.error(`Directorate ${message}:`, error);
  return res.status(500).json({ message: 'Server Error', error: error.message });
};
const isPeerPublicationActive = async (departmentId, academicYear, semester) => {
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

const ensureDepartmentPeerAssignments = async (departmentId) => {
  await pool.query(
    `INSERT IGNORE INTO peer_evaluations (evaluator_id, evaluatee_id, course_id, status)
     SELECT evaluator.id, evaluatee.id, NULL, 'pending'
     FROM instructors evaluator
     INNER JOIN users evaluator_user ON evaluator_user.id = evaluator.user_id
     INNER JOIN instructors evaluatee ON evaluatee.department_id = evaluator.department_id
     INNER JOIN users evaluatee_user ON evaluatee_user.id = evaluatee.user_id
     WHERE evaluator.department_id = ?
       AND evaluator.id <> evaluatee.id
       AND LOWER(COALESCE(evaluator_user.status, 'active')) = 'active'
       AND LOWER(COALESCE(evaluatee_user.status, 'active')) = 'active'
       AND LOWER(TRIM(evaluatee_user.role)) IN ('instructor', 'dept_head', 'department_head', 'college_dean', 'dean')`,
    [departmentId]
  );
};

router.get('/overview-stats', async (req, res) => {
  try {
    const [[collegeCount]] = await pool.query('SELECT COUNT(*) AS totalColleges FROM colleges');
    const [[evaluationCount]] = await pool.query(
      `SELECT
        SUM(CASE WHEN de.id IS NULL OR LOWER(de.status) <> 'completed' THEN 1 ELSE 0 END) AS pendingDeans,
        SUM(CASE WHEN LOWER(de.status) = 'completed' THEN 1 ELSE 0 END) AS completedDeans
       FROM users u
       LEFT JOIN directorate_evaluations de ON de.dean_id = u.id AND de.evaluator_id = ?
       WHERE LOWER(u.role) = 'college_dean'`,
      [req.user.id]
    );
    return res.json({
      totalColleges: Number(collegeCount?.totalColleges || 0),
      pendingDeans: Number(evaluationCount?.pendingDeans || 0),
      completedDeans: Number(evaluationCount?.completedDeans || 0),
    });
  } catch (error) {
    return sendServerError(res, error, 'overview stats error');
  }
});

router.get('/my-performance', getDirectoratePerformance);

router.get('/instructors', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        i.id,
        CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS full_name,
        COALESCE(NULLIF(c.name, ''), 'Unassigned') AS college_name
      FROM instructors i
      INNER JOIN users u ON u.id = i.user_id AND LOWER(u.role) = 'college_dean'
      INNER JOIN departments d ON d.id = i.department_id
      INNER JOIN colleges c ON c.id = d.college_id
      WHERE LOWER(COALESCE(u.status, 'active')) = 'active'
      ORDER BY college_name ASC, full_name ASC`
    );
    return res.json(rows.map((row) => ({
      id: row.id,
      name: (row.full_name || '').trim() || 'Unknown Dean',
      college: row.college_name || 'Unassigned',
    })));
  } catch (error) {
    return sendServerError(res, error, 'deans query error');
  }
});

router.get('/deans', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id AS deanId,
        COALESCE(NULLIF(CONCAT_WS(' ', dean_instructor.first_name, dean_instructor.last_name), ''), u.email) AS full_name,
        u.email,
        c.id AS collegeId,
        COALESCE(NULLIF(c.name, ''), 'Unassigned') AS college_name,
        COALESCE(
          DATE_FORMAT(active_period.deadline, '%Y-%m-%d'),
          DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY), '%Y-%m-%d')
        ) AS deadline,
        COALESCE(de.status, 'PENDING') AS evaluation_status,
        COALESCE(de.total_score, 0) AS score
       FROM users u
      INNER JOIN instructors dean_instructor ON dean_instructor.user_id = u.id
      INNER JOIN departments d ON d.id = dean_instructor.department_id
      INNER JOIN colleges c ON c.id = d.college_id
       LEFT JOIN (
         SELECT deadline
         FROM evaluation_periods
         WHERE LOWER(status) = 'active'
         ORDER BY id DESC
         LIMIT 1
       ) AS active_period ON 1 = 1
       LEFT JOIN directorate_evaluations de ON de.dean_id = u.id AND de.evaluator_id = ?
       WHERE LOWER(COALESCE(u.role, '')) = 'college_dean'
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
       ORDER BY college_name ASC, full_name ASC`,
      [req.user.id]
    );
    return res.json(rows.map((row) => ({ ...row, score: Number(row.score || 0) })));
  } catch (error) {
    return sendServerError(res, error, 'deans query error');
  }
});

router.get('/reports', async (req, res) => {
  try {
    const [[activePeriod]] = await pool.query(
      `SELECT academic_year, semester
       FROM evaluation_periods
       WHERE LOWER(status) = 'active'
       ORDER BY id DESC
       LIMIT 1`
    );
    const academicYear = String(activePeriod?.academic_year || '').trim();
    const semester = String(activePeriod?.semester || '').trim();
    const academicYearTokens = getAcademicYearTokens(academicYear);
    const semesterTokens = getSemesterTokens(semester);
    const [rows] = await pool.query(
      `SELECT u.id AS user_id, dean_instructor.id AS instructor_id, u.role,
        COALESCE(NULLIF(CONCAT_WS(' ', dean_instructor.first_name, dean_instructor.last_name), ''), u.email) AS name,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department_name,
        c.id AS college_id, c.name AS college_name,
        (SELECT COALESCE(AVG(pes.score), 0)
         FROM peer_evaluation_submissions pes
         INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
         WHERE pe.evaluatee_id = dean_instructor.id
           AND LOWER(pes.status) IN ('submitted', 'completed', 'approved')) AS peer_score,
        COALESCE(de.directorate_score, 0) AS directorate_score,
        de.status, de.created_at
       FROM users u
       INNER JOIN instructors dean_instructor ON dean_instructor.user_id = u.id
       INNER JOIN departments d ON d.id = dean_instructor.department_id
       INNER JOIN colleges c ON c.id = d.college_id
       LEFT JOIN (
         SELECT dean_id, AVG(total_score) AS directorate_score,
           MAX(status) AS status, MAX(created_at) AS created_at
         FROM directorate_evaluations
         WHERE LOWER(status) = 'completed'
         GROUP BY dean_id
       ) de ON de.dean_id = u.id
       WHERE LOWER(u.role) = 'college_dean'
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
       ORDER BY college_name ASC, name ASC`,
    );
    const reports = await Promise.all(rows.map(async (row) => {
      const yearPlaceholders = academicYearTokens.map(() => '?').join(', ');
      const semesterPlaceholders = semesterTokens.map(() => '?').join(', ');
      const assignmentYear = "COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), ''))";
      const assignmentSemester = "COALESCE(NULLIF(TRIM(ed.semester), ''), NULLIF(TRIM(ca.semester), ''))";
      const normalizedYear = `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${assignmentYear}), '-', '/'), ' ', ''), '.', ''), 'ec', ''))`;
      const normalizedSemester = `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${assignmentSemester}), 'semester', ''), 'sem', ''), ' ', ''), '-', ''))`;
      const academicYearFilter = academicYearTokens.length
        ? `AND (
            ${assignmentYear} IS NULL
            OR ${normalizedYear} IN (${yearPlaceholders})
            OR SUBSTRING_INDEX(${normalizedYear}, '/', 1) IN (${yearPlaceholders})
            OR SUBSTRING_INDEX(${normalizedYear}, '/', -1) IN (${yearPlaceholders})
          )`
        : '';
      const semesterFilter = semesterTokens.length
        ? `AND (${assignmentSemester} IS NULL OR ${normalizedSemester} IN (${semesterPlaceholders}))`
        : '';
      const [assignmentTerms] = await pool.query(
        `SELECT MAX(${assignmentYear}) AS academic_year, MAX(${assignmentSemester}) AS semester,
                COUNT(DISTINCT ca.id) AS course_count,
                COUNT(DISTINCT ses.id) AS student_evaluation_count,
                COALESCE(AVG(ses.score), 0) AS student_score,
                MAX(ca.id) AS latest_assignment_id
         FROM course_assignments ca
         LEFT JOIN evaluation_dispatches ed
           ON ed.assignment_id = ca.id
           OR (
             ed.assignment_id IS NULL
             AND ed.course_id = ca.course_id
             AND COALESCE(ed.academic_year, ca.academic_year) = ca.academic_year
             AND COALESCE(ed.semester, ca.semester) = ca.semester
           )
         LEFT JOIN student_evaluation_submissions ses
           ON ses.dispatch_id = ed.id
           AND LOWER(COALESCE(ed.target_type, 'instructor')) = 'instructor'
           AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved', 'published')
         WHERE (
             CAST(ca.instructor_id AS CHAR) = CAST(? AS CHAR)
             OR (
               LOWER(COALESCE(ca.assigned_role, 'instructor')) <> 'lab_assistant'
               AND CAST(ca.staff_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR))
             )
           )
           AND LOWER(COALESCE(ca.status, 'assigned')) NOT IN ('unassigned', 'cancelled', 'inactive')
           ${academicYearFilter}
           ${semesterFilter}`,
        [
          row.instructor_id,
          row.instructor_id,
          row.user_id,
          ...academicYearTokens,
          ...academicYearTokens,
          ...academicYearTokens,
          ...semesterTokens,
        ]
      );
      const assignmentTerm = assignmentTerms[0] || {};
      const courseCount = Number(assignmentTerm.course_count || 0);
      const submissionCount = Number(assignmentTerm.student_evaluation_count || 0);
      const hasAssignedCourses = courseCount > 0 || submissionCount > 0;
      const studentScore = Number(assignmentTerm.student_score || 0);
      const peerScore = Number(row.peer_score || 0);
      const directorateScore = Number(row.directorate_score || 0);
      const calculatedScore = calculateDeanPerformanceScore({
        student: studentScore,
        directorate: directorateScore,
        peer: peerScore,
        hasAssignedCourses,
      });
      const studentWeight = calculatedScore.studentWeight;
      const directorateWeight = calculatedScore.directorateWeight;
      const peerWeight = calculatedScore.peerWeight;
      const studentWeighted = calculatedScore.studentWeighted;
      const directorateWeighted = calculatedScore.directorateWeighted;
      const peerWeighted = calculatedScore.peerWeighted;
      const isComplete = (!hasAssignedCourses || submissionCount > 0) && peerScore > 0 && directorateScore > 0;
      const finalScore = calculatedScore.totalScore;

      return {
        ...row,
        user_role: 'College Dean',
        course_count: courseCount,
        assignment_count: courseCount,
        has_assigned_courses: hasAssignedCourses,
        hasAssignedCourses,
        hasCourseAssigned: hasAssignedCourses,
        hasAssignedCourse: hasAssignedCourses,
        isStudentEvaluationExcluded: !hasAssignedCourses,
        isTeaching: hasAssignedCourses,
        role: hasAssignedCourses ? 'Teaching' : 'Non-Teaching',
        role_status: hasAssignedCourses ? 'Role: Teaching (100% Weight)' : 'Role: Non-Teaching (Re-scaled to 100%)',
        academic_year: assignmentTerm.academic_year || academicYear,
        semester: assignmentTerm.semester || semester,
        student_score: studentScore,
        student_average: studentScore,
        raw_student_score: studentScore,
        submission_count: submissionCount,
        student_evaluation_count: submissionCount,
        peer_score: peerScore,
        peer_average: peerScore,
        directorate_score: directorateScore,
        student_weighted: studentWeighted,
        student_weighted_score: studentWeighted,
        directorate_weighted: directorateWeighted,
        peer_weighted: peerWeighted,
        student_weight: studentWeight,
        directorate_weight: directorateWeight,
        peer_weight: peerWeight,
        final_score: finalScore,
        is_rescaled: !hasAssignedCourses,
        isComplete,
        can_print: isComplete && finalScore > 0,
      };
    }));
    return res.json(reports);
  } catch (error) {
    return sendServerError(res, error, 'reports query error');
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id AS collegeId, c.name AS college_name,
        ROUND(COALESCE(AVG(er.final_score), 0), 2) AS performance,
        COUNT(DISTINCT d.id) AS departments
       FROM colleges c
       LEFT JOIN departments d ON d.college_id = c.id
       LEFT JOIN instructors i ON i.department_id = d.id
       LEFT JOIN evaluation_results er ON er.instructor_id = i.id
      GROUP BY c.id, c.name ORDER BY college_name ASC`
    );
    return res.json(rows.map((row) => ({
      ...row,
      college_name: row.college_name || 'Unassigned College',
      performance: Number(row.performance || 0),
      departments: Number(row.departments || 0),
    })));
  } catch (error) {
    return sendServerError(res, error, 'analytics query error');
  }
});

router.post('/evaluate-dean', async (req, res) => {
  const deanId = Number(req.body?.deanId || 0);
  const ratings = req.body?.ratings || {};
  const strengths = String(req.body?.strengths || '').trim();
  const weaknesses = String(req.body?.weaknesses || '').trim();
  const values = Object.values(ratings).map(Number);
  if (!deanId || !values.length || values.some((value) => value < 1 || value > 5)) {
    return res.status(400).json({ message: 'Dean and valid ratings for all criteria are required.' });
  }

  try {
    const [[dean]] = await pool.query("SELECT id FROM users WHERE id = ? AND LOWER(role) = 'college_dean' LIMIT 1", [deanId]);
    if (!dean) return res.status(404).json({ message: 'College Dean not found.' });
    const totalScore = (values.reduce((sum, value) => sum + value, 0) / (values.length * 5)) * 100;
    await pool.query(
      `INSERT INTO directorate_evaluations (evaluator_id, dean_id, ratings, strengths, weaknesses, total_score, status)
       VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED')
       ON DUPLICATE KEY UPDATE ratings = VALUES(ratings), strengths = VALUES(strengths), weaknesses = VALUES(weaknesses), total_score = VALUES(total_score), status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, deanId, JSON.stringify(ratings), strengths, weaknesses, totalScore]
    );
    return res.json({ success: true, totalScore: Number(totalScore.toFixed(2)), status: 'COMPLETED' });
  } catch (error) {
    return sendServerError(res, error, 'Dean evaluation submission error');
  }
});

router.get('/peer-evaluations', async (req, res) => {
  try {
    const directorId = Number(req.user?.id || 0);
    const academicYear = String(req.query.academic_year || new Date().getFullYear());
    const semester = String(req.query.semester || 'Semester I');
    const [[directorProfile]] = await pool.query('SELECT id, department_id FROM instructors WHERE user_id = ? LIMIT 1', [directorId]);
    if (!directorProfile?.department_id || !await isPeerPublicationActive(directorProfile.department_id, academicYear, semester)) {
      return res.json({ published: false, data: [] });
    }
    await ensureDepartmentPeerAssignments(directorProfile.department_id);
    const [rows] = await pool.query(
      `SELECT
        i.id AS instructor_id,
        COALESCE(NULLIF(CONCAT_WS(' ', i.first_name, i.last_name), ''), u.email) AS instructor_name,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department_name,
        c.name AS college_name,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department,
        pe.id AS peer_evaluation_id,
        COALESCE(
          (SELECT deadline FROM evaluation_periods WHERE status = 'active' ORDER BY id DESC LIMIT 1),
          pe.deadline
        ) AS deadline,
        COALESCE(pes.status, pe.status, 'pending') AS submission_status,
        COALESCE(ROUND(pes.score, 2), 0) AS total_score,
        pes.strengths,
        pes.suggestions,
        pes.responses
      FROM instructors i
      INNER JOIN users u ON u.id = i.user_id
      INNER JOIN departments d ON d.id = i.department_id
      INNER JOIN colleges c ON c.id = d.college_id
      INNER JOIN peer_evaluations pe ON pe.evaluatee_id = i.id AND pe.evaluator_id = ? AND pe.course_id IS NULL
      LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id AND pes.evaluator_id = ?
      WHERE i.department_id = ?
        AND u.id <> ?
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
        AND LOWER(u.role) IN ('instructor', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate')
      ORDER BY d.department_name ASC, instructor_name ASC`,
      [directorProfile.id, directorId, directorProfile.department_id, directorId]
    );

    return res.json({ published: true, data: rows.map((row) => {
      const isEvaluated = ['submitted', 'completed', 'approved'].includes(String(row.submission_status || '').toLowerCase());
      return {
        ...row,
        submission_status: isEvaluated ? 'submitted' : 'pending',
        total_score: Number(row.total_score || 0),
        score: Number(row.total_score || 0),
        isEvaluated,
      };
    }) });
  } catch (error) {
    return sendServerError(res, error, 'peer evaluations query error');
  }
});

router.get('/evaluation-tracking', async (req, res) => {
  try {
    const instructorId = Number(req.query.instructor_id || 0);

    if (instructorId > 0) {
      const [[targetDean]] = await pool.query(
        `SELECT u.id AS dean_id, u.email,
          CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS dean_name,
          c.id AS college_id, c.name AS college_name
         FROM users u
         INNER JOIN instructors i ON i.user_id = u.id AND i.id = ?
         INNER JOIN departments d ON d.id = i.department_id
         INNER JOIN colleges c ON c.id = d.college_id
         WHERE LOWER(u.role) = 'college_dean' LIMIT 1`,
        [instructorId]
      );

      if (!targetDean) {
        return res.json([]);
      }

      const [[result]] = await pool.query(
        `SELECT
          u.id AS dean_id,
          CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS instructor_name,
          c.name AS college,
          COALESCE(de.total_score, 0) AS final_score,
          COALESCE(de.status, 'Pending') AS status
         FROM users u
         INNER JOIN instructors i ON i.user_id = u.id AND i.id = ?
         INNER JOIN departments d ON d.id = i.department_id
         INNER JOIN colleges c ON c.id = d.college_id
         LEFT JOIN directorate_evaluations de ON de.id = (
           SELECT latest.id FROM directorate_evaluations latest
           WHERE latest.dean_id = u.id
           ORDER BY latest.id DESC LIMIT 1
         )
         WHERE LOWER(u.role) = 'college_dean' LIMIT 1`,
        [instructorId]
      );

      if (!result) return res.json([]);
      const finalScore = Number(result.final_score || 0);
      const statusNormalized = String(result.status || '').toLowerCase() === 'completed' || String(result.status || '').toLowerCase() === 'submitted' ? 'Completed' : 'Pending';
      return res.json([{
        instructor_id: result.dean_id,
        instructor_name: result.instructor_name || 'Unknown Dean',
        department: result.college || 'Unassigned',
        final_score: finalScore,
        status: statusNormalized,
      }]);
    }

    const [rows] = await pool.query(
      `SELECT
        d.id AS department_id,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department,
        COALESCE(NULLIF(CONCAT_WS(' ', dept_head_instructor.first_name, dept_head_instructor.last_name), ''), dept_head_user.email) AS department_head_name,
        COUNT(DISTINCT i.id) AS total_instructors,
        COUNT(DISTINCT CASE WHEN LOWER(COALESCE(student_status.status, '')) IN ('submitted', 'completed', 'approved') THEN i.id END) AS completed_evaluations,
        ROUND(COALESCE(AVG(student_scores.student_average), 0), 2) AS student_average,
        ROUND(COALESCE(AVG(dept_head_scores.dept_head_average), 0), 2) AS dept_head_average,
        ROUND(COALESCE(AVG(peer_scores.peer_average), 0), 2) AS peer_average,
        ROUND(
          COALESCE(AVG(student_scores.student_average), 0) * 0.50 +
          COALESCE(AVG(dept_head_scores.dept_head_average), 0) * 0.30 +
          COALESCE(AVG(peer_scores.peer_average), 0) * 0.20,
          2
        ) AS final_score
      FROM departments d
      LEFT JOIN instructors i ON i.department_id = d.id
      LEFT JOIN users u ON u.id = i.user_id AND LOWER(COALESCE(u.status, 'active')) = 'active'
      LEFT JOIN (
        SELECT ca.instructor_id, AVG(ses.score) AS student_average
        FROM student_evaluation_submissions ses
        INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
        INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
        WHERE LOWER(COALESCE(ses.status, '')) IN ('submitted', 'completed', 'approved')
        GROUP BY ca.instructor_id
      ) student_scores ON student_scores.instructor_id = i.id
      LEFT JOIN (
        SELECT dhe.instructor_id, AVG(dhe.total_score) AS dept_head_average
        FROM dept_head_evaluations dhe
        WHERE LOWER(COALESCE(dhe.status, '')) IN ('submitted', 'completed', 'approved')
        GROUP BY dhe.instructor_id
      ) dept_head_scores ON dept_head_scores.instructor_id = i.id
      LEFT JOIN (
        SELECT pe.evaluatee_id, AVG(pes.score) AS peer_average
        FROM peer_evaluations pe
        INNER JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
        INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
        WHERE LOWER(COALESCE(pes.status, '')) IN ('submitted', 'completed', 'approved')
          AND LOWER(COALESCE(ed.evaluation_type, '')) = 'peer'
          AND LOWER(COALESCE(ed.status, '')) = 'active'
        GROUP BY pe.evaluatee_id
      ) peer_scores ON peer_scores.evaluatee_id = i.id
      LEFT JOIN (
        SELECT DISTINCT ca.instructor_id, 'submitted' AS status
        FROM student_evaluation_submissions ses
        INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
        INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
        WHERE LOWER(COALESCE(ses.status, '')) IN ('submitted', 'completed', 'approved')
      ) student_status ON student_status.instructor_id = i.id
      LEFT JOIN instructors dept_head_instructor ON dept_head_instructor.department_id = d.id
      LEFT JOIN users dept_head_user ON dept_head_user.id = dept_head_instructor.user_id
        AND LOWER(dept_head_user.role) IN ('dept_head', 'department_head')
      GROUP BY d.id, d.department_name, d.name, dept_head_instructor.first_name, dept_head_instructor.last_name, dept_head_user.email
      ORDER BY department ASC`
    );

    return res.json(rows.map((row) => ({
      ...row,
      total_instructors: Number(row.total_instructors || 0),
      completed_evaluations: Number(row.completed_evaluations || 0),
      completion_rate: Number(row.total_instructors) ? (Number(row.completed_evaluations || 0) / Number(row.total_instructors)) * 100 : 0,
      student_average: Number(row.student_average || 0),
      dept_head_average: Number(row.dept_head_average || 0),
      peer_average: Number(row.peer_average || 0),
      final_score: Number(row.final_score || 0),
    })));
  } catch (error) {
    return sendServerError(res, error, 'evaluation tracking query error');
  }
});

router.post('/calculate-publish', async (req, res) => {
  try {
    const instructorId = Number(req.body?.instructor_id || 0);
    const academicYear = String(req.body?.academic_year || new Date().getFullYear());
    const semester = String(req.body?.semester || 'Semester I');

    const [instructors] = await pool.query(
      instructorId > 0
        ? `SELECT i.id
           FROM instructors i
           WHERE i.id = ?`
        : `SELECT i.id
           FROM instructors i
           INNER JOIN users u ON u.id = i.user_id
           WHERE LOWER(COALESCE(u.status, 'active')) = 'active'`,
      instructorId > 0 ? [instructorId] : []
    );

    if (!instructors.length) {
      return res.status(404).json({ success: false, ready: false, message: 'No active instructor was found for calculation.' });
    }

    const [incompleteRows] = await pool.query(
      `SELECT i.id,
         (SELECT COUNT(*) FROM course_assignments ca WHERE ca.instructor_id = i.id AND (ca.academic_year = ? OR ca.academic_year IS NULL) AND (ca.semester = ? OR ca.semester IS NULL)) AS course_count,
         EXISTS (
           SELECT 1
           FROM student_evaluation_submissions ses
           INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
           INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
           WHERE ca.instructor_id = i.id
             AND (ed.academic_year = ? OR ed.academic_year IS NULL)
             AND (ed.semester = ? OR ed.semester IS NULL)
             AND LOWER(TRIM(COALESCE(ses.status, ''))) IN ('submitted', 'completed', 'approved')
         ) AS has_student,
         EXISTS (
           SELECT 1 FROM dept_head_evaluations dhe
           WHERE dhe.instructor_id = i.id
             AND LOWER(TRIM(COALESCE(dhe.status, ''))) IN ('submitted', 'completed', 'approved')
         ) AS has_dept_head,
         EXISTS (
           SELECT 1
           FROM peer_evaluation_submissions pes
           INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
           WHERE pe.evaluatee_id = i.id
             AND LOWER(TRIM(COALESCE(pes.status, ''))) IN ('submitted', 'completed', 'approved')
         ) AS has_peer
       FROM instructors i
       WHERE i.id IN (${instructors.map(() => '?').join(', ')})`,
      [academicYear, semester, academicYear, semester, ...instructors.map(({ id }) => id)]
    );
    const incomplete = incompleteRows.filter((row) => {
      const hasCourseAssigned = Number(row.course_count || 0) > 0;
      return (
        (hasCourseAssigned && Number(row.has_student) !== 1)
        || Number(row.has_dept_head) !== 1
        || Number(row.has_peer) !== 1
      );
    });
    if (incomplete.length) {
      return res.status(409).json({
        success: false,
        ready: false,
        message: 'All student, peer, and department-head evaluations must be submitted before publishing final results.',
        incomplete: incomplete.map((row) => ({
          instructor_id: row.id,
          missing: [
            Number(row.has_student) !== 1 ? 'student' : null,
            Number(row.has_peer) !== 1 ? 'peer' : null,
            Number(row.has_dept_head) !== 1 ? 'dept_head' : null,
          ].filter(Boolean),
        })),
      });
    }

    const results = [];
    for (const instructor of instructors) {
      const [[courseCountRow]] = await pool.query(
        `SELECT COUNT(*) AS course_count
         FROM course_assignments
         WHERE instructor_id = ?
           AND (? = '' OR academic_year = ?)
           AND (? = '' OR semester = ?)
         LIMIT 1`,
        [instructor.id, academicYear, academicYear, semester, semester]
      );
      const hasCourseAssigned = Number(courseCountRow?.course_count || 0) > 0;

      const [[studentScoreRow]] = await pool.query(
        `SELECT COALESCE(AVG(ses.score), 0) AS student_score
         FROM student_evaluation_submissions ses
         INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
         INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
         WHERE ca.instructor_id = ?
           AND LOWER(TRIM(COALESCE(ses.status, ''))) IN ('submitted', 'completed', 'approved')
           AND (ed.academic_year = ? OR ed.academic_year IS NULL)
           AND (ed.semester = ? OR ed.semester IS NULL)`,
        [instructor.id, academicYear, semester]
      );
      const studentAverage = hasCourseAssigned ? Number(studentScoreRow?.student_score || 0) : 0;

      const [[peerScoreRow]] = await pool.query(
        `SELECT COALESCE(AVG(pes.score), 0) AS peer_score
         FROM peer_evaluation_submissions pes
         INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
         INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
         WHERE pe.evaluatee_id = ?
           AND LOWER(COALESCE(ed.evaluation_type, '')) = 'peer'
           AND LOWER(COALESCE(ed.status, '')) = 'active'
           AND (ed.academic_year = ? OR ed.academic_year IS NULL)
           AND (ed.semester = ? OR ed.semester IS NULL)
           AND LOWER(TRIM(COALESCE(pes.status, ''))) IN ('submitted', 'completed', 'approved')`,
        [instructor.id, academicYear, semester]
      );
      const peerAverage = Number(peerScoreRow?.peer_score || 0);

      const [[deptScoreRow]] = await pool.query(
        `SELECT COALESCE(AVG(dhe.total_score), 0) AS dept_head_score
         FROM dept_head_evaluations dhe
         WHERE dhe.instructor_id = ?
           AND LOWER(TRIM(COALESCE(dhe.status, ''))) IN ('submitted', 'completed', 'approved')`,
        [instructor.id]
      );
      const deptHeadScore = Number(deptScoreRow?.dept_head_score || 0);
      const normalizedDeptHead = deptHeadScore <= 30 ? (deptHeadScore / 30) * 100 : deptHeadScore;
      const finalScore = hasCourseAssigned
        ? normalizeWeightedScore({ student: studentAverage, deptHead: deptHeadScore, peer: peerAverage })
        : Number(((normalizedDeptHead * 0.60) + (peerAverage * 0.40)).toFixed(2));
      const studentWeightedScore = hasCourseAssigned ? Number((Math.min(Math.max(studentAverage, 0), 20) / 20 * 100 * 0.5).toFixed(2)) : 0;
      const deptHeadWeightedScore = hasCourseAssigned
        ? Number((Math.min(Math.max(deptHeadScore, 0), 30) / 30 * 100 * 0.3).toFixed(2))
        : Number((normalizedDeptHead * 0.60).toFixed(2));
      const peerWeightedScore = hasCourseAssigned
        ? Number((Math.min(Math.max(peerAverage, 0), 20) / 20 * 100 * 0.2).toFixed(2))
        : Number((peerAverage * 0.40).toFixed(2));

      await pool.query(
        `INSERT INTO evaluation_results (instructor_id, department_id, academic_year, semester, student_average, student_score, peer_average, peer_score, dept_head_score, total_score, final_score)
         VALUES (?, (SELECT department_id FROM instructors WHERE id = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           department_id = VALUES(department_id),
           student_average = VALUES(student_average),
           student_score = VALUES(student_score),
           peer_average = VALUES(peer_average),
           peer_score = VALUES(peer_score),
           dept_head_score = VALUES(dept_head_score),
           total_score = VALUES(total_score),
           final_score = VALUES(final_score),
           published_at = CURRENT_TIMESTAMP`,
        [instructor.id, instructor.id, academicYear, semester, studentAverage, studentAverage, peerAverage, peerAverage, deptHeadScore, finalScore, finalScore]
      );

      await pool.query(
        `INSERT INTO evaluation_summaries (
            instructor_id, department_id,
            student_raw_percentage, student_weighted_score,
            dept_head_raw_percentage, dept_head_weighted_score,
            peer_raw_percentage, peer_weighted_score, total_weighted_score,
            is_published, published_at
          ) VALUES (?, (SELECT department_id FROM instructors WHERE id = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE
            department_id = VALUES(department_id),
            student_raw_percentage = VALUES(student_raw_percentage),
            student_weighted_score = VALUES(student_weighted_score),
            dept_head_raw_percentage = VALUES(dept_head_raw_percentage),
            dept_head_weighted_score = VALUES(dept_head_weighted_score),
            peer_raw_percentage = VALUES(peer_raw_percentage),
            peer_weighted_score = VALUES(peer_weighted_score),
            total_weighted_score = VALUES(total_weighted_score),
            is_published = 1,
            published_at = CURRENT_TIMESTAMP`,
        [instructor.id, instructor.id, studentAverage, studentWeightedScore, deptHeadScore, deptHeadWeightedScore, peerAverage, peerWeightedScore, finalScore]
      );

      results.push({
        instructor_id: instructor.id,
        student_average: Number(studentAverage.toFixed(2)),
        peer_average: Number(peerAverage.toFixed(2)),
        dept_head_score: Number(deptHeadScore.toFixed(2)),
        final_score: Number(finalScore.toFixed(2)),
      });
    }

    return res.json({ success: true, ready: true, published: results.length, results, message: 'Final results calculated and published successfully.' });
  } catch (error) {
    return sendServerError(res, error, 'final results publish error');
  }
});

router.post(['/peer-evaluations', '/submit-peer-evaluation'], async (req, res) => {
  const instructorId = Number(req.body?.instructorId || 0);
  const scores = req.body?.scores || {};
  const strengths = String(req.body?.strengths || '').trim();
  const suggestions = String(req.body?.suggestions || '').trim();
  const values = getRatedLikertValues(scores);
  const responseCount = Object.values(scores).filter((value) => isValidLikertResponse(value)).length;
  
  if (!instructorId || !responseCount || !values.length || responseCount !== Object.keys(scores).length) {
    return res.status(400).json({ message: 'Instructor and valid ratings for all criteria are required.' });
  }

  try {
    const [[directorProfile]] = await pool.query(
      'SELECT id, department_id FROM instructors WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );
    const departmentId = Number(directorProfile?.department_id || 0);
    if (!departmentId) return res.status(403).json({ message: 'Your department is not defined.' });

    const [[instructor]] = await pool.query(
      `SELECT i.id, i.user_id, i.department_id
       FROM instructors i
       INNER JOIN users u ON u.id = i.user_id
       WHERE (i.id = ? OR u.id = ?)
         AND i.department_id = ?
         AND u.id <> ?
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
         AND LOWER(u.role) IN ('instructor', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate')
       LIMIT 1`,
      [instructorId, instructorId, departmentId, req.user.id]
    );
    
    if (!instructor) return res.status(404).json({ message: 'Instructor not found.' });
    const academicYear = String(req.body?.academic_year || new Date().getFullYear());
    const semester = String(req.body?.semester || 'Semester I');
    if (!await isPeerPublicationActive(departmentId, academicYear, semester)) {
      return res.status(403).json({ message: 'Peer evaluation is not currently published.' });
    }

    // Peer publishing creates the assignment; submission cannot create a new target.
    const [[peerEval]] = await pool.query(
      `SELECT id FROM peer_evaluations
       WHERE evaluator_id = ? AND evaluatee_id = ? AND course_id IS NULL
         AND status IN ('pending', 'active', 'submitted')
       ORDER BY id DESC LIMIT 1`,
      [directorProfile.id, instructor.id]
    );

    let peerEvaluationId = peerEval?.id;
    if (!peerEvaluationId) {
      const [[peerDispatch]] = await pool.query(
        `SELECT deadline FROM evaluation_dispatches
         WHERE department_id = ? AND evaluation_type = 'peer'
           AND academic_year = ? AND semester = ?
         ORDER BY id DESC LIMIT 1`,
        [departmentId, academicYear, semester]
      );
      const [assignmentResult] = await pool.query(
        `INSERT IGNORE INTO peer_evaluations (evaluator_id, evaluatee_id, course_id, deadline, status)
         VALUES (?, ?, NULL, ?, 'pending')`,
        [directorProfile.id, instructor.id, peerDispatch?.deadline || null]
      );
      peerEvaluationId = assignmentResult.insertId;
    }

    if (!peerEvaluationId) {
      return res.status(400).json({ message: 'No active peer evaluation found for this instructor.' });
    }

    const score = Number(calculateLikertPercentage(scores).toFixed(2));
    
    // Check if submission already exists
    const [[existing]] = await pool.query(
      `SELECT id FROM peer_evaluation_submissions 
      WHERE peer_evaluation_id = ? AND evaluator_id = ? AND evaluatee_id = ? LIMIT 1`,
          [peerEvaluationId, req.user.id, instructor.id]
    );

    if (existing) {
      // Update existing submission
      await pool.query(
        `UPDATE peer_evaluation_submissions 
         SET score = ?, strengths = ?, suggestions = ?, responses = ?, status = 'submitted'
         WHERE peer_evaluation_id = ? AND evaluator_id = ? AND evaluatee_id = ?`,
        [score, strengths, suggestions, JSON.stringify(scores), peerEvaluationId, req.user.id, instructor.id]
      );
    } else {
      // Insert new submission
      await pool.query(
        `INSERT INTO peer_evaluation_submissions (peer_evaluation_id, evaluator_id, evaluatee_id, score, strengths, suggestions, responses, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')`,
        [peerEvaluationId, req.user.id, instructor.id, score, strengths, suggestions, JSON.stringify(scores)]
      );
    }

    await pool.query("UPDATE peer_evaluations SET status = 'submitted' WHERE id = ?", [peerEvaluationId]);
    await calculateAndSaveInstructorResult(instructor.id, academicYear, semester);

    return res.json({ success: true, score, status: 'submitted' });
  } catch (error) {
    return sendServerError(res, error, 'Peer evaluation submission error');
  }
});

module.exports = router;
