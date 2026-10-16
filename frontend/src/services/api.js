import axios from 'axios';

const API_BASE_URL = '/api';

axios.interceptors.request.use((config) => {
  if (typeof window === 'undefined') return config;
  const token = window.localStorage.getItem('ipesAuthToken') || window.localStorage.getItem('token');
  if (!token) return config;

  config.headers = config.headers || {};
  if (typeof config.headers.set === 'function') {
    config.headers.set('Authorization', `Bearer ${token}`);
  } else {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = error?.config?.url || '';
    const isLoginRequest = requestUrl.includes('/auth/login');

    if (typeof window !== 'undefined' && !isLoginRequest && status === 401) {
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('ipesAuthToken');
      window.localStorage.removeItem('role');
      window.localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

const getMessageText = (message) => {
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) {
    return message.map((entry) => getMessageText(entry)).filter(Boolean).join(' ');
  }
  if (message && typeof message === 'object') {
    if (typeof message.en === 'string') return message.en;
    if (typeof message.am === 'string') return message.am;
    if (typeof message.message === 'string') return message.message;
    return Object.values(message)
      .map((entry) => getMessageText(entry))
      .filter(Boolean)
      .join(' ');
  }
  return '';
};

const request = async (path, options = {}) => {
  const { preserveEnvelope = false, ...axiosOptions } = options;
  const containsFormData = axiosOptions.data instanceof FormData;
  const headers = {
    ...(containsFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(axiosOptions.headers || {}),
  };

  try {
    const response = await axios({
      url: `${API_BASE_URL}${path}`,
      headers,
      withCredentials: true,
      ...axiosOptions,
    });

    const responseData = response.data;
    if (preserveEnvelope) return responseData;
    if (responseData && typeof responseData === 'object' && responseData.hasOwnProperty('success') && responseData.hasOwnProperty('data')) {
      return responseData.data;
    }

    return responseData;
  } catch (error) {
    const errorPayload = error?.response?.data;
    const errorMessage = getMessageText(errorPayload?.message || errorPayload?.error || error.message || 'Request failed.');
    const errorDetail = getMessageText(errorPayload?.error);
    const message = errorDetail && errorDetail !== errorMessage ? `${errorMessage} ${errorDetail}` : errorMessage;
    const normalizedError = new Error(message || 'Request failed.');
    normalizedError.status = error?.response?.status || 500;
    normalizedError.response = error?.response;
    throw normalizedError;
  }
};

export const authApi = {
  registerInstructor: (payload) => request('/auth/register-instructor', { method: 'POST', data: payload }),
  registerLabAssistant: (payload) => request('/auth/register-lab-assistant', { method: 'POST', data: payload }),
  registerStudent: (payload) => request('/students/register', { method: 'POST', data: payload }),
  bulkRegister: (payload) => request('/auth/bulk-register', { method: 'POST', data: payload }),
  createDepartment: (payload) => request('/auth/departments', { method: 'POST', data: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', data: payload }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/profile'),
  changePassword: (payload) => request('/auth/change-password', { method: 'POST', data: payload }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', data: { email } }),
  resetPassword: (payload) => request('/auth/reset-password', { method: 'POST', data: payload }),
};

export const publicApi = {
  getSystemStats: () => request('/public/system-stats'),
  getContactInfo: () => request('/public/contact-info'),
  getLandingContent: () => request('/public/landing-content'),
};

export const aiApi = {
  getInsight: (action, input = {}) => request('/ai/insights', { method: 'POST', data: { action, input } }),
  getRoleInsights: (role, params = {}) => request('/ai/insights', { method: 'GET', params: { role, ...params } }),
  getSummary: (role, params = {}) => request('/ai-insights/summary', { method: 'GET', params: { role, ...params } }),
  getInstructorAiInsights: () => request('/instructor/ai-insights', { method: 'GET' }),
  saveInstructorGoal: (payload) => request('/instructors/goals', { method: 'POST', data: payload }),
};

export const contactApi = {
  sendMessage: (payload) => request('/contact/send', { method: 'POST', data: payload }),
};

export const adminApi = {
  sendProfileEmailVerification: (email) => request('/admin/profile/email-verification', { method: 'POST', data: { email } }),
  updateProfile: (payload) => request('/admin/profile', { method: 'PUT', data: payload }),
  changePassword: (payload) => request('/admin/change-password', { method: 'PUT', data: payload }),
  getAutoLockDeadlineSetting: () => request('/admin/evaluation-auto-lock'),
  updateAutoLockDeadlineSetting: (enabled) => request('/admin/evaluation-auto-lock', { method: 'POST', data: { auto_lock_enabled: enabled } }),
  getEmailServiceSettings: () => request('/admin/email-service-settings'),
  updateEmailServiceSettings: (payload) => request('/admin/email-service-settings', { method: 'PUT', data: payload }),
  getSmtpSettings: () => request('/admin/smtp-settings'),
  updateSmtpSettings: (payload) => request('/admin/smtp-settings', { method: 'POST', data: payload }),
  getDashboardStats: () => request('/admin/dashboard-stats'),
  getDepartmentAnalytics: () => request('/admin/department-analytics'),
  getSecurityLogs: (params = {}) => request('/admin/security-logs', { params }),
  exportSecurityLogs: (params = {}) => request('/admin/security-logs/export', { params, responseType: 'blob' }),
  cleanupSecurityLogs: (retentionDays) => request('/admin/security-logs', { method: 'DELETE', data: { retentionDays } }),
  clearSecurityLogs: () => request('/admin/security-logs', { method: 'DELETE', data: { clearAll: true } }),
  getDatabaseHealth: () => request('/admin/database-health'),
  getSystemHealth: () => request('/admin/system-health'),
  getActiveSessions: () => request('/admin/security/sessions'),
  revokeActiveSession: (sessionId) => request(`/admin/security/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  getFailedLoginActivity: () => request('/admin/security/failed-logins'),
  updateBlockedIp: (ipAddress, blocked) => request('/admin/security/blocked-ips', { method: 'PUT', data: { ipAddress, blocked } }),
  deleteBlockedIp: (ipAddress) => request('/admin/security/blocked-ips', { method: 'DELETE', data: { ipAddress } }),
  getSecurityApiKeys: () => request('/admin/security/api-keys'),
  createSecurityApiKey: (payload) => request('/admin/security/api-keys', { method: 'POST', data: payload }),
  rotateSecurityApiKey: (keyId, payload) => request(`/admin/security/api-keys/${keyId}/rotate`, { method: 'PUT', data: payload }),
  revokeSecurityApiKey: (keyId) => request(`/admin/security/api-keys/${keyId}`, { method: 'DELETE' }),
  updateMaintenanceMode: (enabled) => request('/admin/maintenance-mode', { method: 'PUT', data: { enabled } }),
  triggerBackup: () => request('/admin/trigger-backup', { method: 'POST' }),
  updateBackupRetention: (retentionDays) => request('/admin/backup-retention', { method: 'PUT', data: { retentionDays } }),
  updateSystemLock: (enabled) => request('/admin/system-lock', { method: 'PUT', data: { enabled } }),
  getSecurityControls: () => request('/admin/security/controls'),
  toggleSystemAccessLock: (payload) => request('/admin/toggle-system-lock', { method: 'POST', data: payload }),
  createCollege: (payload) => request('/admin/colleges', { method: 'POST', data: payload }),
  getColleges: () => request('/admin/colleges'),
  getCollegesWithDepartments: () => request('/admin/colleges-with-departments'),
  getDepartmentsByCollege: (collegeId) => request('/admin/departments', { params: { college_id: collegeId } }),
  getRoleCandidates: () => request('/admin/role-candidates'),
  getManagementRoleOccupant: (params) => request('/admin/management-role-occupant', { params }),
  assignManagementRole: (id, role, hierarchy = {}) => request(`/admin/users/${id}/management-role`, { method: 'PUT', data: { role, ...hierarchy } }),
  resetManagementRole: (id) => request(`/admin/users/${id}/management-role/reset`, { method: 'PUT' }),
  resetUserPassword: (id) => request(`/admin/users/${id}/password/reset`, { method: 'PUT' }),
  updateUser: (id, payload) => request(`/admin/users/${id}`, { method: 'PUT', data: payload }),
  toggleArchiveUser: (id, status) => request(`/admin/users/${id}/toggle-archive`, { method: 'PUT', data: status ? { status } : {} }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  getLandingContent: () => request('/admin/landing-content'),
  uploadLandingContent: (key, data) => request(`/admin/landing-content/${key}`, { method: 'POST', data }),
  deleteLandingContent: (key) => request(`/admin/landing-content/${key}`, { method: 'DELETE' }),
  getLandingPageSettings: () => request('/admin/landing-page-settings'),
  createLandingPageSetting: (data) => request('/admin/landing-page-settings', { method: 'POST', data }),
  updateLandingPageSettings: (settings) => request('/admin/landing-page-settings', { method: 'PUT', data: { settings } }),
  deleteLandingPageSetting: (data) => request('/admin/landing-page-settings', { method: 'DELETE', data }),
  getContactSettings: () => request('/admin/contact-settings'),
  updateContactSetting: (key, value) => request(`/admin/contact-settings/${key}`, { method: 'PUT', data: { value } }),
};

export const deanApi = {
  getOverviewStats: () => request('/dean/overview-stats'),
  getDepartmentAnalytics: () => request('/dean/department-analytics'),
  getDepartmentHeads: () => request('/dean/evaluations'),
  getDepartmentHeadsForEvaluation: () => request('/dean/department-heads'),
  getEvaluations: () => request('/dean/evaluations'),
  submitDepartmentHeadEvaluation: (payload) => request('/dean/submit-evaluation', { method: 'POST', data: payload }),
  submitDeptHeadEvaluation: (payload) => request('/dean/dept-head-evaluations', { method: 'POST', data: payload }),
  updateDeptHeadEvaluation: (id, payload) => request(`/dean/dept-head-evaluations/${id}`, { method: 'PUT', data: payload }),
  getFacultyPerformance: () => request('/dean/faculty-performance'),
  getReports: () => request('/dean/reports'),
  getMyPerformance: () => request('/dean/my-performance'),
  getEvaluationTracking: () => request('/dean/evaluation-tracking'),
  getPeerEvaluations: () => request('/dean/peer-evaluations'),
  submitPeerEvaluation: (payload) => request('/dean/peer-evaluations', { method: 'POST', data: payload }),
  updatePeerEvaluation: (id, payload) => request(`/dean/peer-evaluations/${id}`, { method: 'PUT', data: payload }),
};

export const directorateApi = {
  getOverviewStats: () => request('/directorate/overview-stats'),
  getMyPerformance: () => request('/evaluations/directorate-performance'),
  getInstructors: () => request('/directorate/instructors'),
  getDeans: () => request('/directorate/deans'),
  getReports: () => request('/directorate/reports'),
  getAnalytics: () => request('/directorate/analytics'),
  evaluateDean: (payload) => request('/directorate/evaluate-dean', { method: 'POST', data: payload }),
  getPeerEvaluations: () => request('/directorate/peer-evaluations'),
  getEvaluationTracking: (params = {}) => request('/directorate/evaluation-tracking', { method: 'GET', params }),
  calculatePublishFinalResults: (payload = {}) => request('/directorate/calculate-publish', { method: 'POST', data: payload }),
  submitPeerEvaluation: (payload) => request('/directorate/peer-evaluations', { method: 'POST', data: payload }),
};

export const vicePresidentApi = {
  getAcademicDirectorateCandidates: () => request('/evaluations/academic-directorate-list'),
  getAcademicDirectorateEvaluations: () => request('/evaluations/academic-directorate-evaluations'),
  evaluateAcademicDirectorate: (payload) => request('/evaluations/evaluate-academic-directorate', { method: 'POST', data: payload }),
  getDirectoratePerformance: (academicDirectorateId) => request('/evaluations/directorate-performance', { params: { academic_directorate_id: academicDirectorateId } }),
};

export const departmentApi = {
  createDepartment: (payload) => request('/departments', { method: 'POST', data: payload }),
  getDepartmentData: (type, department) => request(`/department-data/${type}`, { method: 'GET', params: { department } }),
  getOverview: (department) => request('/department/overview', { params: { department } }),
  getAssignments: () => request('/department/assignments'),
  createAssignment: (payload) => request('/department/assignments', { method: 'POST', data: payload }),
  updateAssignment: (id, payload) => request(`/department/assignments/${id}`, { method: 'PUT', data: payload }),
  deleteAssignment: (id) => request(`/department/assignments/${id}`, { method: 'DELETE' }),
  getAll: () => request('/departments'),
  getDepartmentCourses: (department) => request('/dept-head/courses', { method: 'GET', params: { department } }),
  getDepartmentInstructors: (department) => request('/dept-head/instructors', { method: 'GET', params: { department } }),
  getDepartmentStudents: (department, filters = {}) => request('/dept-head/students', { method: 'GET', params: { department, ...filters } }),
  getLabAssistants: (department_id) => request('/dept-head/lab-assistants', { method: 'GET', params: { department_id } }),
  getAnalytics: () => request('/dept-head/analytics'),
};

export const registrationApi = {
  bulkRegister: (payload) => request('/admin/bulk-register', { method: 'POST', data: payload }),
  getUsers: (filters = {}) => request('/secure/users', { method: 'GET', params: filters }),
  getStudents: (filters = {}) => request('/secure/users', { method: 'GET', params: { role: 'student', ...filters } }),
  getCourses: (filters = {}) => request('/secure/courses', { method: 'GET', params: filters }),
  getEvaluations: () => request('/secure/evaluations'),
  createUser: (payload) => request('/secure/users', { method: 'POST', data: payload }),
  updateUser: (id, payload) => request(`/secure/users/${id}`, { method: 'PUT', data: payload }),
  deleteUser: (id) => request(`/secure/users/${id}`, { method: 'DELETE' }),
  createCourse: (payload) => request('/secure/courses', { method: 'POST', data: payload }),
  bulkUploadCourses: (payload) => request('/secure/courses/bulk-upload', { method: 'POST', data: payload }),
  updateCourse: (id, payload) => request(`/secure/courses/${id}`, { method: 'PUT', data: payload }),
  deleteCourse: (id) => request(`/secure/courses/${id}`, { method: 'DELETE' }),
};

export const studentApi = {
  // hits /api/students
  bulkUpload: (payload) => request('/students/bulk-upload', { method: 'POST', data: payload }),
  getFiltered: (filters = {}) => request('/students', { method: 'GET', params: filters }),
  getProfile: () => request('/student/profile', { method: 'GET' }),
  getPendingEvaluations: () => request('/student/pending-evaluations', { method: 'GET' }),
  getAvailableEvaluations: () => request('/student/evaluations/available', { method: 'GET' }),
};

export const userApi = {
  getUsers: (filters = {}) => request('/secure/users', { method: 'GET', params: filters }),
  getStudents: (filters = {}) => request('/secure/users', { method: 'GET', params: { role: 'student', ...filters } }),
  createUser: (payload) => request('/secure/users', { method: 'POST', data: payload }),
  updateUser: (id, payload) => request(`/secure/users/${id}`, { method: 'PUT', data: payload }),
  deleteUser: (id) => request(`/secure/users/${id}`, { method: 'DELETE' }),
};

export const courseApi = {
  getCourses: () => request('/secure/courses'),
  createCourse: (payload) => request('/secure/courses', { method: 'POST', data: payload }),
  updateCourse: (id, payload) => request(`/secure/courses/${id}`, { method: 'PUT', data: payload }),
  deleteCourse: (id) => request(`/secure/courses/${id}`, { method: 'DELETE' }),
};

export const evaluationApi = {
  getPublishAssignments: (params = {}) => request('/dept-head/publish-list', { method: 'GET', params }),
  getPaginatedPublishAssignments: (params = {}) => request('/dept-head/publish-list', { method: 'GET', params }),
  togglePeerPublish: (payload = {}) => request('/evaluations/toggle-peer-publish', { method: 'POST', data: payload }),
  getPublishStatuses: (departmentId, params = {}) => request(`/evaluations/publish-statuses/${departmentId}`, { method: 'GET', params }),
  getPeerPublishStatus: (params = {}) => request('/evaluations/peer-publish-status', { method: 'GET', params }),
  publishStudent: (payload) => request('/evaluations/publish', { method: 'POST', data: payload }),
  unpublishStudent: (payload) => request('/evaluations/student/unpublish', { method: 'POST', data: payload }),
  publishInstructor: (payload) => request('/evaluations/publish-instructor', { method: 'POST', data: payload }),
  publishDispatch: (payload) => request('/evaluations/publish-dispatch', { method: 'POST', data: payload }),
  getOverview: () => request('/evaluations/template'),
  getLatestTemplate: () => request('/evaluations/template'),
  saveTemplate: (payload) => request('/evaluations/template', { method: 'POST', data: payload }),
  updateTemplate: (id, payload) => request(`/evaluations/template/${id}`, { method: 'PUT', data: payload }),
  dispatchStudentEvaluation: (payload) => request('/evaluations/dispatch', { method: 'POST', data: payload }),
  getDispatches: (filters = {}) => request('/evaluations/dispatches', { method: 'GET', params: filters }),
  getSubmissions: (filters = {}) => request('/evaluations/submissions', { method: 'GET', params: filters }),
  getPendingStudentEvaluations: () => request('/student/evaluations/pending', { method: 'GET' }),
  getStudentEvaluations: () => request('/student/evaluations', { method: 'GET' }),
  submitStudentEvaluation: (payload) => request('/student/evaluations/submit', { method: 'POST', data: payload }),
  submitStudentEvaluationForm: (payload) => request('/evaluations/submit-student', { method: 'POST', data: payload }),
  getActiveEvaluationDeadline: () => request('/evaluations/active-deadline', { method: 'GET' }),
  submitPeerEvaluationForm: (payload) => request('/evaluations/submit-peer', { method: 'POST', data: payload }),
  getDeptHeadStudentTracking: (params = {}) => request('/dept-head/tracking/students', { method: 'GET', params }),
  getDeptHeadPeerTracking: (params = {}) => request('/tracking/peers', { method: 'GET', params }),
  publishDepartmentPeerEvaluations: (payload = {}) => request('/evaluations/peer/publish-department', { method: 'POST', data: payload }),
  unpublishDepartmentPeerEvaluations: (payload = {}) => request('/evaluations/peer/unpublish-department', { method: 'POST', data: payload }),
  getDeptHeadDeptHeadTracking: (params = {}) => request('/dept-head/tracking/dept-head', { method: 'GET', params }),
  sendReminder: (payload = {}) => request('/evaluations/send-reminder', { method: 'POST', data: payload }),
  calculatePublishFinalResults: (payload = {}) => request('/dept-head/calculate-publish', { method: 'POST', data: payload }),
  publishInstructorScores: (payload = {}) => request('/evaluations/publish-instructor-scores', { method: 'POST', data: payload }),
  getDeptHeadInstructors: (params = {}) => request('/dept-head/instructors', { method: 'GET', params }),
  publishPeerEvaluation: (payload = {}) => request('/dept-head/publish-peer-evaluation', { method: 'POST', data: payload }),
  publishLabAssistantEvaluation: (payload = {}) => request('/dept-head/publish-lab-assistant-evaluation', { method: 'POST', data: payload }),
  getEvaluationTrackingResults: (params = {}) => request('/dept-head/evaluation-tracking', { method: 'GET', params }),
  getInstructorEvaluationDetails: (instructorId) => request(`/evaluations/instructor-details/${instructorId}`, { method: 'GET' }),
  getDepartmentHeadEvaluationTracking: (params = {}) => request('/department-head/evaluation-tracking', { method: 'GET', params }),
  getEvaluationDeadline: () => request('/department-head/evaluation-deadline', { method: 'GET' }),
  updateEvaluationDeadline: (payload = {}) => {
    const token = typeof window !== 'undefined'
      ? window.localStorage.getItem('ipesAuthToken') || window.localStorage.getItem('token')
      : null;
    return request('/department-head/evaluation-deadline', {
      method: 'PUT',
      data: payload,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  sendDepartmentHeadEvaluationReminder: (payload = {}) => request('/department-head/send-evaluation-reminder', { method: 'POST', data: payload }),
  getDeptHeadPendingEvaluators: (params = {}) => request('/dept-head/evaluation-tracking/pending', { method: 'GET', params }),
  getDeptHeadPendingStudents: () => request('/dept-head/pending-students', { method: 'GET' }),
  getDepartmentReports: (params = {}) => request('/dept-head/reports', { method: 'GET', params }),
  getPrintEfficiencyReport: (instructorId, params = {}) => request(`/reports/print-efficiency/${instructorId}`, { method: 'GET', params }),
  submitDeptHeadEvaluation: (payload) => request('/dept-head/evaluations', { method: 'POST', data: payload }),
  updateDeptHeadEvaluation: (id, payload) => request(`/dept-head/evaluations/${id}`, { method: 'PUT', data: payload }),
  getDeptHeadEvaluations: (params = {}) => request('/dept-head/evaluations', { method: 'GET', params }),
  getDeptHeadEvaluation: (id) => request(`/dept-head/evaluations/${id}`, { method: 'GET' }),
  getPerformanceDashboard: () => request('/instructor/performance-summary', { method: 'GET' }),
  getDeptHeadPerformance: () => request('/dept-head/performance', { method: 'GET' }),
  getAll: () => request('/evaluations'),
  submitEvaluation: (payload) => request('/evaluations', { method: 'POST', data: payload }),
};

export const labAssistantApi = {
  getMyPerformance: () => request('/lab-assistant/my-performance', { method: 'GET' }),
  getPeerEvaluations: () => request('/lab-assistant/peer-evaluation-targets', { method: 'GET' }),
  evaluatePeer: (payload) => request('/lab-assistant/evaluate-peer', { method: 'POST', data: payload }),
};

export const notificationApi = {
  getAll: () => request('/notifications'),
  getUnread: () => request('/notifications'),
  markRead: (notificationId) => request(`/notifications/${notificationId}/read`, { method: 'PUT' }),
  deleteOne: (notificationId) => request(`/notifications/${notificationId}`, { method: 'DELETE' }),
  markAllRead: (userId) => request(`/notifications/mark-all-read/${userId}`, { method: 'PUT' }),
  clearAll: (userId) => request(`/notifications/clear-all/${userId}`, { method: 'DELETE' }),
  send: (payload) => request('/notifications/send', { method: 'POST', data: payload }),
  sendReminder: (payload = {}) => request('/notifications/send-reminder', { method: 'POST', data: payload }),
  sendBulkReminders: (payload = {}) => request('/notifications/send-bulk-reminders', { method: 'POST', data: payload }),
  sendReminders: (payload = {}) => request('/notifications/send-reminders', { method: 'POST', data: payload }),
};

export const criteriaApi = {
  get: (type, targetRole) => request('/criteria', { method: 'GET', params: { type, target_role: targetRole } }),
  getAll: (type, targetRole, options = {}) => request('/admin/evaluation-criteria', { method: 'GET', params: { ...(type ? { type } : {}), target_role: targetRole, ...options }, preserveEnvelope: true }),
  create: (payload) => request('/admin/criteria', { method: 'POST', data: payload }),
  update: (id, payload) => request(`/admin/criteria/${id}`, { method: 'PUT', data: payload }),
  remove: (id) => request(`/admin/criteria/${id}`, { method: 'DELETE' }),
};

export const courseAssignmentApi = {
  assign: (payload) => request('/assignments/assign', { method: 'POST', data: payload }),
  batchAssign: (payload) => request('/courses/batch-assign', { method: 'POST', data: payload }),
  batchAssignMatrix: (payload) => request('/courses/batch-assign-matrix', { method: 'POST', data: payload }),
  getFilteredCourses: (params) => request('/courses/by-filters', { method: 'GET', params }),
  getDepartmentInstructors: (departmentId) => request(`/courses/department-instructors/${departmentId}`, { method: 'GET' }),
  getAll: () => request('/course-assignments'),
  getDeptHeadAssignments: (params = {}) => request('/course-assignments', { method: 'GET', params }),
  updateDeptHeadAssignment: (id, payload) => request(`/dept-head/course-assignments/${id}`, { method: 'PUT', data: payload }),
  create: (payload) => request('/course-assignments', { method: 'POST', data: payload }),
  createDeptHeadAssignment: (payload) => request('/dept-head/assign-course', { method: 'POST', data: payload }),
  deleteAssignment: (id) => request(`/courses/assign/${id}`, { method: 'DELETE' }),
  getStudentAssignments: () => request('/student/assigned-courses'),
  getInstructorAssignments: () => request('/instructor/assigned-courses'),
  getPeerEvaluations: () => request('/evaluations/peer-list-for-instructor'),
};
