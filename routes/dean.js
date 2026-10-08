const express = require('express');
const pool = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { calculateLikertPercentage, isValidLikertResponse } = require('../utils/likertScoring');
const { calculateAndSaveInstructorResult } = require('../utils/evaluationCalculator');
const { calculateDeanPerformanceScore } = require('../utils/deanPerformanceScore');
const { getDeptHeadLivePerformanceMetrics } = require('../services/evaluationMetrics');

const router = express.Router();
const getAcademicYearTokens = (academicYear) => {
  const tokens = String(academicYear || '').match(/(?:19|20)\d{2}/g);
  return [...new Set(tokens?.length ? tokens : [String(academicYear || '').trim()].filter(Boolean))];
};
const getSemesterTokens = (semester) => {
  const normalized = String(semester || '')
    .trim()
    .toLowerCase()
    .replace(/^semester\s*/, '')
    .replace(/\s+/g, '');
  if (['1', 'i', 'first'].includes(normalized)) return ['i', '1'];
  if (['2', 'ii', 'second'].includes(normalized)) return ['ii', '2'];
  if (['3', 'iii', 'third'].includes(normalized)) return ['iii', '3'];
  return [normalized];
};
const buildTermAssignmentFilters = (academicYearExpression, semesterExpression, academicYearTokens, semesterTokens) => {
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

const getCollegeId = async (req) => {
  const userId = Number(req.user?.id || req.user?.user_id || 0);
  if (!userId) return 0;

  const [[fallbackRow]] = await pool.query(
    `SELECT d.college_id FROM instructors i
     INNER JOIN departments d ON d.id = i.department_id
     WHERE i.user_id = ? LIMIT 1`,
    [userId]
  );
  return Number(fallbackRow?.college_id || 0);
};
const getActiveEvaluationPeriod = async () => {
  const [[period]] = await pool.query(
    `SELECT academic_year, semester FROM evaluation_periods
     WHERE LOWER(status) = 'active' ORDER BY id DESC LIMIT 1`
  );
  return {
    academicYear: String(period?.academic_year || '').trim(),
    semester: String(period?.semester || '').trim(),
  };
};
const sendError = (res, status, message) => res.status(status).json({ success: false, message });
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
  const [pairs] = await pool.query(
    `SELECT evaluator.id AS evaluator_id, evaluatee.id AS evaluatee_id
     FROM instructors evaluator
     INNER JOIN users evaluator_user ON evaluator_user.id = evaluator.user_id
     INNER JOIN instructors evaluatee ON evaluatee.department_id = evaluator.department_id
     INNER JOIN users evaluatee_user ON evaluatee_user.id = evaluatee.user_id
     WHERE evaluator.department_id = ?
       AND evaluator.id <> evaluatee.id
       AND LOWER(COALESCE(evaluator_user.status, 'active')) = 'active'
       AND LOWER(COALESCE(evaluatee_user.status, 'active')) = 'active'
      AND LOWER(evaluatee_user.role) IN ('instructor', 'peer_instructor')`,
    [departmentId]
  );

  for (const pair of pairs) {
    await pool.query(
      `INSERT IGNORE INTO peer_evaluations
         (evaluator_id, evaluatee_id, course_id, status)
       VALUES (?, ?, NULL, 'pending')`,
      [pair.evaluator_id, pair.evaluatee_id]
    );
  }
};

router.use(authenticateToken, authorizeRoles('college_dean', 'dean'));

router.get('/my-performance', async (req, res) => {
  try {
    const authenticatedUserId = req.user?.id ?? req.user?.user_id;
    if (authenticatedUserId == null) {
      return sendError(res, 401, 'Authenticated Dean profile was not found.');
    }
    const [[instructor]] = await pool.query(
      `SELECT i.id, i.user_id
       FROM instructors i
       LEFT JOIN users u ON CAST(u.id AS CHAR) = CAST(i.user_id AS CHAR)
       WHERE CAST(i.user_id AS CHAR) = CAST(? AS CHAR)
          OR CAST(i.id AS CHAR) = CAST(? AS CHAR)
          OR (? <> '' AND LOWER(TRIM(u.email)) = LOWER(TRIM(?)))
       ORDER BY CASE
         WHEN CAST(i.user_id AS CHAR) = CAST(? AS CHAR) THEN 0
         WHEN (? <> '' AND LOWER(TRIM(u.email)) = LOWER(TRIM(?))) THEN 1
         ELSE 2
       END
       LIMIT 1`,
      [
        authenticatedUserId,
        authenticatedUserId,
        String(req.user?.email || ''),
        String(req.user?.email || ''),
        authenticatedUserId,
        String(req.user?.email || ''),
        String(req.user?.email || ''),
      ]
    );
    const instructorId = instructor?.id == null ? null : Number(instructor.id);
    const instructorUserId = instructor?.user_id ?? authenticatedUserId;
    
    const [[activePeriod]] = await pool.query(
      `SELECT academic_year, semester FROM evaluation_periods
       WHERE LOWER(status) = 'active' ORDER BY id DESC LIMIT 1`
    );
    let academicYear = String(activePeriod?.academic_year || '2026').trim();
    let semester = String(activePeriod?.semester || 'Semester II').trim();
    const academicYearTokens = getAcademicYearTokens(academicYear);
    const [[assignedTerm]] = await pool.query(
      `SELECT ca.academic_year, ca.semester,
              COUNT(DISTINCT ca.id) AS course_count,
              COUNT(DISTINCT ses.id) AS evaluation_count,
              MAX(ca.id) AS latest_assignment_id
       FROM course_assignments ca
       LEFT JOIN evaluation_dispatches ed ON ed.assignment_id = ca.id
       LEFT JOIN student_evaluation_submissions ses
         ON ses.dispatch_id = ed.id
         AND LOWER(COALESCE(ses.status, '')) IN ('submitted', 'completed', 'approved')
       WHERE (
           CAST(ca.instructor_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR))
           OR (
             LOWER(COALESCE(ca.assigned_role, 'instructor')) <> 'lab_assistant'
             AND CAST(ca.staff_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR))
           )
         )
         AND LOWER(COALESCE(ca.status, 'assigned')) NOT IN ('unassigned', 'cancelled', 'inactive')
         AND (
           ca.academic_year IS NULL
           OR REPLACE(REPLACE(TRIM(ca.academic_year), '-', '/'), ' ', '') IN (${academicYearTokens.map(() => '?').join(', ')})
           OR SUBSTRING_INDEX(REPLACE(REPLACE(TRIM(ca.academic_year), '-', '/'), ' ', ''), '/', 1) IN (${academicYearTokens.map(() => '?').join(', ')})
           OR SUBSTRING_INDEX(REPLACE(REPLACE(TRIM(ca.academic_year), '-', '/'), ' ', ''), '/', -1) IN (${academicYearTokens.map(() => '?').join(', ')})
         )
       GROUP BY ca.academic_year, ca.semester
       ORDER BY evaluation_count DESC, latest_assignment_id DESC`,
      [
        instructorId,
        authenticatedUserId,
        instructorId,
        authenticatedUserId,
        ...academicYearTokens,
        ...academicYearTokens,
        ...academicYearTokens,
      ]
    );
    const [[currentTermAssignment]] = await pool.query(
      `SELECT COUNT(DISTINCT ca.id) AS course_count
       FROM course_assignments ca
       WHERE (
           CAST(ca.instructor_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR))
           OR (
             LOWER(COALESCE(ca.assigned_role, 'instructor')) <> 'lab_assistant'
             AND CAST(ca.staff_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR))
           )
         )
         AND LOWER(COALESCE(ca.status, 'assigned')) NOT IN ('unassigned', 'cancelled', 'inactive')
         AND (
           ca.academic_year IS NULL
           OR REPLACE(REPLACE(TRIM(ca.academic_year), '-', '/'), ' ', '') IN (${academicYearTokens.map(() => '?').join(', ')})
           OR SUBSTRING_INDEX(REPLACE(REPLACE(TRIM(ca.academic_year), '-', '/'), ' ', ''), '/', 1) IN (${academicYearTokens.map(() => '?').join(', ')})
           OR SUBSTRING_INDEX(REPLACE(REPLACE(TRIM(ca.academic_year), '-', '/'), ' ', ''), '/', -1) IN (${academicYearTokens.map(() => '?').join(', ')})
         )
         AND (
           ca.semester IS NULL
           OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(ca.semester), 'semester', ''), 'sem', ''), ' ', ''), '-', '')) =
              LOWER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(?), 'semester', ''), 'sem', ''), ' ', ''), '-', ''))
         )`,
      [
        instructorId,
        authenticatedUserId,
        instructorId,
        authenticatedUserId,
        ...academicYearTokens,
        ...academicYearTokens,
        ...academicYearTokens,
        semester,
      ]
    );
    if (Number(currentTermAssignment?.course_count || 0) === 0 && assignedTerm) {
      academicYear = String(assignedTerm.academic_year || academicYear).trim();
      semester = String(assignedTerm.semester || semester).trim();
    }
    const semesterTokens = getSemesterTokens(semester);
    const assignmentTermFilters = buildTermAssignmentFilters(
      'ca.academic_year',
      'ca.semester',
      academicYearTokens,
      semesterTokens
    );
    const [[courseRow]] = await pool.query(
      `SELECT COUNT(DISTINCT ca.id) AS course_count
       FROM course_assignments ca
       LEFT JOIN instructors assigned_instructor
         ON CAST(assigned_instructor.id AS CHAR) = CAST(ca.instructor_id AS CHAR)
       WHERE (
           CAST(assigned_instructor.user_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR))
           OR CAST(ca.instructor_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR))
           OR (LOWER(COALESCE(ca.assigned_role, 'instructor')) <> 'lab_assistant'
             AND CAST(ca.staff_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR)))
         )
         AND LOWER(COALESCE(ca.status, 'assigned')) NOT IN ('unassigned', 'cancelled', 'inactive')
         ${assignmentTermFilters.sql}`,
      [
        authenticatedUserId,
        instructorUserId,
        instructorId,
        authenticatedUserId,
        instructorId,
        authenticatedUserId,
        ...assignmentTermFilters.values,
      ]
    );
    const hasCourseAssigned = Number(courseRow?.course_count || 0) > 0;
    
    const [[studentRow]] = hasCourseAssigned
      ? await pool.query(
        `SELECT COALESCE(AVG(ses.score), 0) AS score, COUNT(DISTINCT ses.id) AS evaluation_count
         FROM student_evaluation_submissions ses
         INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
         WHERE EXISTS (
           SELECT 1
           FROM course_assignments ca
           LEFT JOIN instructors assigned_instructor
             ON CAST(assigned_instructor.id AS CHAR) = CAST(ca.instructor_id AS CHAR)
           WHERE (
               ca.id = ed.assignment_id
               OR (
                 ed.assignment_id IS NULL
                 AND ca.course_id = ed.course_id
                 AND COALESCE(ed.academic_year, ca.academic_year) = ca.academic_year
                 AND COALESCE(ed.semester, ca.semester) = ca.semester
               )
             )
             AND (
               CAST(assigned_instructor.user_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR))
               OR CAST(ca.instructor_id AS CHAR) = CAST(? AS CHAR)
               OR CAST(ca.instructor_id AS CHAR) = CAST(? AS CHAR)
               OR (LOWER(COALESCE(ca.assigned_role, 'instructor')) <> 'lab_assistant'
                 AND CAST(ca.staff_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR)))
             )
             AND LOWER(COALESCE(ca.status, 'assigned')) NOT IN ('unassigned', 'cancelled', 'inactive')
             ${assignmentTermFilters.sql}
         )
           AND LOWER(ses.status) IN ('submitted', 'completed', 'approved')`,
        [
          authenticatedUserId,
          instructorUserId,
          instructorId,
          authenticatedUserId,
          instructorId,
          authenticatedUserId,
          ...assignmentTermFilters.values,
        ]
      )
      : [[{ score: 0, evaluation_count: 0 }]];
    const [[peerRow]] = await pool.query(
        `SELECT COALESCE(AVG(pes.score), 0) AS score, COUNT(*) AS evaluation_count
         FROM peer_evaluation_submissions pes
         INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
         WHERE CAST(pe.evaluatee_id AS CHAR) IN (CAST(? AS CHAR), CAST(? AS CHAR))
           AND LOWER(pes.status) IN ('submitted', 'completed', 'approved')`,
        [instructorId, authenticatedUserId]
      );
    const [[directorateRow]] = await pool.query(
        `SELECT COALESCE(AVG(total_score), 0) AS score, COUNT(*) AS evaluation_count,
                MAX(strengths) AS strengths, MAX(weaknesses) AS weaknesses
         FROM directorate_evaluations
         WHERE CAST(dean_id AS CHAR) = CAST(? AS CHAR) AND LOWER(status) IN ('submitted', 'completed', 'approved')`,
        [authenticatedUserId]
      );

    const studentScore = Number(studentRow?.score || 0);
    const peerScore = Number(peerRow?.score || 0);
    const directorateScore = Number(directorateRow?.score || 0);
    const calculatedScore = calculateDeanPerformanceScore({
      student: studentScore,
      directorate: directorateScore,
      peer: peerScore,
      hasAssignedCourses: hasCourseAssigned,
    });
    const completion = {
      isStudentComplete: !hasCourseAssigned || Number(studentRow?.evaluation_count || 0) > 0,
      isDeptHeadOrDirectorComplete: Number(directorateRow?.evaluation_count || 0) > 0,
      isPeerComplete: Number(peerRow?.evaluation_count || 0) > 0,
    };
    const isComplete = completion.isStudentComplete && completion.isDeptHeadOrDirectorComplete && completion.isPeerComplete;
    const hasSubmittedEvaluations = Number(studentRow?.evaluation_count || 0) > 0
      || Number(directorateRow?.evaluation_count || 0) > 0
      || Number(peerRow?.evaluation_count || 0) > 0;
    const totalWeightedScore = calculatedScore.totalScore;
    const {
      studentWeight,
      directorateWeight,
      peerWeight,
      studentWeighted,
      directorateWeighted,
      peerWeighted,
    } = calculatedScore;
    
    const strengths = directorateRow?.strengths ? [directorateRow.strengths] : [];
    const improvements = directorateRow?.weaknesses ? [directorateRow.weaknesses] : [];

    return res.json({
      totalWeightedScore,
      totalScore: totalWeightedScore,
      isComplete,
      hasSubmittedEvaluations,
      statusBadge: isComplete ? (calculatedScore.totalScore >= 90 ? 'Excellent' : calculatedScore.totalScore >= 75 ? 'Satisfactory' : 'At Risk') : 'Pending Complete Evaluation',
      completion,
      hasCourseAssigned,
      hasAssignedCourses: hasCourseAssigned,
      isTeaching: hasCourseAssigned,
      assignedCourseCount: Number(courseRow?.course_count || 0),
      studentEvaluationCount: Number(studentRow?.evaluation_count || 0),
      academicYear,
      semester,
      activeWeight: calculatedScore.activeWeight,
      weightedSubtotal: calculatedScore.weightedSubtotal,
      isRescaled: !hasCourseAssigned,
      breakdown: {
        student: { 
          rawPercentage: hasCourseAssigned ? Number(studentScore.toFixed(2)) : null,
          weightedContribution: studentWeighted,
          weight: studentWeight,
          evaluationCount: Number(studentRow?.evaluation_count || 0),
          isNA: !hasCourseAssigned,
          status: hasCourseAssigned ? undefined : 'N/A - Non-Teaching Role',
        },
        directorate: { 
          rawPercentage: Number(directorateScore.toFixed(2)), 
          weightedContribution: directorateWeighted,
          weight: directorateWeight 
        },
        peer: { 
          rawPercentage: Number(peerScore.toFixed(2)), 
          weightedContribution: peerWeighted,
          weight: peerWeight 
        },
      },
      // Dynamic performance badging rules per Image 4:
      // >= 90%: "Excellent" (Green/Blue badge)
      // 75% - 89.9%: "Satisfactory" (Blue badge)
      // < 75%: "At Risk" (Amber/Red badge)
      status: isComplete ? (calculatedScore.totalScore >= 90 ? 'Excellent' : calculatedScore.totalScore >= 75 ? 'Satisfactory' : 'At Risk') : 'Pending Complete Evaluation',
      feedback: { strengths, improvements },
    });
  } catch (error) {
    console.error('Dean performance error:', error);
    return res.status(500).json({ message: 'Unable to load Dean performance.', error: error.message });
  }
});

router.get('/overview-stats', async (req, res) => {
  try {
    const collegeId = await getCollegeId(req);
    if (!collegeId) return sendError(res, 400, 'Your college is not configured. Contact an administrator.');
    const [departmentRows] = await pool.query(
      'SELECT COUNT(*) AS departmentsCount FROM departments WHERE college_id = ?',
      [collegeId]
    );
    const [evaluationRows] = await pool.query(
      `SELECT
        SUM(CASE WHEN dhe.id IS NULL OR LOWER(COALESCE(dhe.status, 'pending')) NOT IN ('submitted', 'completed', 'approved') THEN 1 ELSE 0 END) AS pendingDeptHeadEvals,
        SUM(CASE WHEN dhe.id IS NOT NULL AND LOWER(COALESCE(dhe.status, 'pending')) IN ('submitted', 'completed', 'approved') THEN 1 ELSE 0 END) AS completedEvals
       FROM instructors i
       INNER JOIN users u ON u.id = i.user_id AND LOWER(u.role) = 'dept_head'
        INNER JOIN departments d ON d.id = i.department_id AND d.college_id = ?
       LEFT JOIN dept_head_evaluations dhe ON dhe.instructor_id = i.id
         AND dhe.evaluator_id = ?
         AND YEAR(dhe.created_at) = YEAR(CURDATE())`,
      [collegeId, req.user.id]
    );

    return res.json({
      departmentsCount: Number(departmentRows[0]?.departmentsCount || 0),
      pendingDeptHeadEvals: Number(evaluationRows[0]?.pendingDeptHeadEvals || 0),
      completedEvals: Number(evaluationRows[0]?.completedEvals || 0),
    });
  } catch (error) {
    console.error('Dean overview stats error:', error);
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

router.get('/department-analytics', async (req, res) => {
  try {
    const collegeId = await getCollegeId(req);
    if (!collegeId) return sendError(res, 400, 'Your college is not configured.');
    const [rows] = await pool.query(
      `SELECT d.id AS department_id,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department_name,
        COALESCE(ROUND(AVG(e.total_score), 2), 0) AS average_score
       FROM departments d
       INNER JOIN colleges c ON c.id = d.college_id
       LEFT JOIN instructors i ON i.department_id = d.id
       LEFT JOIN evaluation_results e ON e.instructor_id = i.id
       WHERE d.college_id = ?
       GROUP BY d.id, d.department_name, d.name
       ORDER BY department_name ASC`,
      [collegeId]
    );
    return res.json(rows.map((row) => ({
      departmentId: row.department_id,
      department: row.department_name,
      averageScore: Number(row.average_score || 0),
      performance: Number(row.average_score || 0),
    })));
  } catch (error) {
    console.error('Dean department analytics error:', error);
    return sendError(res, 500, 'Unable to load college analytics.');
  }
});

const getDeanEvaluations = async (req, res) => {
  try {
    const collegeId = await getCollegeId(req);
    if (!collegeId) {
      return res.status(200).json([]);
    }

    const [rows] = await pool.query(
      `SELECT u.id AS dept_head_id,
        i.id AS instructorId,
        COALESCE(NULLIF(CONCAT_WS(' ', i.first_name, i.last_name), ''), u.email) AS full_name,
        CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS name,
        u.email,
        d.id AS departmentId,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department_name,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department,
        c.name AS college_name,
        dhe.id,
        COALESCE(dhe.total_score, 0) AS score,
        COALESCE(dhe.status, 'Pending') AS status,
        CASE WHEN dhe.id IS NOT NULL AND LOWER(dhe.status) IN ('submitted', 'completed', 'approved') THEN TRUE ELSE FALSE END AS isEvaluated,
        dhe.criteria_scores AS criteriaScores,
        dhe.strengths,
        dhe.weaknesses,
        NULL AS deadline
       FROM users u
       INNER JOIN instructors i ON i.user_id = u.id
       INNER JOIN departments d ON d.id = i.department_id
       INNER JOIN colleges c ON c.id = d.college_id
         AND c.id = ?
       LEFT JOIN dept_head_evaluations dhe ON dhe.instructor_id = i.id AND dhe.evaluator_id = ?
       WHERE LOWER(u.role) IN ('dept_head', 'department_head')
       ORDER BY department_name ASC, full_name ASC`,
      [collegeId, req.user.id]
    );
    return res.json(rows.map((row) => ({
      ...row,
      score: Number(row.score || 0),
      isEvaluated: Boolean(row.isEvaluated),
      name: row.full_name || row.name || row.email,
          department: row.department_name || row.department || 'Unassigned Department',
    })));
  } catch (error) {
    console.error('Dean department heads error:', error);
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
  };

router.get('/evaluations', getDeanEvaluations);
router.get('/dept-heads', getDeanEvaluations);
router.get('/dept-head-evaluations', getDeanEvaluations);

const getDepartmentHeadsForDean = async (req, res) => {
  try {
    const collegeId = await getCollegeId(req);
    if (!collegeId) return sendError(res, 400, 'Your college is not configured.');
    const [rows] = await pool.query(
      `SELECT i.id AS department_head_id,
        i.id AS instructor_id,
        COALESCE(NULLIF(CONCAT_WS(' ', i.first_name, i.last_name), ''), u.email) AS department_head_name,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department,
        COALESCE(dhe.deadline, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%Y-%m-%d')) AS deadline,
        dhe.id AS evaluation_id,
        COALESCE(dhe.status, 'PENDING') AS status,
        COALESCE(dhe.total_score, 0) AS score,
        dhe.criteria_scores,
        dhe.strengths,
        dhe.weaknesses,
        CASE WHEN dhe.id IS NOT NULL AND LOWER(dhe.status) IN ('submitted', 'completed', 'approved') THEN TRUE ELSE FALSE END AS is_evaluated
       FROM instructors i
      INNER JOIN users u ON u.id = i.user_id AND LOWER(u.role) IN ('dept_head', 'department_head')
       INNER JOIN departments d ON d.id = i.department_id AND d.college_id = ?
       LEFT JOIN dept_head_evaluations dhe ON dhe.instructor_id = i.id AND dhe.evaluator_id = ?
       ORDER BY department ASC, department_head_name ASC`,
      [collegeId, req.user.id]
    );
    return res.json(rows.map((row) => ({
      ...row,
      score: Number(row.score || 0),
      is_evaluated: Boolean(row.is_evaluated),
    })));
  } catch (error) {
    console.error('Dean department head list error:', error);
    return sendError(res, 500, 'Unable to load Department Head evaluations.');
  }
};

router.get(['/department-heads', '/dept-heads-to-evaluate'], getDepartmentHeadsForDean);

const saveDepartmentHeadEvaluation = async (req, res) => {
  const instructorId = Number(req.body?.instructor_id || req.body?.instructorId || 0);
  const criteriaScores = req.body?.criteria_scores || req.body?.criteriaScores || {};
  const totalScore = Number(req.body?.total_score ?? req.body?.totalScore ?? 0);
  const strengths = String(req.body?.strengths || '').trim();
  const weaknesses = String(req.body?.weaknesses || '').trim();
  const deadline = String(req.body?.deadline || '').trim() || null;
  try {
    const collegeId = await getCollegeId(req);
    const { academicYear, semester } = await getActiveEvaluationPeriod();
    if (!collegeId || !instructorId || !Number.isFinite(totalScore) || totalScore < 0 || totalScore > 30) {
      return sendError(res, 400, 'Department Head and a score from 0 to 30 are required.');
    }
    const [targets] = await pool.query(
      `SELECT i.id, i.department_id FROM instructors i
       INNER JOIN users u ON u.id = i.user_id AND LOWER(u.role) = 'dept_head'
       INNER JOIN departments d ON d.id = i.department_id AND d.college_id = ?
       WHERE i.id = ? LIMIT 1`,
      [collegeId, instructorId]
    );
    if (!targets.length) return sendError(res, 404, 'Department Head was not found in your college.');
    await pool.query(
      `INSERT INTO dept_head_evaluations
        (evaluator_id, instructor_id, department_id, academic_year, semester, criteria_scores, strengths, weaknesses, total_score, deadline, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%Y-%m-%d')), 'SUBMITTED')
       ON DUPLICATE KEY UPDATE academic_year = VALUES(academic_year), semester = VALUES(semester), criteria_scores = VALUES(criteria_scores), strengths = VALUES(strengths), weaknesses = VALUES(weaknesses), total_score = VALUES(total_score), deadline = COALESCE(VALUES(deadline), deadline), status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, instructorId, targets[0].department_id, academicYear, semester, JSON.stringify(criteriaScores), strengths, weaknesses, totalScore, deadline]
    );
    return res.json({ success: true, message: 'Department Head evaluation submitted.' });
  } catch (error) {
    console.error('Dean Department Head evaluation save error:', error);
    return sendError(res, 500, 'Unable to save Department Head evaluation.');
  }
};

router.post('/dept-head-evaluations', saveDepartmentHeadEvaluation);

router.put('/dept-head-evaluations/:id', async (req, res) => {
  const evaluationId = Number(req.params.id || 0);
  const criteriaScores = req.body?.criteria_scores || req.body?.criteriaScores || {};
  const totalScore = Number(req.body?.total_score ?? req.body?.totalScore ?? 0);
  const strengths = String(req.body?.strengths || '').trim();
  const weaknesses = String(req.body?.weaknesses || '').trim();
  try {
    const collegeId = await getCollegeId(req);
    const { academicYear, semester } = await getActiveEvaluationPeriod();
    if (!collegeId || !evaluationId || !Number.isFinite(totalScore) || totalScore < 0 || totalScore > 30) {
      return sendError(res, 400, 'Valid evaluation ID and score from 0 to 30 are required.');
    }
    const [result] = await pool.query(
      `UPDATE dept_head_evaluations dhe
       INNER JOIN instructors i ON i.id = dhe.instructor_id
       INNER JOIN departments d ON d.id = i.department_id AND d.college_id = ?
       SET dhe.academic_year = ?, dhe.semester = ?, dhe.criteria_scores = ?, dhe.strengths = ?, dhe.weaknesses = ?, dhe.total_score = ?, dhe.status = 'SUBMITTED', dhe.updated_at = CURRENT_TIMESTAMP
       WHERE dhe.id = ? AND dhe.evaluator_id = ?`,
      [collegeId, academicYear, semester, JSON.stringify(criteriaScores), strengths, weaknesses, totalScore, evaluationId, req.user.id]
    );
    if (!result.affectedRows) return sendError(res, 404, 'Department Head evaluation was not found.');
    return res.json({ success: true, message: 'Department Head evaluation updated.' });
  } catch (error) {
    console.error('Dean Department Head evaluation update error:', error);
    return sendError(res, 500, 'Unable to update Department Head evaluation.');
  }
});

const submitDepartmentHeadEvaluation = async (req, res) => {
  const instructorId = Number(req.body?.instructorId || 0);
  const criteriaScores = req.body?.criteriaScores || {};
  const totalScore = Number(req.body?.totalScore || 0);
  const strengths = String(req.body?.strengths || '').trim();
  const weaknesses = String(req.body?.weaknesses || '').trim();

  try {
    const collegeId = await getCollegeId(req);
    const { academicYear, semester } = await getActiveEvaluationPeriod();
    if (!collegeId || !instructorId || !Number.isFinite(totalScore)) return sendError(res, 400, 'Instructor and evaluation scores are required.');

    const [targetRows] = await pool.query(
      `SELECT i.id, i.department_id FROM instructors i
       INNER JOIN users u ON u.id = i.user_id AND LOWER(u.role) = 'dept_head'
       INNER JOIN departments d ON d.id = i.department_id
      WHERE (i.id = ? OR u.id = ?) AND d.college_id = ? LIMIT 1`,
          [instructorId, instructorId, collegeId]
    );
    if (!targetRows.length) return sendError(res, 404, 'Department Head was not found in your college.');

    await pool.query(
      `INSERT INTO dept_head_evaluations (evaluator_id, instructor_id, department_id, academic_year, semester, criteria_scores, strengths, weaknesses, total_score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
       ON DUPLICATE KEY UPDATE academic_year = VALUES(academic_year), semester = VALUES(semester), criteria_scores = VALUES(criteria_scores), strengths = VALUES(strengths), weaknesses = VALUES(weaknesses), total_score = VALUES(total_score), status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, instructorId, targetRows[0].department_id, academicYear, semester, JSON.stringify(criteriaScores), strengths, weaknesses, totalScore]
    );
    return res.json({ success: true, message: 'Department Head evaluation submitted.' });
  } catch (error) {
    console.error('Dean department head evaluation error:', error);
    return sendError(res, 500, 'Unable to submit Department Head evaluation.');
  }
};

router.post('/evaluate-dept-head', submitDepartmentHeadEvaluation);
router.post('/submit-evaluation', submitDepartmentHeadEvaluation);

router.get('/faculty-performance', async (req, res) => {
  try {
    const collegeId = await getCollegeId(req);
    if (!collegeId) return sendError(res, 400, 'Your college is not configured.');
    const [rows] = await pool.query(
      `SELECT i.id AS instructorId,
        CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS name,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department,
        COALESCE(er.total_score, 0) AS score,
        CASE WHEN er.id IS NULL THEN 'Pending' WHEN er.total_score >= 70 THEN 'Good' ELSE 'Needs Improvement' END AS status
       FROM instructors i
      INNER JOIN users u ON u.id = i.user_id AND LOWER(u.role) IN ('instructor', 'dept_head', 'department_head')
       INNER JOIN departments d ON d.id = i.department_id AND d.college_id = ?
       LEFT JOIN evaluation_results er ON er.instructor_id = i.id
       ORDER BY department ASC, name ASC`,
      [collegeId]
    );
    return res.json(rows.map((row) => ({ ...row, score: Number(row.score || 0) })));
  } catch (error) {
    console.error('Dean faculty performance error:', error);
    return sendError(res, 500, 'Unable to load faculty performance.');
  }
});

router.get('/reports', async (req, res) => {
  try {
    const collegeId = await getCollegeId(req);
    if (!collegeId) return sendError(res, 400, 'Your college is not configured.');
    const [rows] = await pool.query(
      `SELECT i.id AS instructor_id, i.user_id, i.department_id, u.role,
        TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS name,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department_name,
        c.name AS college_name,
        COALESCE(er.academic_year, YEAR(CURDATE())) AS academic_year,
        COALESCE(er.semester, 'Semester I') AS semester
       FROM instructors i
       INNER JOIN users u ON u.id = i.user_id
       INNER JOIN departments d ON d.id = i.department_id
       INNER JOIN colleges c ON c.id = d.college_id
       LEFT JOIN evaluation_results er ON er.id = (
         SELECT latest.id
         FROM evaluation_results latest
         WHERE latest.instructor_id = i.id
         ORDER BY latest.published_at DESC, latest.id DESC
         LIMIT 1
       )
       WHERE d.college_id = ?
         AND LOWER(u.role) IN ('dept_head', 'department_head')
       ORDER BY department_name ASC, name ASC`,
      [collegeId]
    );
    const reportRows = await Promise.all(rows.map(async (row) => {
      const metrics = await getDeptHeadLivePerformanceMetrics({
        instructorId: row.instructor_id,
        departmentId: row.department_id,
        academicYear: row.academic_year,
        semester: row.semester,
      });
      const weighted = metrics.weighted;
      const hasCourseAssigned = metrics.hasAssignedCourse;
      const courseCount = hasCourseAssigned ? 1 : 0;
      const finalScore = weighted.totalWeightedScore;
      const gradeClassification = finalScore >= 85
        ? 'Excellent'
        : finalScore >= 75
          ? 'Very Good'
          : finalScore >= 60
            ? 'Good'
            : 'Needs Improvement';

      return {
        ...row,
        user_role: 'Department Head',
        course_count: courseCount,
        student_form_published: hasCourseAssigned,
        hasCourseAssigned,
        has_course_assigned: hasCourseAssigned,
        student_average: weighted.breakdown.student.rawPercentage,
        raw_student_score: weighted.breakdown.student.rawPercentage,
        dept_head_score: weighted.breakdown.deptHead.rawPercentage,
        raw_dean_score: weighted.breakdown.deptHead.rawPercentage,
        dean_raw: weighted.breakdown.deptHead.rawPercentage,
        peer_average: weighted.breakdown.peer.rawPercentage,
        raw_peer_score: weighted.breakdown.peer.rawPercentage,
        peer_raw: weighted.breakdown.peer.rawPercentage,
        weightedStudent: weighted.studentWeighted,
        weightedDean: weighted.deptHeadWeighted,
        weightedPeer: weighted.peerWeighted,
        student_weighted_score: weighted.studentWeighted,
        dept_head_weighted_score: weighted.deptHeadWeighted,
        peer_weighted_score: weighted.peerWeighted,
        final_score: finalScore,
        finalScore,
        grade_classification: gradeClassification,
      };
    }));
    return res.json(reportRows);
  } catch (error) {
    console.error('Dean reports query error:', error);
    return sendError(res, 500, 'Unable to load Department Head reports.');
  }
});

router.get('/evaluation-tracking', async (req, res) => {
  try {
    const collegeId = await getCollegeId(req);
    if (!collegeId) return sendError(res, 400, 'Your college is not configured.');
    const [rows] = await pool.query(
      `SELECT d.id AS department_id,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department,
        i.id AS instructor_id,
        u.id AS user_id,
        CONCAT_WS(' ', i.first_name, i.last_name) AS department_head_name
       FROM departments d
       INNER JOIN instructors i ON i.department_id = d.id
       INNER JOIN users u ON u.id = i.user_id
       WHERE d.college_id = ?
         AND LOWER(u.role) IN ('dept_head', 'department_head')
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
       ORDER BY department ASC, department_head_name ASC`,
      [collegeId]
    );
    const [[activePeriod]] = await pool.query(
      `SELECT academic_year, semester FROM evaluation_periods
       WHERE LOWER(status) = 'active' ORDER BY id DESC LIMIT 1`
    );
    const trackingRows = await Promise.all(rows.map(async (row) => {
      const metrics = await getDeptHeadLivePerformanceMetrics({
        instructorId: row.instructor_id,
        departmentId: row.department_id,
        academicYear: activePeriod?.academic_year || '',
        semester: activePeriod?.semester || '',
      });
      const weighted = metrics.weighted;
      const hasCourseAssigned = metrics.hasAssignedCourse;
      const requiredEvaluations = hasCourseAssigned ? 3 : 2;
      const completedEvaluations = Number(!hasCourseAssigned || metrics.studentRows.length > 0)
        + Number(metrics.deanRows.length > 0)
        + Number(metrics.incomingPeerCount > 0);

      return {
        ...row,
        department_head_id: row.user_id,
        hasCourseAssigned,
        has_course_assigned: hasCourseAssigned,
        student_score: weighted.breakdown.student.rawPercentage,
        student_average: weighted.breakdown.student.rawPercentage,
        dept_head_average: weighted.breakdown.deptHead.rawPercentage,
        dept_head_is_normalized: true,
        peer_average: weighted.breakdown.peer.rawPercentage,
        total_instructors: requiredEvaluations,
        completed_evaluations: completedEvaluations,
        completion_rate: Number(((completedEvaluations / requiredEvaluations) * 100).toFixed(2)),
        student_weighted_score: weighted.studentWeighted,
        dept_head_weighted_score: weighted.deptHeadWeighted,
        peer_weighted_score: weighted.peerWeighted,
        final_score: weighted.totalWeightedScore,
        total_score: weighted.totalWeightedScore,
      };
    }));
    return res.json(trackingRows);
  } catch (error) {
    console.error('Dean evaluation tracking error:', error);
    return sendError(res, 500, 'Unable to load evaluation tracking.');
  }
});

router.get('/peer-evaluations', async (req, res) => {
  try {
    const deanUserId = Number(req.user?.id || 0);
    let departmentId = Number(req.user?.department_id || 0);
    let deanInstructorId = Number(req.user?.instructor_id || 0);
    if (!departmentId || !deanInstructorId) {
      const [[deanProfile]] = await pool.query(
        `SELECT i.id AS instructor_id, i.department_id
         FROM instructors i
         WHERE i.user_id = ? LIMIT 1`,
        [deanUserId]
      );
      departmentId = departmentId || Number(deanProfile?.department_id || 0);
      deanInstructorId = deanInstructorId || Number(deanProfile?.instructor_id || 0);
    }
    const academicYear = String(req.query.academic_year || new Date().getFullYear());
    const semester = String(req.query.semester || 'Semester I');
    if (!departmentId || !deanInstructorId || !await isPeerPublicationActive(departmentId, academicYear, semester)) {
      return res.json([]);
    }
    const [rows] = await pool.query(
      `SELECT i.id AS instructorId,
        i.user_id,
        LOWER(u.role) AS role,
        COALESCE(CONCAT(i.first_name, ' ', i.last_name), u.email) AS full_name,
        COALESCE(CONCAT(i.first_name, ' ', i.last_name), u.email) AS name,
        u.email,
        d.id AS departmentId,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department_name,
        COALESCE(NULLIF(d.department_name, ''), d.name) AS department,
        pe.id AS peer_evaluation_id,
        COALESCE(
          (SELECT deadline FROM evaluation_periods WHERE status = 'active' ORDER BY id DESC LIMIT 1),
          NULLIF(pe.deadline, ''),
          DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 3 DAY), '%Y-%m-%d')
        ) AS deadline,
        COALESCE(pes.id, pe.id) AS evaluation_id,
        COALESCE(pes.status, 'pending') AS status,
        CASE
          WHEN pes.score IS NULL THEN 0
          WHEN pes.score <= 5 THEN ROUND(pes.score * 20, 2)
          ELSE ROUND(pes.score, 2)
        END AS total_score,
        CASE
          WHEN pes.score IS NULL THEN NULL
          WHEN pes.score <= 5 THEN ROUND(pes.score * 20, 2)
          ELSE ROUND(pes.score, 2)
        END AS overall_score,
        CASE
          WHEN pes.score IS NULL THEN 0
          WHEN pes.score <= 5 THEN ROUND(pes.score * 20, 2)
          ELSE ROUND(pes.score, 2)
        END AS score,
        COALESCE(pes.strengths, '') AS strengths,
        COALESCE(pes.suggestions, '') AS suggestions,
        COALESCE(pes.responses, '{}') AS responses,
        CASE WHEN pes.id IS NOT NULL AND LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved') THEN TRUE ELSE FALSE END AS isEvaluated
       FROM instructors i
       INNER JOIN users u ON u.id = i.user_id
       INNER JOIN departments d ON d.id = i.department_id
      LEFT JOIN peer_evaluations pe ON pe.evaluatee_id = i.id
       AND pe.evaluator_id = ?
        AND pe.evaluator_id <> i.id
        AND pe.course_id IS NULL
      LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
       AND pes.evaluator_id = ?
       WHERE i.department_id = ?
         AND u.id <> ?
         AND LOWER(u.role) IN ('instructor', 'peer_instructor')
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
       ORDER BY department_name ASC, full_name ASC`,
      [deanInstructorId, deanUserId, departmentId, deanUserId]
    );

    const uniqueRows = new Map();
    rows.forEach((row) => {
      const key = Number(row.instructorId || row.user_id || 0);
      const current = uniqueRows.get(key);
      if (!current || Number(row.evaluation_id || 0) > Number(current.evaluation_id || 0)) {
        uniqueRows.set(key, row);
      }
    });

    return res.json([...uniqueRows.values()].map((row) => ({
      ...row,
      total_score: Number(row.total_score ?? row.overall_score ?? row.score ?? 0),
      overall_score: row.overall_score == null ? null : Number(row.overall_score),
      score: Number(row.total_score ?? row.overall_score ?? row.score ?? 0),
      isEvaluated: Boolean(row.isEvaluated),
      name: row.full_name || row.name || row.email,
      department: row.department_name || row.department || 'Unassigned Department',
    })));
  } catch (error) {
    console.error('Dean peer evaluations error:', error);
    return res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

router.post('/peer-evaluations', async (req, res) => {
  const instructorId = Number(req.body?.instructorId || 0);
  const responses = req.body?.responses || {};
  const strengths = String(req.body?.strengths || '').trim();
  const suggestions = String(req.body?.suggestions || '').trim();
  const score = calculateLikertPercentage(responses);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [[deanProfile]] = await connection.query(
      'SELECT id, department_id FROM instructors WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );
    const departmentId = Number(deanProfile?.department_id || 0);
    const deanInstructorId = Number(deanProfile?.id || 0);
    if (!departmentId || !deanInstructorId || !instructorId || !Object.keys(responses).length || !Object.values(responses).every(isValidLikertResponse)) {
      return sendError(res, 400, 'Instructor and evaluation score are required.');
    }
    const academicYear = String(req.body?.academic_year || new Date().getFullYear());
    const semester = String(req.body?.semester || 'Semester I');
    if (!await isPeerPublicationActive(departmentId, academicYear, semester)) {
      return sendError(res, 403, 'Peer evaluation is not currently published.');
    }

    const [targetRows] = await connection.query(
      `SELECT i.id, i.department_id FROM instructors i
       INNER JOIN users u ON u.id = i.user_id
       WHERE i.id = ? AND i.department_id = ?
         AND i.id <> ?
         AND LOWER(u.role) IN ('instructor', 'college_dean', 'dean', 'lab_assistant')
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
       LIMIT 1`,
      [instructorId, departmentId, deanInstructorId]
    );

    if (!targetRows.length) {
      return sendError(res, 404, 'Instructor was not found in your department.');
    }

    const [[peerDispatch]] = await connection.query(
      `SELECT deadline FROM evaluation_dispatches
       WHERE department_id = ? AND evaluation_type = 'peer'
         AND academic_year = ? AND semester = ?
       ORDER BY id DESC LIMIT 1`,
      [departmentId, academicYear, semester]
    );
    const [assignmentResult] = await connection.query(
      `INSERT INTO peer_evaluations (evaluator_id, evaluatee_id, course_id, deadline, status)
       VALUES (?, ?, NULL, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         deadline = VALUES(deadline),
         id = LAST_INSERT_ID(id)`,
      [deanInstructorId, instructorId, peerDispatch?.deadline || null]
    );
    const peerEvalId = assignmentResult.insertId;

    // Check if submission exists
    const [[existingSubmission]] = await connection.query(
      `SELECT id FROM peer_evaluation_submissions WHERE peer_evaluation_id = ? AND evaluator_id = ? LIMIT 1`,
      [peerEvalId, req.user.id]
    );

    if (existingSubmission?.id) {
      // Update existing
      await connection.query(
        `UPDATE peer_evaluation_submissions SET score = ?, strengths = ?, suggestions = ?, responses = ?, status = 'submitted'
         WHERE peer_evaluation_id = ? AND evaluator_id = ?`,
        [score, strengths, suggestions, JSON.stringify(responses), peerEvalId, req.user.id]
      );
    } else {
      // Insert new
      await connection.query(
        `INSERT INTO peer_evaluation_submissions (peer_evaluation_id, evaluator_id, evaluatee_id, score, strengths, suggestions, responses, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')`,
        [peerEvalId, req.user.id, instructorId, score, strengths, suggestions, JSON.stringify(responses)]
      );
    }

    // Update peer_evaluations status
    const [statusResult] = await connection.query(
      `UPDATE peer_evaluations
        SET status = 'submitted', submitted_at = NOW()
       WHERE id = ? AND evaluator_id = ?`,
      [peerEvalId, deanInstructorId]
    );
    if (!statusResult.affectedRows) {
      throw new Error('Peer evaluation assignment was not found for this evaluator.');
    }

    await calculateAndSaveInstructorResult(instructorId, academicYear, semester, connection);
    await connection.commit();
    return res.json({ success: true, message: 'Peer evaluation submitted successfully.' });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Dean peer evaluation rollback error:', rollbackError); }
    console.error('Dean peer evaluation submission error:', error);
    return sendError(res, 500, 'Unable to submit peer evaluation.');
  } finally {
    connection.release();
  }
});

router.put('/peer-evaluations/:id', async (req, res) => {
  const evaluationIdentifier = Number(req.params.id || 0);
  const responses = req.body?.responses || {};
  const strengths = String(req.body?.strengths || '').trim();
  const suggestions = String(req.body?.suggestions || '').trim();
  const score = Number(req.body?.score || 0);

  try {
    const [[deanProfile]] = await pool.query(
      'SELECT department_id FROM instructors WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );
    const departmentId = Number(deanProfile?.department_id || 0);
    if (!departmentId || !evaluationIdentifier || !Number.isFinite(score)) {
      return sendError(res, 400, 'Valid submission ID and score are required.');
    }
    const academicYear = String(req.body?.academic_year || new Date().getFullYear());
    const semester = String(req.body?.semester || 'Semester I');
    if (!await isPeerPublicationActive(departmentId, academicYear, semester)) {
      return sendError(res, 403, 'Peer evaluation is not currently published.');
    }

    // Accept either the submission primary key or its peer evaluation foreign key.
    const [[submission]] = await pool.query(
      `SELECT pes.id, pes.peer_evaluation_id, pe.evaluatee_id
       FROM peer_evaluation_submissions pes
       INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
      INNER JOIN instructors i ON i.id = pe.evaluatee_id
      INNER JOIN users target_user ON target_user.id = i.user_id
       INNER JOIN departments d ON d.id = i.department_id
       WHERE (pes.id = ? OR pes.peer_evaluation_id = ?)
         AND pes.evaluator_id = ?
         AND d.id = ?
         AND LOWER(target_user.role) IN ('instructor', 'peer_instructor')
       ORDER BY CASE WHEN pes.id = ? THEN 0 ELSE 1 END
       LIMIT 1`,
      [evaluationIdentifier, evaluationIdentifier, req.user.id, departmentId, evaluationIdentifier]
    );

    if (!submission) {
      return sendError(res, 404, 'Peer evaluation submission not found.');
    }

    await pool.query(
      `UPDATE peer_evaluation_submissions SET score = ?, strengths = ?, suggestions = ?, responses = ?, status = 'submitted'
       WHERE id = ?`,
      [score, strengths, suggestions, JSON.stringify(responses), submission.id]
    );
    await pool.query(
      `UPDATE peer_evaluations SET status = 'submitted', submitted_at = NOW() WHERE id = ? AND evaluator_id = (
        SELECT id FROM instructors WHERE user_id = ? LIMIT 1
      )`,
      [submission.peer_evaluation_id, req.user.id]
    );
    await calculateAndSaveInstructorResult(submission.evaluatee_id, academicYear, semester);

    return res.json({ success: true, message: 'Peer evaluation updated successfully.' });
  } catch (error) {
    console.error('Dean peer evaluation update error:', error);
    return sendError(res, 500, 'Unable to update peer evaluation.');
  }
});

module.exports = router;
