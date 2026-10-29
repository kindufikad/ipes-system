import { evaluationApi } from './api';

export const SUBMISSIONS_UPDATED_EVENT = 'ipes-submissions-updated';

export const dispatchForm = async (formType, targetRole, formData = {}) => {
  // Build payload in line with backend expectations
  const payload = {
    template_id: formData.template_id || null,
    student_id: formData.student_id || null,
    student_identifier: formData.student_identifier || null,
    student_group: formData.student_group || null,
    course_code: formData.course_code || formData.courseCode || null,
    course_name: formData.course_name || formData.courseName || null,
    academic_year: formData.academic_year || formData.academicYear || null,
    semester: formData.semester || null,
    year_level: formData.year_level || formData.yearLevel || null,
    student_identifier_text: formData.student_identifier_text || null,
    payload: formData.payload || {},
  };

  const result = await evaluationApi.dispatchStudentEvaluation(payload);
  // Emit event for UI consumers
  try {
    window.dispatchEvent(new CustomEvent(SUBMISSIONS_UPDATED_EVENT, { detail: { type: 'dispatch', result } }));
  } catch {}
  return result;
};

export const submitForm = async (dispatchId, submitterRole, submitterName, formResponse = {}) => {
  const payload = {
    dispatch_id: dispatchId,
    score: Number(formResponse.score || formResponse.scoreValue || 0),
    feedback: formResponse.feedback || formResponse.comments || '',
    responses: formResponse.responses || {},
  };
  const result = await evaluationApi.submitStudentEvaluation(payload);
  try {
    window.dispatchEvent(new CustomEvent(SUBMISSIONS_UPDATED_EVENT, { detail: { type: 'submission', result } }));
  } catch {}
  return result;
};

export const getFormDispatches = async (filters = {}) => {
  const params = { ...filters };
  const data = await evaluationApi.getDispatches(params);
  return Array.isArray(data) ? data : [];
};

export const getFormSubmissions = async (filters = {}) => {
  const data = await evaluationApi.getSubmissions(filters);
  return Array.isArray(data) ? data : [];
};

export const getSubmissionsForDispatch = async (dispatchId) => {
  if (!dispatchId) return [];
  return getFormSubmissions({ dispatch_id: dispatchId });
};

export const getSubmissionsSummary = async () => {
  const dispatches = await getFormDispatches();
  const submissions = await getFormSubmissions();
  const summary = {
    totalDispatches: dispatches.length,
    dispatchesByType: {},
    totalSubmissions: submissions.length,
    submissionsByRole: {},
    pendingDispatches: dispatches.filter((d) => d.status === 'pending').length,
  };
  dispatches.forEach((d) => { summary.dispatchesByType[d.type] = (summary.dispatchesByType[d.type] || 0) + 1; });
  submissions.forEach((s) => { summary.submissionsByRole[s.submitterRole] = (summary.submissionsByRole[s.submitterRole] || 0) + 1; });
  return summary;
};

export const saveDraft = async () => { return false; };
