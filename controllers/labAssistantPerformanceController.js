const normalizePercentage = (value) => {
  const score = Number(value);
  return Number.isFinite(score) ? Math.min(Math.max(score, 0), 100) : 0;
};

const normalizeDepartmentHeadScore = (value) => {
  const score = normalizePercentage(value);
  return score > 0 && score <= 30
    ? Number((score / 30 * 100).toFixed(2))
    : score;
};

const calculateLabAssistantScore = ({
  studentRaw = 0,
  peerRaw = 0,
  deptHeadRaw = 0,
  hasAssignedCourses = false,
  studentSubmissionCount = 0,
  studentRequiredCount = 0,
  peerSubmissionCount = 0,
  deptHeadSubmissionCount = 0,
}) => {
  const student = normalizePercentage(studentRaw);
  const peer = normalizePercentage(peerRaw);
  const deptHead = normalizeDepartmentHeadScore(deptHeadRaw);
  const hasCourses = Boolean(hasAssignedCourses);

  const weights = hasCourses
    ? { student: 50, peer: 20, deptHead: 30 }
    : { student: 0, peer: 40, deptHead: 60 };
  const studentWeighted = Number((student * weights.student / 100).toFixed(2));
  const peerWeighted = Number((peer * weights.peer / 100).toFixed(2));
  const deptHeadWeighted = Number((deptHead * weights.deptHead / 100).toFixed(2));
  const activeWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const weightedSubtotal = Number((studentWeighted + peerWeighted + deptHeadWeighted).toFixed(2));
  const isStudentComplete = !hasCourses || (
    Number(studentRequiredCount) > 0
    && Number(studentSubmissionCount) >= Math.ceil(Number(studentRequiredCount) / 2)
  );
  const isPeerComplete = Number(peerSubmissionCount) >= 1;
  const isDeptHeadComplete = Number(deptHeadSubmissionCount) > 0;
  const isComplete = isStudentComplete && isPeerComplete && isDeptHeadComplete;

  return {
    studentRaw: Number(student.toFixed(2)),
    peerRaw: Number(peer.toFixed(2)),
    deptHeadRaw: Number(deptHead.toFixed(2)),
    studentWeighted,
    peerWeighted,
    deptHeadWeighted,
    weights,
    activeWeight,
    weightedSubtotal,
    totalScore: isComplete ? Number((weightedSubtotal / activeWeight * 100).toFixed(2)) : null,
    isComplete,
    isStudentComplete,
    isPeerComplete,
    isDeptHeadComplete,
    breakdown: {
      student: {
        rawPercentage: Number(student.toFixed(2)),
        weightedContribution: studentWeighted,
        weight: weights.student,
        isNA: !hasCourses,
      },
      deptHead: {
        rawPercentage: Number(deptHead.toFixed(2)),
        rawScore: Number(deptHead.toFixed(2)),
        weightedContribution: deptHeadWeighted,
        weight: weights.deptHead,
      },
      peer: {
        rawPercentage: Number(peer.toFixed(2)),
        weightedContribution: peerWeighted,
        weight: weights.peer,
      },
    },
  };
};

const getLabAssistantPerformance = async ({ staffId, userId, academicYear = '', semester = '', hasAssignedCoursesOverride }) => {
  const pool = require('../config/db');
  let resolvedAcademicYear = String(academicYear || '').trim();
  let resolvedSemester = String(semester || '').trim();

  const ids = [Number(staffId), Number(userId)];
  const periodFilter = `(? = '' OR ed.academic_year IS NULL OR ed.academic_year = ? OR ed.academic_year = SUBSTRING_INDEX(?, '/', 1))
    AND (? = '' OR ed.semester IS NULL OR LOWER(REPLACE(TRIM(ed.semester), 'semester', '')) = LOWER(REPLACE(TRIM(?), 'semester', '')))`;
  const [studentRows] = await pool.query(`
    SELECT ed.id AS dispatch_id, ses.score, ses.strengths, ses.improvements, ses.feedback
    FROM evaluation_dispatches ed
    INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
    WHERE ed.target_type = 'lab_assistant'
      AND ed.target_user_id IN (?, ?)
      AND ed.evaluation_type IN ('student', 'lab_assistant_student')
      AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved')
      AND ${periodFilter}
  `, [...ids, resolvedAcademicYear, resolvedAcademicYear, resolvedAcademicYear, resolvedSemester, resolvedSemester]);

  const [[studentTotals]] = await pool.query(`
    SELECT COUNT(DISTINCT ed.id) AS required_count
    FROM evaluation_dispatches ed
    WHERE ed.target_type = 'lab_assistant'
      AND ed.target_user_id IN (?, ?)
      AND ed.evaluation_type IN ('student', 'lab_assistant_student')
      AND ${periodFilter}
  `, [...ids, resolvedAcademicYear, resolvedAcademicYear, resolvedAcademicYear, resolvedSemester, resolvedSemester]);

  const [peerRows] = await pool.query(`
    SELECT pes.score, pes.strengths, pes.suggestions
    FROM peer_evaluations pe
    INNER JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
    LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
    WHERE (pe.evaluatee_id IN (?, ?) OR (ed.target_type = 'lab_assistant' AND ed.target_user_id IN (?, ?)))
      AND (ed.id IS NULL OR ed.evaluation_type IN ('peer', 'lab_assistant_peer'))
      AND LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved')
      AND (ed.id IS NULL OR (${periodFilter}))
  `, [...ids, ...ids, resolvedAcademicYear, resolvedAcademicYear, resolvedAcademicYear, resolvedSemester, resolvedSemester]);

  const [deptHeadRows] = await pool.query(`
    SELECT dhe.total_score AS score, dhe.strengths, dhe.weaknesses AS improvements, dhe.feedback
    FROM dept_head_evaluations dhe
    WHERE dhe.target_role = 'lab_assistant'
      AND (dhe.evaluatee_id IN (?, ?) OR dhe.instructor_id IN (?, ?))
      AND LOWER(COALESCE(dhe.status, 'pending')) IN ('submitted', 'completed', 'approved')
      AND (? = '' OR dhe.academic_year IS NULL OR dhe.academic_year = ? OR dhe.academic_year = SUBSTRING_INDEX(?, '/', 1))
      AND (? = '' OR dhe.semester IS NULL OR LOWER(REPLACE(TRIM(dhe.semester), 'semester', '')) = LOWER(REPLACE(TRIM(?), 'semester', '')))
  `, [...ids, ...ids, resolvedAcademicYear, resolvedAcademicYear, resolvedAcademicYear, resolvedSemester, resolvedSemester]);

  const [[assignment]] = await pool.query(`
    SELECT COUNT(*) AS assigned_course_count
    FROM course_assignments ca
    WHERE (ca.lab_assistant_id = ? OR ca.staff_id IN (?, ?))
      AND LOWER(COALESCE(ca.status, 'assigned')) NOT IN ('cancelled', 'inactive', 'unassigned')
      AND (? = '' OR ca.academic_year IS NULL OR LOWER(TRIM(ca.academic_year)) IN (LOWER(?), LOWER(SUBSTRING_INDEX(?, '/', 1))))
      AND (? = '' OR ca.semester IS NULL OR LOWER(REPLACE(TRIM(ca.semester), 'semester', '')) = LOWER(REPLACE(TRIM(?), 'semester', '')))
  `, [Number(staffId), Number(staffId), Number(userId), resolvedAcademicYear, resolvedAcademicYear, resolvedAcademicYear, resolvedSemester, resolvedSemester]);

  const average = (rows) => rows.length
    ? Number((rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length).toFixed(2))
    : 0;
  const deptHeadStoredScore = average(deptHeadRows);
  const studentSubmissionCount = new Set(studentRows.map((row) => row.dispatch_id)).size;
  const studentRequiredCount = Number(studentTotals?.required_count || 0);
  const hasAssignedCourses = hasAssignedCoursesOverride === undefined
    ? Number(assignment?.assigned_course_count || 0) > 0
    : Boolean(hasAssignedCoursesOverride);
  const evaluated = calculateLabAssistantScore({
    studentRaw: average(studentRows),
    peerRaw: average(peerRows),
    deptHeadRaw: deptHeadStoredScore,
    hasAssignedCourses,
    studentSubmissionCount,
    studentRequiredCount,
    peerSubmissionCount: peerRows.length,
    deptHeadSubmissionCount: deptHeadRows.length,
  });

  return {
    ...evaluated,
    studentRows,
    peerRows,
    deptHeadRows,
    deptHeadStoredScore,
    studentScore: evaluated.studentRaw,
    peerScore: evaluated.peerRaw,
    deptHeadScore: evaluated.deptHeadRaw,
    studentSubmissionCount,
    studentRequiredCount,
    peerSubmissionCount: peerRows.length,
    deptHeadSubmissionCount: deptHeadRows.length,
    hasAssignedCourses,
    academicYear: resolvedAcademicYear,
    semester: resolvedSemester,
  };
};

module.exports = { calculateLabAssistantScore, getLabAssistantPerformance };