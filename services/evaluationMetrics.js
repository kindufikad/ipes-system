const pool = require('../config/db');
const { getInstructorRoleStatus } = require('../utils/evaluationCalculator');

const COMPLETED = "('submitted', 'completed', 'approved', 'published')";

const number = (value) => Number(value || 0);
const normalizeDeptHead = (value) => {
  const score = number(value);
  return score > 0 && score <= 30 ? Number(((score / 30) * 100).toFixed(2)) : Number(Math.min(Math.max(score, 0), 100).toFixed(2));
};
const buildInstructorAssignmentFilter = (instructorId, identity) => {
  const predicates = [
    'ca.instructor_id IN (?, ?)',
    "(ca.lab_assistant_id IS NULL AND LOWER(COALESCE(ca.assigned_role, 'instructor')) <> 'lab_assistant' AND ca.staff_id IN (?, ?))",
  ];
  const params = [instructorId, identity.userId || instructorId, instructorId, identity.userId || instructorId];
  if (identity.hasInstructorEmailColumn && identity.email) {
    predicates.push('LOWER(TRIM(ca.instructor_email)) = LOWER(TRIM(?))');
    params.push(identity.email);
  }
  return { sql: `(${predicates.join(' OR ')})`, params };
};
const buildStudentAssignmentExists = (assignmentFilter) => `EXISTS (
  SELECT 1
  FROM course_assignments ca
  LEFT JOIN courses c ON c.id = ca.course_id
  WHERE ${assignmentFilter.sql}
    AND (
      ca.id = ed.assignment_id
      OR (
        ed.assignment_id IS NULL
        AND (
          (ed.course_id IS NOT NULL AND ca.course_id = ed.course_id)
          OR (ed.course_code IS NOT NULL AND LOWER(TRIM(c.code)) = LOWER(TRIM(ed.course_code)))
        )
      )
    )
)`;
const calculateWeightedPerformance = ({ student = 0, peer = 0, deptHead = 0, hasAssignedCourse = true, isDepartmentHead = false }) => {
  const studentRaw = number(student);
  const peerRaw = Number(Math.min(Math.max(number(peer), 0), 100).toFixed(2));
  const deptHeadRaw = normalizeDeptHead(deptHead);
  const studentWeight = hasAssignedCourse ? 0.5 : 0;
  const peerWeight = hasAssignedCourse ? 0.2 : 0.4;
  const deptHeadWeight = hasAssignedCourse ? 0.3 : 0.6;
  const studentWeighted = Number((studentRaw * studentWeight).toFixed(2));
  const peerWeighted = Number((peerRaw * peerWeight).toFixed(2));
  const deptHeadWeighted = Number((deptHeadRaw * deptHeadWeight).toFixed(2));
  const rawSubtotal = Number((studentWeighted + deptHeadWeighted + peerWeighted).toFixed(2));
  const activeWeight = 100;
  const totalScore = rawSubtotal;
  const warning = hasAssignedCourse ? '' : 'No course was assigned; student evaluation is excluded and the remaining weights are rescaled to 100%.';
  return {
    studentRaw,
    peerRaw,
    deptHeadRaw,
    studentWeighted,
    peerWeighted,
    deptHeadWeighted,
    studentWeight: studentWeight * 100,
    peerWeight: peerWeight * 100,
    deptHeadWeight: deptHeadWeight * 100,
    activeWeight,
    rawSubtotal,
    totalScore,
    totalWeightedScore: totalScore,
    hasAssignedCourse: Boolean(hasAssignedCourse),
    isDepartmentHead: Boolean(isDepartmentHead),
    warning,
    breakdown: {
      student: {
        rawPercentage: Number(studentRaw.toFixed(2)),
        rawScore: Number(studentRaw.toFixed(2)),
        weightedContribution: studentWeighted,
        weight: studentWeight * 100,
        isAvailable: Boolean(hasAssignedCourse),
        isNA: !hasAssignedCourse,
      },
      deptHead: {
        rawPercentage: deptHeadRaw,
        rawScore: deptHeadRaw,
        weightedContribution: deptHeadWeighted,
        weight: deptHeadWeight * 100,
        isAvailable: true,
      },
      peer: {
        rawPercentage: peerRaw,
        rawScore: peerRaw,
        weightedContribution: peerWeighted,
        weight: peerWeight * 100,
        isAvailable: true,
      },
    },
  };
};

const getDeptHeadLivePerformanceMetrics = async ({ instructorId, departmentId, academicYear = '', semester = '' }) => {
  const id = Number(instructorId);
  const deptId = Number(departmentId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(deptId) || deptId <= 0) {
    throw new Error('A valid Department Head instructor and department are required.');
  }

  const roleStatus = await getInstructorRoleStatus(id, '', '');
  const assignmentFilter = buildInstructorAssignmentFilter(id, roleStatus);
  const studentAssignmentExists = buildStudentAssignmentExists(assignmentFilter);
  const [deanRows] = await pool.query(
    `SELECT dhe.total_score AS score, COALESCE(AVG(dhe.total_score) OVER (), 0) AS average_score,
       dhe.criteria_scores, dhe.strengths, dhe.weaknesses
     FROM dept_head_evaluations dhe
     WHERE dhe.instructor_id = ? AND LOWER(dhe.status) IN ('submitted', 'completed', 'approved')
       AND (
         ? = ''
         OR dhe.academic_year IS NULL
         OR dhe.semester IS NULL
         OR (
           (dhe.academic_year = ? OR dhe.academic_year = SUBSTRING_INDEX(?, '/', 1))
           AND dhe.semester = ?
         )
         OR EXISTS (
           SELECT 1 FROM evaluation_periods active_period
           WHERE LOWER(active_period.status) = 'active'
             AND active_period.academic_year = ?
             AND active_period.semester = ?
             AND dhe.updated_at >= active_period.created_at
         )
       )
     ORDER BY dhe.updated_at DESC`,
    [id, academicYear, academicYear, academicYear, semester, academicYear, semester]
  );
  const [studentRows] = await pool.query(
    `SELECT COALESCE(ses.score, 0) AS score, COALESCE(AVG(ses.score) OVER (), 0) AS average_score, ses.feedback
     FROM student_evaluation_submissions ses
     INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
     WHERE ${studentAssignmentExists}
       AND LOWER(COALESCE(ed.target_type, 'instructor')) = 'instructor'
      AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved', 'published')
       `,
    assignmentFilter.params
  );
  const hasAssignedCourse = roleStatus.isTeaching || studentRows.length > 0;
  const [peerRows] = await pool.query(
    `SELECT COALESCE(pes.score, 0) AS score, COALESCE(AVG(pes.score) OVER (), 0) AS average_score,
       pes.strengths, pes.suggestions
     FROM peer_evaluation_submissions pes
     INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
     LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
     WHERE pe.evaluatee_id = ?
       AND LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved')
       AND (? = '' OR ed.id IS NULL OR ed.academic_year = ? OR ed.academic_year = SUBSTRING_INDEX(?, '/', 1) OR ed.academic_year IS NULL)
       AND (? = '' OR ed.id IS NULL OR ed.semester = ? OR ed.semester IS NULL)`,
    [id, academicYear, academicYear, academicYear, semester, semester]
  );
  const [[activePeriod]] = await pool.query(
    `SELECT deadline FROM evaluation_periods
     WHERE LOWER(status) = 'active'
     ORDER BY id DESC LIMIT 1`
  );

  const average = (rows) => rows.length ? rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length : 0;
  const studentAverage = Number(studentRows[0]?.average_score || average(studentRows));
  const studentCount = studentRows.length;
  const peerAverage = Number(peerRows[0]?.average_score || average(peerRows));
  const deptHeadAverage = Number(deanRows[0]?.average_score || average(deanRows));
  const weighted = calculateWeightedPerformance({
    student: studentAverage,
    deptHead: deptHeadAverage,
    peer: peerAverage,
    hasAssignedCourse,
    isDepartmentHead: true,
  });
  const periodEnded = Boolean(activePeriod?.deadline && new Date(activePeriod.deadline).getTime() <= Date.now());
  const completion = {
    isStudentComplete: !hasAssignedCourse || studentRows.length > 0,
    isDeptHeadComplete: deanRows.length > 0,
    isPeerComplete: peerRows.length > 0 || periodEnded,
  };
  const isComplete = completion.isStudentComplete
    && completion.isDeptHeadComplete
    && completion.isPeerComplete
    && peerRows.length > 0;

  return {
    instructorId: id,
    departmentId: deptId,
    studentRows,
    deanRows,
    peerRows,
    studentAverage,
    studentCount,
    raw_student_score: Number(studentAverage.toFixed(2)),
    submission_count: studentCount,
    totalAssignments: roleStatus.assignedCourseCount,
    deptHeadAverage,
    peerAverage,
    hasAssignedCourse,
    isTeaching: hasAssignedCourse,
    weighted,
    completion,
    periodEnded,
    incomingPeerCount: peerRows.length,
    isComplete,
    totalScore: isComplete ? weighted.totalWeightedScore : null,
  };
};
const termClause = (yearColumn, semesterColumn) => `
  AND (? = '' OR LOWER(COALESCE(${yearColumn}, '')) = LOWER(?) OR LOWER(COALESCE(${yearColumn}, '')) = LOWER(SUBSTRING_INDEX(?, '/', 1)))
  AND (? = '' OR LOWER(REPLACE(COALESCE(${semesterColumn}, ''), 'semester', '')) = LOWER(REPLACE(?, 'semester', '')))`;

const getInstructorOverallPerformance = async ({ instructorId, academicYear = '', semester = '' }) => {
  const id = Number(instructorId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('A valid instructor id is required.');

  const [[profile]] = await pool.query(`
    SELECT i.id, i.user_id, i.department_id,
      TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS instructor_name,
      d.name AS department_name, c.name AS college_name,
      LOWER(COALESCE(u.role, '')) AS user_role
    FROM instructors i LEFT JOIN departments d ON d.id = i.department_id
    LEFT JOIN colleges c ON c.id = d.college_id
    LEFT JOIN users u ON u.id = i.user_id
    WHERE i.id = ? LIMIT 1
  `, [id]);
  if (!profile) throw new Error('Instructor not found.');
  const roleStatus = await getInstructorRoleStatus(id, '', '');
  const assignmentFilter = buildInstructorAssignmentFilter(id, roleStatus);
  const studentAssignmentExists = buildStudentAssignmentExists(assignmentFilter);

  const [studentRows] = await pool.query(`
    SELECT AVG(ses.score) AS score, COUNT(DISTINCT ses.id) AS submission_count
    FROM student_evaluation_submissions ses
    INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
    WHERE ${studentAssignmentExists}
      AND LOWER(COALESCE(ed.target_type, 'instructor')) = 'instructor'
      AND LOWER(COALESCE(ses.status, 'pending')) IN ${COMPLETED}
  `, assignmentFilter.params);
  const studentSource = studentRows[0]?.score == null ? [] : [studentRows[0]];

  const [peerRows] = await pool.query(`
    SELECT pes.score
    FROM peer_evaluation_submissions pes
    INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
    LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
    WHERE pe.evaluatee_id = ? AND LOWER(COALESCE(pes.status, 'pending')) IN ${COMPLETED}
      AND COALESCE(pes.score, 0) > 0
      AND (? = '' OR ed.id IS NULL OR LOWER(COALESCE(ed.academic_year, '')) = LOWER(?) OR LOWER(COALESCE(ed.academic_year, '')) LIKE CONCAT('%', LOWER(?), '%'))
      AND (? = '' OR ed.id IS NULL OR LOWER(REPLACE(COALESCE(ed.semester, ''), 'semester', '')) = LOWER(REPLACE(?, 'semester', '')))
  `, [id, academicYear, academicYear, academicYear, semester, semester]);
  const peerSource = peerRows;

  const [deptHeadRows] = await pool.query(`
    SELECT total_score AS score
    FROM dept_head_evaluations
    WHERE (instructor_id = ? OR evaluatee_id = ?)
      AND LOWER(COALESCE(status, 'pending')) IN ${COMPLETED}
      AND LOWER(COALESCE(target_role, 'instructor')) IN ('instructor', 'dept_head', 'department_head', 'depthead')
      AND COALESCE(total_score, 0) > 0
      ${termClause('academic_year', 'semester')}
    ORDER BY id DESC
  `, [id, id, academicYear, academicYear, academicYear, semester, semester]);
  const deptSource = deptHeadRows;
  const [[activePeriod]] = await pool.query(
    `SELECT deadline FROM evaluation_periods
     WHERE LOWER(status) = 'active'
     ORDER BY id DESC LIMIT 1`
  );

  const hasTermFilter = Boolean(String(academicYear || '').trim() || String(semester || '').trim());
  const fallbackMetrics = hasTermFilter
    && (!studentRows[0]?.score || !peerRows.length || !deptHeadRows.length)
    ? await getInstructorOverallPerformance({ instructorId: id, academicYear: '', semester: '' })
    : null;

  const average = (rows) => rows.length ? rows.reduce((sum, row) => sum + number(row.score), 0) / rows.length : 0;
  const studentCount = Number(studentRows[0]?.submission_count || (!hasTermFilter ? fallbackMetrics?.student?.count : 0) || 0);
  const studentRaw = Number((studentSource.length ? average(studentSource) : (!hasTermFilter ? fallbackMetrics?.studentRaw : 0) || 0).toFixed(2));
  const peerRaw = Number((peerSource.length ? average(peerSource) : fallbackMetrics?.peerRaw || 0).toFixed(2));
  const deptHeadRaw = normalizeDeptHead(deptSource.length ? average(deptSource) : fallbackMetrics?.deptHeadRaw || 0);
  const hasAssignedCourse = roleStatus.isTeaching || studentCount > 0;
  const weighted = calculateWeightedPerformance({ student: studentRaw, peer: peerRaw, deptHead: deptHeadRaw, hasAssignedCourse });
  const { studentWeighted, peerWeighted, deptHeadWeighted } = weighted;
  const isStudentComplete = !hasAssignedCourse || studentCount > 0;
  const isDeptHeadComplete = (deptSource.length || fallbackMetrics?.deptHead?.count || 0) > 0;
  const incomingPeerCount = peerSource.length || fallbackMetrics?.peer?.count || 0;
  const periodEnded = Boolean(activePeriod?.deadline && new Date(activePeriod.deadline).getTime() <= Date.now());
  const isPeerComplete = incomingPeerCount > 0 || periodEnded;
  const isComplete = isStudentComplete && isDeptHeadComplete && isPeerComplete && incomingPeerCount > 0;
  const calculatedTotalScore = weighted.totalScore;
  const totalScore = isComplete ? calculatedTotalScore : null;
  const classification = isComplete
    ? (calculatedTotalScore >= 85 ? 'Very Good' : calculatedTotalScore >= 75 ? 'Good' : calculatedTotalScore >= 60 ? 'Satisfactory' : 'Needs Improvement')
    : null;

  return {
    instructorId: id,
    instructorName: profile.instructor_name,
    department: profile.department_name,
    college_name: profile.college_name,
    academicYear,
    semester,
    role: hasAssignedCourse ? 'Teaching' : 'Non-Teaching',
    student: { raw: studentRaw, weighted: studentWeighted, count: studentCount },
    raw_student_score: studentRaw,
    submission_count: studentCount,
    totalAssignments: roleStatus.assignedCourseCount,
    totalAssignments: roleStatus.assignedCourseCount,
    deptHead: { raw: deptHeadRaw, weighted: deptHeadWeighted, count: deptSource.length || fallbackMetrics?.deptHead?.count || 0 },
    peer: { raw: peerRaw, weighted: peerWeighted, count: peerSource.length || fallbackMetrics?.peer?.count || 0 },
    hasAssignedCourse,
    isStudentEvaluationRequired: hasAssignedCourse,
    isStudentEvaluationExcluded: !hasAssignedCourse,
    studentRaw, studentWeighted, deptHeadRaw, deptHeadWeighted, peerRaw, peerWeighted,
    totalScore,
    classification: classification ? `${classification} (${calculatedTotalScore.toFixed(2)}%)` : null,
    isComplete,
    statusBadge: isComplete ? classification : 'Pending Complete Evaluation',
    completion: { isStudentComplete, isDeptHeadComplete, isPeerComplete, incomingPeerCount, periodEnded },
    weights: { student: weighted.studentWeight, deptHead: weighted.deptHeadWeight, peer: weighted.peerWeight },
  };
};

module.exports = {
  getInstructorOverallPerformance,
  getDeptHeadLivePerformanceMetrics,
  normalizeDeptHead,
  calculateWeightedPerformance,
};
