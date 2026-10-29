export const getReportCompletion = (row = {}) => {
  const studentCount = Number(row.student_count ?? row.student_completed ?? row.student_submission_count ?? row.total_students_evaluated_count ?? row.student_eval_count ?? row.student?.count ?? 0);
  const requiredStudentCount = Number(row.student_required ?? row.required_student_evaluators ?? row.requiredStudentEvaluators ?? row.completion?.requiredStudentCount ?? 0);
  const peerCount = Number(row.peer_count ?? row.peer_completed ?? row.peer_submission_count ?? row.total_peers_evaluated_count ?? row.peer_eval_count ?? row.peer?.count ?? row.completion?.incomingPeerCount ?? 0);
  const deptHeadFlag = row.dept_head_submitted ?? row.deptHeadSubmitted ?? row.hasDeptHeadEval;
  const deptHeadCompletedCount = Number(row.dept_head_completed ?? row.dept_head_eval_count ?? row.deptHead?.count ?? row.total_dept_head_evaluators ?? 0);
  const requiredDeptHeadCount = Number(row.dept_head_required ?? row.required_dept_head_evaluators ?? 0);
  const deptHeadSubmitted = deptHeadFlag === true
    || deptHeadFlag === 1
    || deptHeadFlag === '1'
    || String(deptHeadFlag || '').toLowerCase() === 'true'
    || String(row.dept_head_status ?? row.deptHeadStatus ?? '').toLowerCase() === 'submitted'
    || deptHeadCompletedCount > 0;
  const rawCourseAssigned = row.has_assigned_courses ?? row.hasCourseAssigned ?? row.hasAssignedCourse ?? row.has_course_assigned ?? row.has_assigned_course ?? row.courseCount ?? row.course_count;
  const hasCourseAssigned = rawCourseAssigned === undefined
    ? true
    : String(rawCourseAssigned).toLowerCase() !== 'false'
      && String(rawCourseAssigned) !== '0'
      && Number(rawCourseAssigned) !== 0;
  const hasStudentEval = !hasCourseAssigned
    ? true
    : requiredStudentCount > 0
      ? studentCount >= Math.ceil(requiredStudentCount / 2)
      : row.completion?.isStudentComplete ?? row.hasStudentEval ?? studentCount > 0;
  const hasDeptHeadEval = requiredDeptHeadCount > 0
    ? deptHeadCompletedCount >= requiredDeptHeadCount
    : row.completion?.isDeptHeadComplete ?? row.hasDeptHeadEval ?? deptHeadSubmitted;
  const hasPeerEval = peerCount >= 1
    || row.completion?.isPeerComplete === true
    || row.hasPeerEval === true;
  const finalScoreValue = row.final_score ?? row.finalScore ?? row.total_score ?? row.totalScore;
  const finalScore = Number(finalScoreValue);
  const hasValidFinalScore = finalScoreValue !== undefined && finalScoreValue !== null && Number.isFinite(finalScore) && finalScore >= 0;
  const targetRole = String(row.role ?? row.target_role ?? '').trim().toLowerCase().replace(/[ -]+/g, '_');
  const isExecutiveReport = row.report_type === 'executive' || ['dean', 'college_dean'].includes(targetRole);
  const backendCompletionValue = row.backendComplete ?? row.isComplete ?? row.is_complete ?? row.can_print ?? row.canPrint;
  const backendComplete = backendCompletionValue === true
    || backendCompletionValue === 1
    || String(backendCompletionValue).toLowerCase() === 'true'
    || String(backendCompletionValue) === '1';
  const missing = [];

  if (!hasStudentEval) missing.push('Student Evaluation is pending');
  if (!hasDeptHeadEval) missing.push('Department Head Evaluation is pending');
  if (!hasPeerEval) missing.push('Peer Evaluation is pending');

  return {
    hasCourseAssigned,
    hasStudentEval,
    hasDeptHeadEval,
    hasPeerEval,
    hasValidFinalScore,
    canPrint: hasValidFinalScore && (isExecutiveReport || backendComplete || (hasStudentEval && hasDeptHeadEval && hasPeerEval)),
    missing: (isExecutiveReport || backendComplete || (hasStudentEval && hasDeptHeadEval && hasPeerEval)) && hasValidFinalScore ? [] : missing,
    message: (isExecutiveReport || backendComplete || (hasStudentEval && hasDeptHeadEval && hasPeerEval)) && hasValidFinalScore
      ? ''
      : missing.length
        ? `Cannot generate final letter: ${missing.join('; ')}`
        : hasValidFinalScore
          ? ''
          : 'A valid final score is required before printing.',
  };
};
