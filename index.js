require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const session = require('express-session');
const XLSX = require('xlsx');
const pool = require('./config/db');
const { initSocket, emitEvaluationUpdate } = require('./socket');

const authRoutes = require('./routes/authRoutes');
const secureRoutes = require('./routes/secureRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const publicRoutes = require('./routes/publicRoutes');
const contactRoutes = require('./routes/contactRoutes');
const adminRoutes = require('./routes/adminRoutes');
const deptHeadRoutes = require('./routes/deptHead');
const labAssistantRoutes = require('./routes/labAssistant');
const userRoutes = require('./routes/user');
const deanRoutes = require('./routes/deanRoutes');
const directorateRoutes = require('./routes/directorate');
const evaluationRoutes = require('./routes/evaluationRoutes');
const { bulkUploadStudents, registerStudent } = require('./controllers/studentController');
const { batchAssignMatrix } = require('./controllers/courseController');
const { createDepartment } = require('./controllers/departmentController');
const { me } = require('./controllers/authController');
const { getUserNotifications, markAllRead, clearAllNotifications, markNotificationRead, deleteNotification, sendNotification, sendTelegramReminders, createNotifications, setRealtimeServer } = require('./controllers/notificationController');
const { getAiInsightsSummary, getInstructorAiInsights } = require('./controllers/aiInsightsController');
const { sendDeptHeadEvaluationReminder } = require('./controllers/trackingController');
const { authenticateToken: mwAuthenticateToken, authorizeRoles: mwAuthorizeRoles } = require('./middleware/auth');
const { auditRequest } = require('./middleware/auditLogger');
const securityGate = require('./middleware/securityGate');
const systemAccessLock = require('./middleware/systemAccessLock');
const { responseTimeMiddleware } = require('./middleware/systemHealth');
const { clearLocalDevelopmentBlockedIps } = require('./controllers/securityAdminController');
const { SYSTEM_ADMIN_CONFLICT_MESSAGE, getActiveSystemAdmin, isActiveSystemAdminUniqueError, isSystemAdminRole } = require('./utils/systemAdminPolicy');
const { autoExpireFormsMiddleware, initFormExpirationScheduler } = require('./middleware/formExpirationMiddleware');
const { createEmailTransporter, verifyEmailTransporter } = require('./services/emailService');
const { router: aiRouter } = require('./services/aiService');
const {
  getInstructorOverallPerformance,
  getDeptHeadLivePerformanceMetrics,
  calculateWeightedPerformance,
} = require('./services/evaluationMetrics');
const { validateEvaluationFeedbackPair } = require('./utils/validationUtility');
const { sanitizeEvaluationFeedback } = require('./utils/validationUtility');
const { calculateLikertPercentage, getRatedLikertValues, isValidLikertResponse } = require('./utils/likertScoring');
const { calculateAndSaveInstructorResult } = require('./utils/evaluationCalculator');
const { startTelegramBot } = require('./services/telegramBot');
const { startCronService, getStudentReminderRecipients } = require('./services/cronService');
const { sendTelegramReminder } = require('./utils/telegramBot');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5005;
const sessionStore = new session.MemoryStore();
app.set('sessionStore', sessionStore);
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const USER_DEFAULT_PASSWORD = '12345678';
const isDatabaseConnectionError = (error) => ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST'].includes(error?.code);
const databaseUnavailableMessage = 'Database connection failed. Please ensure MySQL service is running.';

const io = initSocket(httpServer);
setRealtimeServer(io);

const getDefaultPasswordForRole = () => USER_DEFAULT_PASSWORD;

const getDefaultDeptHeadPerformance = (warning = '') => ({
  studentScore: null,
  deptHeadScore: null,
  peerScore: null,
  totalWeightedScore: null,
  totalScore: null,
  isComplete: false,
  statusBadge: 'Pending Complete Evaluation',
  completion: {
    isStudentComplete: false,
    isDeptHeadComplete: false,
    isPeerComplete: false,
  },
  hasAssignedCourse: false,
  isStudentEvaluationRequired: false,
  breakdown: {},
  strengths: [],
  weaknesses: [],
  warning,
});

if (process.env.NODE_ENV === 'development') {
  clearLocalDevelopmentBlockedIps().catch((error) => {
    console.warn('Unable to clear localhost blocklist in development mode:', error?.message || error);
  });
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(responseTimeMiddleware);
app.use(auditRequest);
app.use(systemAccessLock);
app.use(securityGate);
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'ipes-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 8 * 60 * 60 * 1000,
  },
}));
app.use('/api/auth', authRoutes);
app.use('/api/secure', secureRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dept-head', deptHeadRoutes);
app.use('/api/department-head', deptHeadRoutes);
app.use('/api/department', departmentRoutes);
app.use('/api/lab-assistant', labAssistantRoutes);
app.use('/api/user', userRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dean', deanRoutes);
app.use('/api/directorate', directorateRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/ai', aiRouter);
app.use('/api/v1/ai', aiRouter);
app.get('/api/ai-insights/summary', mwAuthenticateToken, getAiInsightsSummary);
app.get('/api/instructor/ai-insights', mwAuthenticateToken, mwAuthorizeRoles('instructor'), getInstructorAiInsights);
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

app.get('/api/reports/print-efficiency/:instructorId', mwAuthenticateToken, mwAuthorizeRoles('instructor', 'dept_head', 'college_dean', 'dean', 'admin'), async (req, res) => {
  const instructorId = Number(req.params.instructorId);
  const academicYear = String(req.query.academic_year || '').trim();
  const semester = String(req.query.semester || '').trim();
  if (!Number.isInteger(instructorId) || instructorId <= 0) {
    return res.status(400).json({ success: false, message: 'A valid instructor ID is required.' });
  }

  try {
    const requestedTargetRole = String(req.query.target_role || '').trim().toLowerCase().replace(' ', '_');
    const targetTable = requestedTargetRole === 'lab_assistant' ? 'lab_assistants' : 'instructors';
    const targetIdColumn = targetTable === 'lab_assistants' ? 'la.id' : 'i.id';
    const targetAlias = targetTable === 'lab_assistants' ? 'la' : 'i';
    const [[target]] = await pool.query(
      `SELECT LOWER(TRIM(COALESCE(u.role, ''))) AS target_role
       FROM ${targetTable} ${targetAlias} INNER JOIN users u ON u.id = ${targetAlias}.user_id
       WHERE ${targetIdColumn} = ? LIMIT 1`,
      [instructorId]
    );
    let labAssistantTarget = null;
    if (!target && targetTable !== 'lab_assistants') {
      [[labAssistantTarget]] = await pool.query(
        `SELECT LOWER(TRIM(COALESCE(u.role, ''))) AS target_role
         FROM lab_assistants la INNER JOIN users u ON u.id = la.user_id
         WHERE la.id = ? LIMIT 1`,
        [instructorId]
      );
    }
    const resolvedTarget = target || labAssistantTarget;
    if (resolvedTarget && !['instructor', 'lab_assistant'].includes(resolvedTarget.target_role)) {
      return res.status(403).json({ success: false, message: 'Reports can only be generated for Instructors and Lab Assistants.' });
    }
    if (!resolvedTarget) return res.status(404).json({ success: false, message: 'Instructor or Lab Assistant not found.' });

    if (resolvedTarget.target_role === 'instructor') {
      const metrics = await getInstructorOverallPerformance({ instructorId, academicYear, semester });
      const studentCount = Number(metrics.student?.count || 0);
      const peerCount = Number(metrics.peer?.count || 0);
      return res.json({
        success: true,
        instructor_id: metrics.instructorId,
        instructor_name: metrics.instructorName,
        department_name: metrics.department,
        college_name: metrics.college_name,
        academic_year: metrics.academicYear,
        semester: metrics.semester,
        student_average: metrics.studentRaw,
        student_raw_percentage: metrics.studentRaw,
        student_weighted: metrics.studentWeighted,
        dept_head_score: metrics.deptHeadRaw,
        raw_dean_score: metrics.deptHeadRaw,
        dean_raw: metrics.deptHeadRaw,
        dept_head_raw_score: metrics.deptHeadRaw,
        dept_head_raw_percentage: metrics.deptHeadRaw,
        dept_head_average: metrics.deptHeadRaw,
        dept_head_weighted: metrics.deptHeadWeighted,
        peer_average: metrics.peerRaw,
        raw_peer_score: metrics.peerRaw,
        peer_raw: metrics.peerRaw,
        peer_raw_percentage: metrics.peerRaw,
        peer_weighted: metrics.peerWeighted,
        evaluated_students_count: studentCount,
        evaluated_peers_count: peerCount,
        total_students_evaluated_count: studentCount,
        total_peers_evaluated_count: peerCount,
        hasCourseAssigned: Boolean(metrics.hasAssignedCourse),
        has_course_assigned: Boolean(metrics.hasAssignedCourse),
        total_score: metrics.totalScore,
        final_score: metrics.totalScore,
        classification: metrics.classification,
        breakdown: {
          student: { rawPercentage: metrics.studentRaw, weightedContribution: metrics.studentWeighted, weight: metrics.weights?.student ?? (metrics.hasAssignedCourse ? 50 : 0), isNA: !metrics.hasAssignedCourse },
          deptHead: { rawPercentage: metrics.deptHeadRaw, weightedContribution: metrics.deptHeadWeighted, weight: metrics.weights?.deptHead ?? (metrics.hasAssignedCourse ? 30 : 60) },
          peer: { rawPercentage: metrics.peerRaw, weightedContribution: metrics.peerWeighted, weight: metrics.weights?.peer ?? (metrics.hasAssignedCourse ? 20 : 40) },
        },
      });
    }

    if (resolvedTarget.target_role === 'lab_assistant') {
      const [[profile]] = await pool.query(
        `SELECT la.id, la.user_id, TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))) AS instructor_name,
          d.name AS department_name, c.name AS college_name
         FROM lab_assistants la LEFT JOIN departments d ON d.id = la.department_id
         LEFT JOIN colleges c ON c.id = d.college_id
         WHERE la.id = ? LIMIT 1`,
        [instructorId]
      );
      const [[student]] = await pool.query(
        `SELECT COALESCE(AVG(ses.score), 0) AS score, COUNT(DISTINCT ses.id) AS count
         FROM student_evaluation_submissions ses INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
         WHERE ed.target_type = 'lab_assistant' AND ed.target_user_id IN (?, ?)
            AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved')` ,
          [instructorId, profile.user_id]
      );
      const [[peer]] = await pool.query(
        `SELECT COALESCE(AVG(pes.score), 0) AS score, COUNT(DISTINCT pes.id) AS count
         FROM peer_evaluation_submissions pes INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
         INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
         WHERE ed.target_type = 'lab_assistant' AND ed.target_user_id IN (?, ?)
            AND LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved')` ,
          [instructorId, profile.user_id]
      );
      const [[deptHead]] = await pool.query(
        `SELECT COALESCE(AVG(dhe.total_score), 0) AS score, COUNT(DISTINCT dhe.id) AS count
         FROM dept_head_evaluations dhe
         WHERE dhe.evaluatee_id IN (?, ?) AND LOWER(COALESCE(dhe.target_role, '')) = 'lab_assistant'
            AND LOWER(COALESCE(dhe.status, 'pending')) IN ('submitted', 'completed', 'approved')` ,
          [instructorId, profile.user_id]
      );
      const studentRaw = Number(Number(student?.score || 0).toFixed(2));
      const peerRaw = Number(Number(peer?.score || 0).toFixed(2));
      const deptHeadStored = Number(deptHead?.score || 0);
      const deptHeadRaw = Number(deptHeadStored.toFixed(2));
      const studentWeighted = Number((studentRaw * 0.5).toFixed(2));
      const deptHeadWeighted = Number((deptHeadRaw * 0.3).toFixed(2));
      const peerWeighted = Number((peerRaw * 0.2).toFixed(2));
      const totalScore = Number((studentWeighted + deptHeadWeighted + peerWeighted).toFixed(2));
      return res.json({
        success: true,
        instructor_id: profile.id,
        instructor_name: profile.instructor_name,
        department_name: profile.department_name,
        college_name: profile.college_name,
        target_role: 'lab_assistant',
        academic_year: academicYear,
        semester,
        student_average: studentRaw,
        student_raw_percentage: studentRaw,
        student_weighted: studentWeighted,
        dept_head_score: deptHeadRaw,
        dept_head_raw_score: deptHeadStored,
        dept_head_average: deptHeadRaw,
        dept_head_weighted: deptHeadWeighted,
        peer_average: peerRaw,
        peer_raw_percentage: peerRaw,
        peer_weighted: peerWeighted,
        evaluated_students_count: Number(student?.count || 0),
        evaluated_peers_count: Number(peer?.count || 0),
        total_score: totalScore,
        final_score: totalScore,
        status: totalScore > 0 ? 'Completed' : 'Pending',
        can_print: totalScore > 0,
        breakdown: {
          student: { rawPercentage: studentRaw, weightedContribution: studentWeighted, weight: 50 },
          deptHead: { rawPercentage: deptHeadRaw, rawScore: deptHeadStored, weightedContribution: deptHeadWeighted, weight: 30 },
          peer: { rawPercentage: peerRaw, weightedContribution: peerWeighted, weight: 20 },
        },
      });
    }

    const calculatedResult = await calculateAndSaveInstructorResult(instructorId, academicYear, semester);
    const [[row]] = await pool.query(
      `SELECT er.instructor_id, er.academic_year, er.semester,
              er.student_average, er.student_score, er.peer_average, er.peer_score,
              er.dept_head_score, er.total_score, er.final_score,
              TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS instructor_name,
              d.name AS department_name,
              LOWER(TRIM(COALESCE(u.role, ''))) AS target_role
       FROM evaluation_results er
       INNER JOIN instructors i ON i.id = er.instructor_id
       INNER JOIN users u ON u.id = i.user_id
       LEFT JOIN departments d ON d.id = er.department_id
       WHERE er.instructor_id = ?
         AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('instructor', 'lab_assistant')
         AND (? = '' OR er.academic_year = ?)
         AND (? = '' OR er.semester = ?)
       ORDER BY er.id DESC LIMIT 1`,
      [instructorId, academicYear, academicYear, semester, semester]
    );
    if (!row) {
      return res.status(404).json({ success: false, message: 'Evaluation result not found.' });
    }

    const student = Number(row.student_average || row.student_score || 0);
    const peer = Number(row.peer_average || row.peer_score || 0);
    const deptHeadRaw = Number(row.dept_head_score || 0);
    const deptHead = deptHeadRaw > 0 && deptHeadRaw <= 30 ? (deptHeadRaw / 30) * 100 : deptHeadRaw;
    const breakdown = {
      student: { rawPercentage: Number(student.toFixed(2)), weight: 50, weightedContribution: Number((student * 0.5).toFixed(2)) },
      deptHead: { rawScore: Number(deptHeadRaw.toFixed(2)), rawPercentage: Number(deptHead.toFixed(2)), weight: 30, weightedContribution: Number((deptHead * 0.3).toFixed(2)) },
      peer: { rawPercentage: Number(peer.toFixed(2)), weight: 20, weightedContribution: Number((peer * 0.2).toFixed(2)) },
    };
    const totalScore = Number((breakdown.student.weightedContribution + breakdown.deptHead.weightedContribution + breakdown.peer.weightedContribution).toFixed(2));
    return res.json({
      success: true,
      instructor_id: row.instructor_id,
      instructor_name: row.instructor_name,
      department_name: row.department_name,
      academic_year: row.academic_year,
      semester: row.semester,
      student_average: breakdown.student.rawPercentage,
      dept_head_score: breakdown.deptHead.rawPercentage,
      dept_head_raw_score: breakdown.deptHead.rawScore,
      dept_head_average: breakdown.deptHead.rawPercentage,
      peer_average: breakdown.peer.rawPercentage,
      student_weighted: breakdown.student.weightedContribution,
      dept_head_weighted: breakdown.deptHead.weightedContribution,
      peer_weighted: breakdown.peer.weightedContribution,
      total_students_evaluated_count: Number(calculatedResult?.total_students_evaluated_count || 0),
      total_peers_evaluated_count: Number(calculatedResult?.total_peers_evaluated_count || 0),
      total_score: totalScore,
      final_score: totalScore,
      breakdown,
    });
  } catch (error) {
    console.error('Print efficiency report query failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to load efficiency report.' });
  }
});
app.post('/api/students/bulk-upload', mwAuthenticateToken, mwAuthorizeRoles('admin', 'systemadmin'), upload.single('file'), bulkUploadStudents);
app.post('/api/students/register', mwAuthenticateToken, mwAuthorizeRoles('admin', 'systemadmin'), registerStudent);
app.get('/api/colleges', mwAuthenticateToken, mwAuthorizeRoles('admin', 'systemadmin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, code FROM colleges ORDER BY name ASC');
    return res.json(rows);
  } catch (error) {
    console.error('Fetch colleges failed:', error);
    return res.status(500).json({ message: 'Unable to load colleges.' });
  }
});
app.post('/api/departments', mwAuthenticateToken, mwAuthorizeRoles('admin', 'systemadmin'), createDepartment);
app.get('/api/notifications', mwAuthenticateToken, getUserNotifications);
app.get('/api/notifications/unread-count', mwAuthenticateToken, getUserNotifications);
app.put('/api/notifications/:notificationId/read', mwAuthenticateToken, markNotificationRead);
app.delete('/api/notifications/:notificationId', mwAuthenticateToken, deleteNotification);
app.put('/api/notifications/mark-all-read/:userId', mwAuthenticateToken, markAllRead);
app.delete('/api/notifications/clear-all/:userId', mwAuthenticateToken, clearAllNotifications);
app.post('/api/notifications/send', mwAuthenticateToken, mwAuthorizeRoles('admin', 'systemadmin'), sendNotification);

const sendResponse = (res, statusCode, messageEn, messageAm, data = null) => {
  res.status(statusCode).json({
    success: statusCode < 400,
    message: { en: messageEn, am: messageAm },
    data,
  });
};

const normalizeRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['department_head', 'depthead'].includes(normalized) ? 'dept_head' : normalized;
};

const normalizeGenderValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'male';
  if (normalized === 'male' || normalized === 'm') return 'male';
  if (normalized === 'female' || normalized === 'f') return 'female';
  return 'male';
};

const NAME_REGEX = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const STUDENT_ID_REGEX = /^mau\d{7}$/i;
const EMPLOYEE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateRegistrationPayload = ({ first_name, last_name, full_name, role, student_id, employee_id, email, gender }) => {
  const errors = {};
  const normalizedRole = normalizeRole(role);
  const normalizedGender = normalizeGenderValue(gender);
  const nameParts = String(full_name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = String(first_name || nameParts[0] || '').trim();
  const lastName = String(last_name || nameParts.slice(1).join(' ') || '').trim();

  if (!firstName || !NAME_REGEX.test(firstName)) {
    errors.first_name = 'First name is required and may contain only letters, spaces, hyphens, and apostrophes.';
  }

  if (!lastName || !NAME_REGEX.test(lastName)) {
    errors.last_name = 'Last name is required and may contain only letters, spaces, hyphens, and apostrophes.';
  }

  if (normalizedRole === 'student') {
    const studentId = String(student_id || '').trim();
    if (!STUDENT_ID_REGEX.test(studentId)) {
      errors.student_id = "Student ID must start with 'mau' followed by exactly 7 digits (e.g. mau1600756).";
    }
  }

  if (['instructor', 'dept_head', 'lab_assistant'].includes(normalizedRole)) {
    const employeeId = String(employee_id || '').trim();
    if (!employeeId || !EMPLOYEE_ID_REGEX.test(employeeId)) {
      errors.employee_id = 'Employee ID is required and must contain at least 3 valid characters.';
    }
  }

  if (!['admin', 'systemadmin'].includes(normalizedRole) && !['male', 'female'].includes(normalizedGender)) {
    errors.gender = 'Gender is required and must be Male or Female.';
  }

  if (!['admin', 'systemadmin'].includes(normalizedRole)) {
    const emailValue = String(email || '').trim();
    if (!emailValue || !EMAIL_REGEX.test(emailValue)) {
      errors.email = 'Please provide a valid email address.';
    }
  }

  return errors;
};

const calculateProportionalScore = (scores, weights = { student: 0.5, peer: 0.2, deptHead: 0.3 }) => {
  const available = Object.entries(weights).filter(([key]) => scores?.[key] !== null && scores?.[key] !== undefined && scores?.[key] !== '' && Number.isFinite(Number(scores[key])));
  if (!available.length) return { total: 0, categories: {} };

  const categories = Object.fromEntries(available.map(([key, weight]) => {
    const score = Number(scores[key]);
    const contribution = Number((score * weight).toFixed(2));
    return [key, {
      score,
      originalWeight: weight,
      normalizedWeight: weight,
      contribution,
    }];
  }));

  return {
    total: Number(Object.values(categories).reduce((total, category) => total + category.contribution, 0).toFixed(2)),
    categories,
  };
};

const normalizePercentage = (rawScore, maxScore = 100) => {
  const score = Number(rawScore || 0);
  if (!Number.isFinite(score)) return 0;
  if (maxScore && maxScore > 0) {
    return Number(Math.min(Math.max((score / maxScore) * 100, 0), 100).toFixed(2));
  }
  return Number(Math.min(Math.max(score, 0), 100).toFixed(2));
};

const normalizeDeptHeadScore = (deptHeadScore) => {
  const value = Number(deptHeadScore || 0);
  if (!Number.isFinite(value)) return 0;
  if (value > 0 && value <= 30) return Number(((value / 30) * 100).toFixed(2));
  return Number(Math.min(value, 100).toFixed(2));
};

const INSTRUCTOR_WEIGHTED_SCORE_SQL = `ROUND(
  (COALESCE(AVG(student_score), 0) * 0.50) +
  (COALESCE(AVG(dept_head_score), 0) * 0.30) +
  (COALESCE(AVG(peer_score), 0) * 0.20), 2
)`;

const calculateInstructorWeightedScore = calculateWeightedPerformance;

const upsertEvaluationResult = async (instructorId, departmentId, academicYear = '', semester = '') => {
  let resolvedAcademicYear = String(academicYear || '').trim();
  let resolvedSemester = String(semester || '').trim();
  if (!resolvedAcademicYear || !resolvedSemester) {
    const [[term]] = await pool.query(
      'SELECT academic_year, semester FROM course_assignments WHERE instructor_id = ? ORDER BY created_at DESC LIMIT 1',
      [instructorId]
    );
    resolvedAcademicYear = resolvedAcademicYear || String(term?.academic_year || new Date().getFullYear());
    resolvedSemester = resolvedSemester || String(term?.semester || '');
  }

  const [[studentResult]] = await pool.query(
    `SELECT AVG(ses.score) AS score
     FROM student_evaluation_submissions ses
     INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
     INNER JOIN course_assignments ca ON ca.id = ed.assignment_id
     WHERE ca.instructor_id = ?
       AND LOWER(COALESCE(ed.target_type, 'instructor')) = 'instructor'
       AND LOWER(TRIM(ses.status)) IN ('submitted', 'completed', 'approved')
       AND (ed.academic_year = ? OR ed.academic_year IS NULL)
       AND (ed.semester = ? OR ed.semester IS NULL)`,
    [instructorId, resolvedAcademicYear, resolvedSemester]
  );
  const [[peerResult]] = await pool.query(
    `SELECT AVG(pes.score) AS score
     FROM peer_evaluation_submissions pes
     WHERE pes.evaluatee_id = ?
       AND LOWER(TRIM(pes.status)) IN ('submitted', 'completed', 'approved')`,
    [instructorId]
  );
  const [[deptHeadResult]] = await pool.query(
    `SELECT AVG(dhe.total_score) AS score
     FROM dept_head_evaluations dhe
     WHERE dhe.instructor_id = ?
       AND LOWER(TRIM(dhe.status)) IN ('submitted', 'completed', 'approved')`,
    [instructorId]
  );

  const [[courseAssignment]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM course_assignments
     WHERE instructor_id = ?
       AND (? = '' OR academic_year = ?)
       AND (? = '' OR semester = ?)
     LIMIT 1`,
    [instructorId, resolvedAcademicYear, resolvedAcademicYear, resolvedSemester, resolvedSemester]
  );

  const rawStudentAverage = studentResult?.score == null ? 0 : Number(studentResult.score);
  const rawPeerAverage = peerResult?.score == null ? 0 : Number(peerResult.score);
  const rawDeptHeadAverage = deptHeadResult?.score == null ? 0 : Number(deptHeadResult.score);
  const deptHeadPercentage = normalizeDeptHeadScore(rawDeptHeadAverage);
  const hasCourseAssigned = Number(courseAssignment?.total || 0) > 0 || rawStudentAverage > 0;

  const scores = {
    student: rawStudentAverage,
    peer: rawPeerAverage,
    deptHead: rawDeptHeadAverage,
  };

  let totalScore = 0;
  if (hasCourseAssigned) {
    totalScore = Number(((rawStudentAverage * 0.5) + (rawPeerAverage * 0.2) + (deptHeadPercentage * 0.3)).toFixed(2));
  } else {
    totalScore = Number(((deptHeadPercentage * 0.6) + (rawPeerAverage * 0.4)).toFixed(2));
  }

  await pool.query(
    `INSERT INTO evaluation_results
      (instructor_id, department_id, academic_year, semester, student_average, student_score, peer_average, peer_score, dept_head_score, total_score, final_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       department_id = VALUES(department_id), student_average = VALUES(student_average), student_score = VALUES(student_score),
       peer_average = VALUES(peer_average), peer_score = VALUES(peer_score), dept_head_score = VALUES(dept_head_score),
       total_score = VALUES(total_score), final_score = VALUES(final_score), published_at = CURRENT_TIMESTAMP`,
    [instructorId, departmentId, resolvedAcademicYear, resolvedSemester, rawStudentAverage, rawStudentAverage, rawPeerAverage, rawPeerAverage, rawDeptHeadAverage, totalScore, totalScore]
  );

  return {
    academicYear: resolvedAcademicYear,
    semester: resolvedSemester,
    studentScore: rawStudentAverage,
    deptHeadScore: rawDeptHeadAverage,
    peerScore: rawPeerAverage,
    deptHeadPercentage,
    hasCourseAssigned,
    totalScore: Number(totalScore.toFixed(2)),
    finalScore: Number(totalScore.toFixed(2)),
  };
};

const authenticate = (req, res, next) => {
  const authorization = typeof req.headers.authorization === 'string'
    ? req.headers.authorization.trim()
    : '';
  const tokenMatch = authorization.match(/^Bearer\s+([^\s]+)$/i);

  if (!tokenMatch) {
    return sendResponse(res, 401, 'Authentication required.', 'ማረጋገጫ ያስፈልጋል።');
  }

  const token = tokenMatch[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || !decoded || typeof decoded !== 'object') {
      return sendResponse(res, 401, 'Invalid or expired token.', 'ልክ ያልሆነ ወይም ጊዜ ያለፈ ቶከን ነው።');
    }
    req.user = {
      ...decoded,
      role: normalizeRole(decoded.role || decoded.user_role),
    };
    next();
  });
};

const authorizeRoles = (...roles) => (req, res, next) => {
  const allowedRoles = roles.map(normalizeRole);
  if (!req.user || !allowedRoles.includes(normalizeRole(req.user.role || req.user.user_role))) {
    return sendResponse(res, 403, 'You do not have permission to perform this action.', 'ይህን እርምጃ ለማከናወን ፈቃድ የለህም።');
  }
  next();
};

const normalizeSectionValue = (value) => {
  if (value === null || value === undefined) return '';
  const normalized = String(value).trim();
  if (!normalized) return '';
  const withoutPrefix = normalized.replace(/^section\s+/i, '').trim();
  return withoutPrefix.replace(/\s+/g, ' ');
};

const normalizePublishTarget = (value) => {
  const normalized = String(value || 'both').trim().toLowerCase();
  if (normalized === 'students') return 'student';
  if (normalized === 'instructors') return 'instructor';
  if (['student', 'instructor', 'both'].includes(normalized)) return normalized;
  return 'both';
};

const notifyDepartmentHead = async ({ departmentId, title, message, type = 'evaluation_completed' }) => {
  const [departmentHeads] = await pool.query(
    `SELECT DISTINCT i.user_id
     FROM instructors i
     INNER JOIN users u ON u.id = i.user_id
     WHERE i.department_id = ?
       AND LOWER(u.role) IN ('dept_head', 'department_head')
       AND LOWER(COALESCE(u.status, 'active')) = 'active'`,
    [departmentId]
  );
  await createNotifications({
    userIds: departmentHeads.map((head) => head.user_id),
    title,
    message,
    type,
  });
};

const autoCloseStudentEvaluation = async (dispatch) => {
  if (!dispatch?.assignment_id) return false;

  const [[progress]] = await pool.query(
    `SELECT COUNT(*) AS total_dispatches,
            COUNT(CASE WHEN LOWER(COALESCE(ed.status, '')) = 'submitted'
              AND EXISTS (
                SELECT 1 FROM student_evaluation_submissions ses
                WHERE ses.dispatch_id = ed.id
                  AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved')
              ) THEN 1 END) AS completed_dispatches
     FROM evaluation_dispatches ed
     WHERE ed.assignment_id = ? AND ed.evaluation_type = 'student'`,
    [dispatch.assignment_id]
  );

  const totalDispatches = Number(progress?.total_dispatches || 0);
  const completedDispatches = Number(progress?.completed_dispatches || 0);
  if (!totalDispatches || completedDispatches !== totalDispatches) return false;

  const [result] = await pool.query(
    `UPDATE evaluation_dispatches
     SET status = 'closed'
     WHERE assignment_id = ? AND evaluation_type = 'student' AND status <> 'closed'`,
    [dispatch.assignment_id]
  );
  if (!result.affectedRows) return false;

  await notifyDepartmentHead({
    departmentId: dispatch.department_id,
    title: 'Student evaluation batch completed',
    message: `All student evaluations for ${dispatch.course_name || 'the assigned course'} are complete. You can now review or publish the report.`,
    type: 'evaluation_batch_completed',
  });
  return true;
};

const notifyStudentCohort = async ({ departmentId, programType, yearLevel, semester, section, title, message, type }) => {
  try {
    const [students] = await pool.query(
      `SELECT s.user_id
       FROM students s
       WHERE s.department_id = ?
         AND (? IS NULL OR LOWER(TRIM(s.program_type)) = LOWER(TRIM(?)))
         AND (? IS NULL OR LOWER(TRIM(s.semester)) = LOWER(TRIM(?)))
         AND (? IS NULL OR LOWER(TRIM(REPLACE(s.section, 'Section ', ''))) = LOWER(TRIM(REPLACE(?, 'Section ', ''))))`,
      [departmentId, programType ?? null, programType ?? null, yearLevel ?? null, yearLevel ?? null, semester ?? null, semester ?? null, section ?? null, section ?? null]
    );
    await createNotifications({ userIds: students.map((student) => student.user_id), title, message, type });
  } catch (error) {
    console.error('Student cohort notification failed:', error);
  }
};

const initializeSchema = async () => {
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

  // Helper to check for column existence
  const columnExists = async (table, column) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return rows && rows[0] && rows[0].cnt > 0;
  };

  const normalizeUnsignedKey = async (table, column) => {
    try {
      const [rows] = await pool.query(
        `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      );

      if (rows && rows[0] && !String(rows[0].COLUMN_TYPE).toLowerCase().includes('unsigned')) {
        await pool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` INT UNSIGNED NOT NULL AUTO_INCREMENT`);
      }
    } catch (error) {
      console.warn(`Could not normalize unsigned key for ${table}.${column}:`, error?.message || error);
    }
  };

  await pool.query(`CREATE TABLE IF NOT EXISTS colleges (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    college_id INT UNSIGNED NOT NULL,
    department_name VARCHAR(100) NOT NULL,
    department_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) NOT NULL UNIQUE,
    CONSTRAINT fk_departments_college FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  if (!(await columnExists('departments', 'college_id'))) {
    await pool.query('ALTER TABLE departments ADD COLUMN college_id INT UNSIGNED NULL AFTER id');
  }
  if (!(await columnExists('departments', 'department_name'))) {
    await pool.query('ALTER TABLE departments ADD COLUMN department_name VARCHAR(100) NULL AFTER college_id');
  }
  if (!(await columnExists('departments', 'department_code'))) {
    await pool.query('ALTER TABLE departments ADD COLUMN department_code VARCHAR(20) NULL UNIQUE AFTER department_name');
  }
  await pool.query('UPDATE departments SET department_name = COALESCE(NULLIF(department_name, ""), name), department_code = COALESCE(NULLIF(department_code, ""), code) WHERE department_name IS NULL OR department_code IS NULL');

  // Users table stores authentication and account metadata; role profiles store identity fields.
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NULL UNIQUE,
        first_name VARCHAR(128) NULL,
        last_name VARCHAR(128) NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin','student','instructor','dept_head','department_head','college_dean','dean','academic_directorate','academic_director','directorate','academic_vice_president','lab_assistant') NOT NULL DEFAULT 'student',
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      is_first_login BOOLEAN NOT NULL DEFAULT TRUE,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  if (!(await columnExists('users', 'email'))) {
    await pool.query('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL UNIQUE AFTER id');
  }

  if (!(await columnExists('users', 'first_name'))) {
    await pool.query('ALTER TABLE users ADD COLUMN first_name VARCHAR(128) NULL AFTER email');
  }

  if (!(await columnExists('users', 'last_name'))) {
    await pool.query('ALTER TABLE users ADD COLUMN last_name VARCHAR(128) NULL AFTER first_name');
  }

  if (!(await columnExists('users', 'is_first_login'))) {
    await pool.query('ALTER TABLE users ADD COLUMN is_first_login BOOLEAN NOT NULL DEFAULT TRUE');
  }

  if (!(await columnExists('users', 'must_change_password'))) {
    await pool.query('ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT TRUE');
  }

  if (!(await columnExists('users', 'telegram_chat_id'))) {
    await pool.query('ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT NULL');
  }

  if (!(await columnExists('users', 'phone_number'))) {
    await pool.query('ALTER TABLE users ADD COLUMN phone_number VARCHAR(32) NULL');
  }

  if (!(await columnExists('users', 'profile_picture'))) {
    await pool.query('ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255) NULL');
  }

  if (!(await columnExists('users', 'language'))) {
    await pool.query("ALTER TABLE users ADD COLUMN language ENUM('en', 'am') NOT NULL DEFAULT 'am'");
  }

  await pool.query("ALTER TABLE users MODIFY COLUMN role ENUM('admin','student','instructor','dept_head','department_head','college_dean','dean','academic_directorate','academic_director','directorate','academic_vice_president','lab_assistant') NOT NULL DEFAULT 'student'");

  if (!(await columnExists('users', 'active_system_admin_slot'))) {
    await pool.query(`ALTER TABLE users ADD COLUMN active_system_admin_slot TINYINT
      GENERATED ALWAYS AS (
        CASE WHEN LOWER(role) IN ('admin', 'systemadmin', 'system_admin')
          AND LOWER(COALESCE(status, 'active')) = 'active' THEN 1 ELSE NULL END
      ) STORED`);
  }

  const [systemAdminIndexRows] = await pool.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
       AND INDEX_NAME = 'uq_users_single_active_system_admin' LIMIT 1`
  );
  if (!systemAdminIndexRows.length) {
    const [[activeSystemAdmins]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users
       WHERE LOWER(role) IN ('admin', 'systemadmin', 'system_admin')
         AND LOWER(COALESCE(status, 'active')) = 'active'`
    );
    if (Number(activeSystemAdmins.total || 0) <= 1) {
      await pool.query('ALTER TABLE users ADD UNIQUE KEY uq_users_single_active_system_admin (active_system_admin_slot)');
    } else {
      console.error('Multiple active System Admin accounts exist. Deactivate all but one to enable the database uniqueness constraint.');
    }
  }

  // Instructors table
  await pool.query(`CREATE TABLE IF NOT EXISTS instructors (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    employee_id VARCHAR(64) DEFAULT NULL,
    first_name VARCHAR(128) DEFAULT NULL,
    last_name VARCHAR(128) DEFAULT NULL,
    department_id INT UNSIGNED DEFAULT NULL,
    gender VARCHAR(10) DEFAULT NULL,
    phone_number VARCHAR(32) DEFAULT NULL,
    profile_picture VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_instructor_user (user_id),
    CONSTRAINT fk_instructors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_instructors_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS instructor_goals (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    instructor_user_id INT UNSIGNED NOT NULL,
    focus_area VARCHAR(100) NOT NULL,
    goal TEXT NOT NULL,
    term VARCHAR(100) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_instructor_goals_user (instructor_user_id),
    CONSTRAINT fk_instructor_goals_user FOREIGN KEY (instructor_user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS lab_assistants (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    employee_id VARCHAR(64) DEFAULT NULL,
    first_name VARCHAR(100) DEFAULT NULL,
    last_name VARCHAR(100) DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    department_id INT UNSIGNED DEFAULT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_lab_assistant_user (user_id),
    CONSTRAINT fk_lab_assistants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_lab_assistants_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [labAssistantColumns] = await pool.query('SHOW COLUMNS FROM lab_assistants');
  const labAssistantColumnNames = new Set(labAssistantColumns.map((column) => column.Field));
  if (!labAssistantColumnNames.has('first_name')) {
    await pool.query('ALTER TABLE lab_assistants ADD COLUMN first_name VARCHAR(100) NULL AFTER employee_id');
  }
  if (!labAssistantColumnNames.has('last_name')) {
    await pool.query('ALTER TABLE lab_assistants ADD COLUMN last_name VARCHAR(100) NULL AFTER first_name');
  }
  if (!labAssistantColumnNames.has('gender')) {
    await pool.query('ALTER TABLE lab_assistants ADD COLUMN gender VARCHAR(10) NULL AFTER department_id');
  }
  if (!labAssistantColumnNames.has('phone_number')) {
    await pool.query('ALTER TABLE lab_assistants ADD COLUMN phone_number VARCHAR(32) NULL AFTER gender');
  }
  if (!labAssistantColumnNames.has('profile_picture')) {
    await pool.query('ALTER TABLE lab_assistants ADD COLUMN profile_picture VARCHAR(255) NULL AFTER phone_number');
  }
  if (labAssistantColumnNames.has('full_name')) {
    await pool.query(`
      UPDATE lab_assistants
      SET first_name = COALESCE(NULLIF(first_name, ''), SUBSTRING_INDEX(TRIM(full_name), ' ', 1)),
          last_name = COALESCE(NULLIF(last_name, ''), NULLIF(SUBSTRING(TRIM(full_name), LOCATE(' ', TRIM(full_name)) + 1), ''))
      WHERE full_name IS NOT NULL
    `);
  }

  // Students table
  await pool.query(`CREATE TABLE IF NOT EXISTS students (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    student_id VARCHAR(64) DEFAULT NULL,
    first_name VARCHAR(128) DEFAULT NULL,
    last_name VARCHAR(128) DEFAULT NULL,
    department_id INT UNSIGNED DEFAULT NULL,
    semester VARCHAR(32) DEFAULT NULL,
    year_level VARCHAR(64) DEFAULT NULL,
    section VARCHAR(64) DEFAULT NULL,
    gender VARCHAR(10) DEFAULT NULL,
    phone_number VARCHAR(32) DEFAULT NULL,
    profile_picture VARCHAR(255) DEFAULT NULL,
    program_type VARCHAR(64) DEFAULT NULL,
    registration_date VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_student_user (user_id),
    CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_students_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  if (!(await columnExists('students', 'registration_date'))) {
    await pool.query('ALTER TABLE students ADD COLUMN registration_date VARCHAR(64) DEFAULT NULL');
  }
  await pool.query(`
    UPDATE students
    SET registration_date = COALESCE(DATE_FORMAT(created_at, '%Y-%m-%d'), CURRENT_DATE)
    WHERE registration_date IS NULL OR TRIM(registration_date) = ''
  `);

  // Courses
  await pool.query(`CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    credit_hours INT NOT NULL DEFAULT 3,
    year_level VARCHAR(32) DEFAULT NULL,
    semester VARCHAR(32) DEFAULT NULL,
    department_id INT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_courses_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query('ALTER TABLE courses ADD COLUMN IF NOT EXISTS year_level VARCHAR(32) DEFAULT NULL');
  await pool.query('ALTER TABLE courses ADD COLUMN IF NOT EXISTS semester VARCHAR(32) DEFAULT NULL');
  await pool.query('ALTER TABLE courses ADD COLUMN IF NOT EXISTS credit_hours INT NOT NULL DEFAULT 3');

  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    action_title VARCHAR(255) NOT NULL,
    description TEXT,
    performed_by VARCHAR(255),
    ip_address VARCHAR(64),
    actor_user_id INT UNSIGNED DEFAULT NULL,
    actor_email VARCHAR(255) DEFAULT NULL,
    actor_role VARCHAR(64) DEFAULT NULL,
    category VARCHAR(64) DEFAULT NULL,
    target_details TEXT,
    route_path VARCHAR(512) DEFAULT NULL,
    http_method VARCHAR(12) DEFAULT NULL,
    status_code SMALLINT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_logs_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS actor_user_id INT UNSIGNED DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS actor_email VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS actor_role VARCHAR(64) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS target_details TEXT,
    ADD COLUMN IF NOT EXISTS route_path VARCHAR(512) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS http_method VARCHAR(12) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS status_code SMALLINT UNSIGNED DEFAULT NULL`);

  await pool.query(`CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(128) PRIMARY KEY,
    setting_value TEXT NULL,
    is_system_locked TINYINT(1) NOT NULL DEFAULT 0,
    lock_reason VARCHAR(500) NOT NULL DEFAULT 'System temporarily locked by System Admin',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS is_system_locked TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lock_reason VARCHAR(500) NOT NULL DEFAULT 'System temporarily locked by System Admin'`);
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value, is_system_locked, lock_reason)
     VALUES ('system_access_control', NULL, 0, 'System temporarily locked by System Admin')
     ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)`
  );

  // Course assignments (connections between course, instructor, optional student)
  await pool.query(`CREATE TABLE IF NOT EXISTS course_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT UNSIGNED NOT NULL,
    department_id INT UNSIGNED DEFAULT NULL,
    instructor_id INT UNSIGNED DEFAULT NULL,
    staff_id INT UNSIGNED DEFAULT NULL,
    assigned_role VARCHAR(32) NOT NULL DEFAULT 'instructor',
    student_id INT UNSIGNED DEFAULT NULL,
    program_type VARCHAR(32) DEFAULT NULL,
    year_level VARCHAR(32) DEFAULT NULL,
    semester VARCHAR(32) DEFAULT NULL,
    section VARCHAR(32) DEFAULT NULL,
    publish_target VARCHAR(32) DEFAULT 'both',
    is_published TINYINT(1) DEFAULT 0,
    is_student_published TINYINT(1) DEFAULT 0,
    is_peer_published TINYINT(1) DEFAULT 0,
    academic_year VARCHAR(32) DEFAULT '2026',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_assign_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_assign_instructor FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE SET NULL,
    CONSTRAINT fk_assign_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`ALTER TABLE course_assignments
    ADD COLUMN IF NOT EXISTS staff_id INT UNSIGNED DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS lab_assistant_id INT UNSIGNED DEFAULT NULL AFTER instructor_id,
    ADD COLUMN IF NOT EXISTS assigned_role VARCHAR(32) NOT NULL DEFAULT 'instructor',
    ADD COLUMN IF NOT EXISTS student_id INT UNSIGNED DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS program_type VARCHAR(32) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS year_level VARCHAR(32) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS semester VARCHAR(32) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS section VARCHAR(32) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS publish_target VARCHAR(32) DEFAULT 'both',
    ADD COLUMN IF NOT EXISTS is_student_published TINYINT(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_peer_published TINYINT(1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS academic_year VARCHAR(32) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT NULL`);
  try {
    await pool.query('ALTER TABLE course_assignments ADD CONSTRAINT fk_assign_lab_assistant FOREIGN KEY (lab_assistant_id) REFERENCES lab_assistants(id) ON DELETE SET NULL');
  } catch (error) {
    if (!['ER_DUP_KEY', 'ER_DUP_CONSTRAINT', 'ER_CANT_CREATE_TABLE'].includes(error?.code)) throw error;
  }
  await pool.query('ALTER TABLE course_assignments MODIFY COLUMN instructor_id INT UNSIGNED NULL');

  // Evaluation templates
  await pool.query(`CREATE TABLE IF NOT EXISTS evaluation_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    template_data JSON NOT NULL,
    created_by INT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_evaluation_templates_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS evaluation_criteria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    evaluator_type ENUM('student', 'peer', 'dept_head', 'dean', 'dean_evaluates_dept_head') NOT NULL,
    criterion_text VARCHAR(255) NOT NULL,
    criterion_text_am VARCHAR(255) DEFAULT NULL,
    category VARCHAR(100) DEFAULT 'General',
    weight INT DEFAULT 5,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query("ALTER TABLE evaluation_criteria MODIFY COLUMN evaluator_type ENUM('student', 'peer', 'dept_head', 'dean', 'dean_evaluates_dept_head') NOT NULL");

  await pool.query('ALTER TABLE evaluation_criteria ADD COLUMN IF NOT EXISTS criterion_text_am VARCHAR(255) DEFAULT NULL AFTER criterion_text');
  await pool.query("UPDATE evaluation_criteria SET criterion_text_am = CONCAT('የግምገማ መስፈርት፦ ', criterion_text) WHERE criterion_text_am IS NULL OR TRIM(criterion_text_am) = ''");

  // Evaluation dispatches
  await pool.query(`CREATE TABLE IF NOT EXISTS evaluation_dispatches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT DEFAULT NULL,
    student_id INT UNSIGNED DEFAULT NULL,
    student_identifier VARCHAR(255) DEFAULT NULL,
    course_id INT UNSIGNED DEFAULT NULL,
    assignment_id INT UNSIGNED DEFAULT NULL,
    course_code VARCHAR(64) DEFAULT NULL,
    course_name VARCHAR(255) DEFAULT NULL,
    academic_year VARCHAR(64) DEFAULT NULL,
    semester VARCHAR(64) DEFAULT NULL,
    year_level VARCHAR(64) DEFAULT NULL,
    student_group VARCHAR(255) DEFAULT NULL,
    student_identifier_text VARCHAR(255) DEFAULT NULL,
    created_by INT UNSIGNED DEFAULT NULL,
    payload JSON DEFAULT NULL,
    evaluation_type VARCHAR(32) NOT NULL DEFAULT 'student',
    deadline VARCHAR(128) DEFAULT NULL,
    status ENUM('pending','active','submitted','closed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_evaluation_dispatches_template FOREIGN KEY (template_id) REFERENCES evaluation_templates(id) ON DELETE SET NULL,
    CONSTRAINT fk_evaluation_dispatches_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
    CONSTRAINT fk_evaluation_dispatches_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_evaluation_dispatches_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS assignment_id INT UNSIGNED DEFAULT NULL');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS course_code VARCHAR(64) DEFAULT NULL');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS student_identifier_text VARCHAR(255) DEFAULT NULL');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS department_id INT UNSIGNED DEFAULT NULL');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS evaluation_type VARCHAR(32) NOT NULL DEFAULT \'student\'');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS deadline VARCHAR(128) DEFAULT NULL');
  await pool.query("ALTER TABLE evaluation_dispatches MODIFY COLUMN status ENUM('pending','active','submitted','closed') NOT NULL DEFAULT 'pending'");
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS program_type VARCHAR(64) DEFAULT NULL');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS is_student_published TINYINT(1) DEFAULT 0');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS target_type VARCHAR(32) DEFAULT NULL');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS target_user_id INT UNSIGNED DEFAULT NULL');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS target_first_name VARCHAR(100) DEFAULT NULL');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS target_last_name VARCHAR(100) DEFAULT NULL');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS target_employee_id VARCHAR(50) DEFAULT NULL');
  await pool.query('ALTER TABLE evaluation_dispatches ADD COLUMN IF NOT EXISTS evaluation_template VARCHAR(64) DEFAULT NULL');

  // Peer evaluations must exist before peer evaluation submissions reference them.
  await pool.query(`CREATE TABLE IF NOT EXISTS peer_evaluations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    evaluator_id INT UNSIGNED NOT NULL,
    evaluatee_id INT UNSIGNED DEFAULT NULL,
    course_id INT UNSIGNED DEFAULT NULL,
    deadline VARCHAR(64) DEFAULT '2026-08-17',
    status ENUM('pending', 'active', 'submitted') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_evaluator_id (evaluator_id),
    INDEX idx_evaluatee_id (evaluatee_id),
    UNIQUE KEY unique_evaluator_evaluatee_pair (evaluator_id, evaluatee_id),
    CONSTRAINT fk_peer_evaluations_evaluator FOREIGN KEY (evaluator_id) REFERENCES instructors(id) ON DELETE CASCADE,
    CONSTRAINT fk_peer_evaluations_evaluatee FOREIGN KEY (evaluatee_id) REFERENCES instructors(id) ON DELETE CASCADE,
    CONSTRAINT fk_peer_evaluations_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query('ALTER TABLE peer_evaluations ADD COLUMN IF NOT EXISTS dispatch_id INT DEFAULT NULL');
  await pool.query('ALTER TABLE peer_evaluations MODIFY COLUMN evaluator_id INT UNSIGNED NULL');
  await pool.query('ALTER TABLE peer_evaluations ADD COLUMN IF NOT EXISTS evaluator_user_id INT UNSIGNED NULL AFTER evaluator_id');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_peer_evaluations_evaluator_user ON peer_evaluations(evaluator_user_id)');
  try {
    await pool.query('ALTER TABLE peer_evaluations ADD CONSTRAINT fk_peer_evaluations_evaluator_user FOREIGN KEY (evaluator_user_id) REFERENCES users(id) ON DELETE CASCADE');
  } catch (error) {
    if (!['ER_DUP_KEY', 'ER_DUP_CONSTRAINT', 'ER_CANT_CREATE_TABLE'].includes(error?.code)) throw error;
  }

  // Student evaluation submissions
  await pool.query(`CREATE TABLE IF NOT EXISTS student_evaluation_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dispatch_id INT NOT NULL,
    student_id INT UNSIGNED DEFAULT NULL,
    student_name VARCHAR(255) DEFAULT NULL,
    score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    feedback TEXT DEFAULT NULL,
    strengths TEXT DEFAULT NULL,
    improvements TEXT DEFAULT NULL,
    responses JSON DEFAULT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'submitted',
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_evaluation_submissions_dispatch FOREIGN KEY (dispatch_id) REFERENCES evaluation_dispatches(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_evaluation_submissions_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query('ALTER TABLE student_evaluation_submissions ADD COLUMN IF NOT EXISTS strengths TEXT DEFAULT NULL');
  await pool.query('ALTER TABLE student_evaluation_submissions ADD COLUMN IF NOT EXISTS improvements TEXT DEFAULT NULL');
  await pool.query('ALTER TABLE student_evaluation_submissions ADD COLUMN IF NOT EXISTS submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await pool.query('ALTER TABLE student_evaluation_submissions ADD COLUMN IF NOT EXISTS editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY)');
  await pool.query('UPDATE student_evaluation_submissions SET editable_until = DATE_ADD(submitted_at, INTERVAL 3 DAY) WHERE submitted_at IS NOT NULL AND editable_until > DATE_ADD(submitted_at, INTERVAL 3 DAY)');

  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'reminder',
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notifications_user_read (user_id, is_read, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL');
  await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT NOT NULL');
  await pool.query("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'reminder'");
  await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read TINYINT(1) NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

  await pool.query(`CREATE TABLE IF NOT EXISTS password_resets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_password_resets_user (user_id, expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS peer_evaluation_publications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    department_id INT UNSIGNED NOT NULL,
    academic_year VARCHAR(64) NOT NULL,
    semester VARCHAR(64) NOT NULL,
    status ENUM('published', 'unpublished') NOT NULL DEFAULT 'unpublished',
    started_at DATETIME NULL,
    created_by INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_peer_publication_term (department_id, academic_year, semester),
    CONSTRAINT fk_peer_publication_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    CONSTRAINT fk_peer_publication_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query('ALTER TABLE peer_evaluation_publications ADD COLUMN IF NOT EXISTS published_by INT UNSIGNED NULL AFTER created_by');
  await pool.query('ALTER TABLE peer_evaluation_publications ADD COLUMN IF NOT EXISTS started_at DATETIME NULL AFTER status');

  // Peer evaluation submissions
  await pool.query(`CREATE TABLE IF NOT EXISTS peer_evaluation_submissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    peer_evaluation_id INT UNSIGNED NOT NULL,
    evaluator_id INT UNSIGNED NOT NULL,
    evaluatee_id INT UNSIGNED DEFAULT NULL,
    score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    strengths TEXT DEFAULT NULL,
    suggestions TEXT DEFAULT NULL,
    responses JSON DEFAULT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'submitted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_peer_evaluation_submissions_peer_eval FOREIGN KEY (peer_evaluation_id) REFERENCES peer_evaluations(id) ON DELETE CASCADE,
    CONSTRAINT fk_peer_evaluation_submissions_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_peer_evaluation_submissions_evaluatee FOREIGN KEY (evaluatee_id) REFERENCES instructors(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Evaluations (link to course assignment and evaluator user)
  await pool.query(`CREATE TABLE IF NOT EXISTS evaluations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT UNSIGNED NOT NULL,
    evaluator_id INT UNSIGNED NOT NULL,
    evaluator_role VARCHAR(32) NOT NULL DEFAULT 'student',
    score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    feedback TEXT DEFAULT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'submitted',
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY),
    is_updated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_evaluations_assignment FOREIGN KEY (assignment_id) REFERENCES course_assignments(id) ON DELETE CASCADE,
    CONSTRAINT fk_evaluations_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query('ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await pool.query('ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY)');
  await pool.query('ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS is_updated BOOLEAN NOT NULL DEFAULT FALSE');

  await pool.query(`CREATE TABLE IF NOT EXISTS evaluation_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    instructor_id INT UNSIGNED NOT NULL,
    department_id INT UNSIGNED DEFAULT NULL,
    academic_year VARCHAR(64) NOT NULL DEFAULT '',
    semester VARCHAR(64) NOT NULL DEFAULT '',
    student_average DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    peer_average DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    dept_head_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    total_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    student_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    peer_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    final_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_evaluation_results_instructor FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE CASCADE,
    CONSTRAINT fk_evaluation_results_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    UNIQUE KEY uk_evaluation_results_instructor_term (instructor_id, academic_year, semester)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query('ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS academic_year VARCHAR(64) NOT NULL DEFAULT \'\'');
  await pool.query('ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS semester VARCHAR(64) NOT NULL DEFAULT \'\'');
  await pool.query('ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS student_score DECIMAL(5,2) NOT NULL DEFAULT 0.00');
  await pool.query('ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS peer_score DECIMAL(5,2) NOT NULL DEFAULT 0.00');
  await pool.query('ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS final_score DECIMAL(5,2) NOT NULL DEFAULT 0.00');
  try { await pool.query('ALTER TABLE evaluation_results DROP INDEX uk_evaluation_results_instructor'); } catch (error) { }
  try { await pool.query('ALTER TABLE evaluation_results ADD UNIQUE KEY uk_evaluation_results_instructor_term (instructor_id, academic_year, semester)'); } catch (error) { }

  await pool.query(`CREATE TABLE IF NOT EXISTS evaluation_summaries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    instructor_id INT UNSIGNED NOT NULL UNIQUE,
    department_id INT UNSIGNED DEFAULT NULL,
    student_raw_percentage DECIMAL(6,2) NOT NULL DEFAULT 0,
    student_weighted_score DECIMAL(6,2) NOT NULL DEFAULT 0,
    dept_head_raw_percentage DECIMAL(6,2) NOT NULL DEFAULT 0,
    dept_head_weighted_score DECIMAL(6,2) NOT NULL DEFAULT 0,
    peer_raw_percentage DECIMAL(6,2) NOT NULL DEFAULT 0,
    peer_weighted_score DECIMAL(6,2) NOT NULL DEFAULT 0,
    total_weighted_score DECIMAL(6,2) NOT NULL DEFAULT 0,
    is_published TINYINT(1) NOT NULL DEFAULT 0,
    published_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_evaluation_summaries_instructor FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE CASCADE,
    INDEX idx_evaluation_summaries_department (department_id, is_published)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Dept head evaluations (separate table to store dept head individual evaluations)
  await pool.query(`CREATE TABLE IF NOT EXISTS dept_head_evaluations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    evaluator_id INT UNSIGNED NOT NULL,
    dept_head_id INT UNSIGNED DEFAULT NULL,
    instructor_id INT UNSIGNED NOT NULL,
    evaluatee_id INT UNSIGNED DEFAULT NULL,
    target_role VARCHAR(32) NOT NULL DEFAULT 'instructor',
    department_id INT UNSIGNED DEFAULT NULL,
    criteria_scores JSON DEFAULT NULL,
    responses JSON DEFAULT NULL,
    feedback TEXT DEFAULT NULL,
    total_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'Pending',
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_dept_head_eval_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dept_head_eval_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    UNIQUE KEY uk_dept_head_eval_unique (evaluator_id, target_role, evaluatee_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  if (!(await columnExists('dept_head_evaluations', 'evaluatee_id'))) {
    await pool.query('ALTER TABLE dept_head_evaluations ADD COLUMN evaluatee_id INT UNSIGNED NULL AFTER instructor_id');
  }
  if (!(await columnExists('dept_head_evaluations', 'dept_head_id'))) {
    await pool.query('ALTER TABLE dept_head_evaluations ADD COLUMN dept_head_id INT UNSIGNED NULL AFTER evaluator_id');
  }
  await pool.query('UPDATE dept_head_evaluations SET dept_head_id = evaluator_id WHERE dept_head_id IS NULL');
  if (!(await columnExists('dept_head_evaluations', 'responses'))) {
    await pool.query('ALTER TABLE dept_head_evaluations ADD COLUMN responses JSON NULL AFTER criteria_scores');
  }
  if (!(await columnExists('dept_head_evaluations', 'academic_year'))) {
    await pool.query("ALTER TABLE dept_head_evaluations ADD COLUMN academic_year VARCHAR(20) DEFAULT '2025/2026' AFTER department_id");
  }
  if (!(await columnExists('dept_head_evaluations', 'semester'))) {
    await pool.query("ALTER TABLE dept_head_evaluations ADD COLUMN semester VARCHAR(20) DEFAULT 'Semester II' AFTER academic_year");
  }
  if (!(await columnExists('dept_head_evaluations', 'feedback'))) {
    await pool.query('ALTER TABLE dept_head_evaluations ADD COLUMN feedback TEXT NULL AFTER responses');
  }
  if (!(await columnExists('dept_head_evaluations', 'submitted_at'))) {
    await pool.query('ALTER TABLE dept_head_evaluations ADD COLUMN submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER status');
  }
  if (!(await columnExists('dept_head_evaluations', 'target_role'))) {
    await pool.query("ALTER TABLE dept_head_evaluations ADD COLUMN target_role VARCHAR(32) NOT NULL DEFAULT 'instructor' AFTER evaluatee_id");
  }
  if (!(await columnExists('dept_head_evaluations', 'strengths'))) {
    await pool.query('ALTER TABLE dept_head_evaluations ADD COLUMN strengths TEXT NULL AFTER criteria_scores');
  }
  if (!(await columnExists('dept_head_evaluations', 'weaknesses'))) {
    await pool.query('ALTER TABLE dept_head_evaluations ADD COLUMN weaknesses TEXT NULL AFTER strengths');
  }
  if (!(await columnExists('dept_head_evaluations', 'deadline'))) {
    await pool.query("ALTER TABLE dept_head_evaluations ADD COLUMN deadline VARCHAR(64) DEFAULT NULL AFTER total_score");
  }
  try {
    await pool.query('ALTER TABLE dept_head_evaluations DROP FOREIGN KEY fk_dept_head_eval_instructor');
  } catch (error) {
    // ignore if no foreign key exists
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS directorate_evaluations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    evaluator_id INT UNSIGNED NOT NULL,
    dean_id INT UNSIGNED NOT NULL,
    ratings JSON NOT NULL,
    strengths TEXT NULL,
    weaknesses TEXT NULL,
    total_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_directorate_eval (evaluator_id, dean_id),
    CONSTRAINT fk_directorate_eval_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_directorate_eval_dean FOREIGN KEY (dean_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS vice_president_evaluations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    evaluator_id INT UNSIGNED NOT NULL,
    academic_directorate_id INT UNSIGNED NOT NULL,
    ratings JSON NOT NULL,
    score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    weighted_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    strengths TEXT NULL,
    weaknesses TEXT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_vice_president_eval (evaluator_id, academic_directorate_id),
    CONSTRAINT fk_vice_president_eval_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_vice_president_eval_directorate FOREIGN KEY (academic_directorate_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [adminRows] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', ['admin.k@system.local']);
  if (!adminRows.length) {
    const adminPasswordHash = await bcrypt.hash(getDefaultPasswordForRole('admin'), 12);
    await pool.query(
      'INSERT INTO users (email, password_hash, role, status, is_first_login, must_change_password) VALUES (?, ?, ?, ?, ?, ?)',
      ['admin.k@system.local', adminPasswordHash, 'admin', 'active', true, true]
    );
  }
};

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return sendResponse(res, 200, 'API is healthy.', 'ኤፒአይ ጤናማ ነው።', { service: 'ipes-api', database: 'connected' });
  } catch (error) {
    return sendResponse(res, 500, 'API is running but the database is unavailable.', 'ኤፒአይ እየሄደ ነው ነገር ግን ዳታቤዝ የለም።', { database: 'disconnected' });
  }
});

app.get('/api/dept-head/courses', authenticate, authorizeRoles('dept_head'), async (req, res) => {
  try {
    const departmentValue = req.query.department ?? req.query.department_id ?? req.user.department_id ?? req.user.departmentId ?? req.user.department;
    const departmentId = await resolveDepartmentId(departmentValue);
    if (!departmentId) {
      return sendResponse(res, 403, 'Your department is not defined. Contact an administrator.', 'የክፍልዎ መለያ አልተገኘም። እባክዎ ከአስተዳደሩ ጋር ይገናኙ።');
    }

    const [departmentColumns] = await pool.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'departments'
         AND COLUMN_NAME IN ('name', 'department_name')
       ORDER BY FIELD(COLUMN_NAME, 'name', 'department_name')
       LIMIT 1`
    );

    const departmentNameColumn = departmentColumns.length
      ? (departmentColumns[0].COLUMN_NAME === 'department_name' ? 'd.department_name' : 'd.name')
      : "'N/A'";

    const [courseCreditColumns] = await pool.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'courses'
         AND COLUMN_NAME IN ('credits', 'credit_hours')
       ORDER BY FIELD(COLUMN_NAME, 'credits', 'credit_hours')
       LIMIT 1`
    );
    const creditsExpression = courseCreditColumns.length
      ? `COALESCE(c.${courseCreditColumns[0].COLUMN_NAME}, 0)`
      : '0';

    const [rows] = await pool.query(
      `SELECT
        c.id,
        c.code AS course_code,
        c.name AS course_name,
        c.year_level,
        c.semester,
        ${creditsExpression} AS credits,
        c.department_id,
        ${departmentNameColumn} AS department_name,
        'Active' AS status
      FROM courses c
      LEFT JOIN departments d ON c.department_id = d.id
      WHERE c.department_id = ?
      ORDER BY c.code ASC`,
      [departmentId]
    );

    return sendResponse(res, 200, 'Department courses fetched successfully.', 'የዲፓርትማንት ኮርሶች በትክክል ተመልሰዋል።', { courses: rows });
  } catch (error) {
    console.error('Error fetching department courses:', error.message);
    return sendResponse(res, 500, 'Failed to fetch department courses.', 'የዲፓርትማንት ኮርሶችን ማግኘት አልተቻለም።', { error: error.message });
  }
});

app.get(['/api/dept-head/tracking/students', '/api/tracking/students', '/api/tracking/student-evaluations'], authenticate, authorizeRoles('dept_head'), async (req, res) => {
  try {
    const departmentId = Number(req.user.department_id ?? req.user.department ?? req.query.department_id);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return sendResponse(res, 403, 'Your department is not defined. Contact an administrator.', 'የክፍልዎ መለያ አልተገኘም። እባክዎ ከአስተዳደሩ ጋር ይገናኙ።');
    }

    const normalizeValue = (value) => (value || '').toString().trim();
    const normalizeFilter = (value, allValues) => {
      const normalized = normalizeValue(value);
      return !normalized || allValues.includes(normalized.toLowerCase()) ? null : normalized;
    };
    const programType = normalizeFilter(req.query.program_type || req.query.programType || req.query.program, ['all', 'all programs']);
    const yearLevel = normalizeFilter(req.query.year_level || req.query.yearLevel || req.query.year, ['all', 'all years']);
    const section = normalizeFilter(req.query.section, ['all', 'all sections']);
    const requestedTargetId = Number(req.query.instructor_id || req.query.instructorId || req.query.evaluatee_id || req.query.evaluateeId || 0) || null;
    const targetRole = String(req.query.target_role || req.query.role || 'instructor').trim().toLowerCase() === 'lab_assistant'
      ? 'lab_assistant'
      : 'instructor';
    if (!requestedTargetId) {
      return sendResponse(res, 400, 'instructor_id is required.', 'የአስተማሪ መለያ ያስፈልጋል።', []);
    }
    const targetTable = targetRole === 'lab_assistant' ? 'lab_assistants' : 'instructors';
    const [[target]] = await pool.query(
      `SELECT id FROM ${targetTable} WHERE user_id = ? OR id = ? ORDER BY (user_id = ?) DESC LIMIT 1`,
      [requestedTargetId, requestedTargetId, requestedTargetId]
    );
    const targetId = Number(target?.id || 0);
    if (!targetId) {
      return sendResponse(res, 404, 'Selected instructor was not found.', 'የተመረጠው አስተማሪ አልተገኘም።', []);
    }
    const romanToNumber = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7' };
    const yearToken = yearLevel
      ?.replace(/\b(st|nd|rd|th)\s+year\b/gi, '')
      .replace(/\byear\b/gi, '')
      .trim()
      .toLowerCase() || null;
    const numericYear = yearToken && (romanToNumber[yearToken] || yearToken.match(/\d+/)?.[0]);
    const romanYear = numericYear
      ? Object.entries(romanToNumber).find(([, value]) => value === numericYear)?.[0] || numericYear
      : yearToken;
    const normalizedSection = section?.replace(/^section\s*/i, '').trim() || null;
    const semester = normalizeValue(req.query.semester);
    const academicYear = String(req.query.academic_year || '').trim();
    const filterConditions = [
      'ca.department_id = ?',
      `${targetRole === 'lab_assistant' ? 'ca.lab_assistant_id' : 'ca.instructor_id'} = ?`,
      'ca.is_student_published = 1',
      "LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'",
      'ed.student_id IS NOT NULL',
    ];
    const filterParams = [departmentId, targetId];
    if (academicYear) {
      filterConditions.splice(2, 0, 'ca.academic_year = ?');
      filterParams.push(academicYear);
    }
    if (programType) {
      filterConditions.push('LOWER(TRIM(ca.program_type)) = LOWER(TRIM(?))');
      filterParams.push(programType);
    }
    if (yearToken) {
      filterConditions.push('LOWER(TRIM(ca.year_level)) LIKE CONCAT(\'%\', ?, \'%\')');
      filterParams.push(numericYear || yearToken);
    }
    if (semester) {
      filterConditions.push('LOWER(TRIM(ca.semester)) = LOWER(TRIM(?))');
      filterParams.push(req.query.semester.trim());
    }
    if (normalizedSection) {
      filterConditions.push("LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(?))");
      filterParams.push(normalizedSection.toLowerCase());
    }
    const query = `SELECT
      s.id AS student_db_id,
      s.id AS student_id,
      u.id AS evaluator_id,
      s.student_id AS student_code,
      ca.id AS assignment_id,
      ca.course_id,
      c.code AS course_code,
      c.name AS course_name,
      ca.year_level,
      ca.section,
      ca.program_type,
      TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS student_name,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM student_evaluation_submissions ses
          WHERE ses.student_id = s.id
            AND ses.dispatch_id = ed.id
            AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
        ) THEN 'Completed'
        ELSE 'Pending'
      END AS status
    FROM course_assignments ca
    INNER JOIN students s ON s.id = ca.student_id
    INNER JOIN users u ON u.id = s.user_id
    LEFT JOIN courses c ON c.id = ca.course_id
    LEFT JOIN evaluation_dispatches ed
      ON ed.assignment_id = ca.id
     AND ed.student_id = s.id
     AND ed.department_id = ca.department_id
     AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
    WHERE ${filterConditions.join('\n      AND ')}
    GROUP BY s.id, u.id, s.student_id, ca.id, ca.course_id, c.code, c.name, s.first_name, s.last_name, ca.year_level, ca.section, ca.program_type
    ORDER BY status DESC, student_name ASC`;
    const params = filterParams;

    console.log('[DEBUG] Executing Tracking Query:', query);
    console.log('[DEBUG] Query Parameters:', params);

    let rows = [];
    try {
      [rows] = await pool.query(query, params);
      console.log('[DEBUG] Tracking Query Result Count:', rows.length);
    } catch (queryError) {
      console.error('Dept Head Student Tracking DB Error:', queryError);
      return res.status(500).json({
        success: false,
        message: 'Database query failed',
        error: queryError?.message || 'Unknown database error',
      });
    }

    const normalized = rows.map((row) => ({
      student_db_id: row.student_db_id,
      evaluator_id: row.evaluator_id,
      student_id: row.student_id,
      year_level: row.year_level || 'Unknown Year',
      section: row.section || 'Unknown Section',
      program_type: row.program_type || '',
      student_name: row.student_name || 'Unknown',
      status: String(row.Status || row.status || 'Pending'),
    }));

    return sendResponse(res, 200, 'Student tracking retrieved.', 'የተማሪ ተከታታይ መረጃ ተመለሰ።', normalized);
  } catch (error) {
    console.error('Dept-head student tracking error:', error);
    return sendResponse(res, 500, 'Unable to retrieve student tracking.', 'የተማሪ ተከታታይን ማግኘት አልቻለም።', []);
  }
});

app.post('/api/evaluations/send-reminder', authenticate, authorizeRoles('dept_head'), async (req, res) => {
  try {
    const departmentId = Number(req.user.department_id ?? req.user.department ?? req.body.department_id);
    if (!Number.isInteger(departmentId) || departmentId <= 0) return res.status(403).json({ message: 'Your department is not defined.' });

    const { evaluator_id, target_id, evaluation_type, send_to_all_pending, target_name, instructor_name } = req.body || {};
    const targetId = evaluator_id ?? target_id;
    const recipients = new Map();
    const addRecipients = (rows, type) => rows.forEach((row) => {
      if (row.evaluator_id) recipients.set(`${type}:${row.evaluator_id}`, { ...row, evaluation_type: type, instructor_name: row.instructor_name || instructor_name || target_name });
    });

    if (send_to_all_pending) {
      const [students] = await pool.query(`SELECT DISTINCT u.id AS evaluator_id, u.email, COALESCE(NULLIF(TRIM(CONCAT(s.first_name, ' ', s.last_name)), ''), u.email) AS name,
        COALESCE(NULLIF(TRIM(CONCAT(i.first_name, ' ', i.last_name)), ''), NULLIF(TRIM(CONCAT(la.first_name, ' ', la.last_name)), ''), 'the assigned instructor') AS instructor_name
        FROM students s JOIN users u ON u.id = s.user_id JOIN evaluation_dispatches ed ON ed.student_id = s.id
        LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
        LEFT JOIN instructors i ON i.id = ca.instructor_id
        LEFT JOIN lab_assistants la ON la.id = ca.lab_assistant_id
        LEFT JOIN student_evaluation_submissions sub ON sub.dispatch_id = ed.id
        WHERE s.department_id = ? AND LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active', 'published') AND sub.id IS NULL`, [departmentId]);
      const [peers] = await pool.query(`SELECT DISTINCT u.id AS evaluator_id, u.email, COALESCE(NULLIF(TRIM(CONCAT(i.first_name, ' ', i.last_name)), ''), NULLIF(TRIM(CONCAT(la.first_name, ' ', la.last_name)), ''), u.email) AS name,
        COALESCE(NULLIF(TRIM(CONCAT(target.first_name, ' ', target.last_name)), ''), NULLIF(TRIM(CONCAT(lab_target.first_name, ' ', lab_target.last_name)), ''), 'the assigned instructor') AS instructor_name
        FROM peer_evaluations pe
        JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
        JOIN users u ON u.id = evaluator.user_id
        LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
        LEFT JOIN instructors target ON target.id = pe.evaluatee_id
        LEFT JOIN lab_assistants lab_target ON lab_target.id = ed.target_user_id AND LOWER(COALESCE(ed.target_type, '')) = 'lab_assistant'
        LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
        LEFT JOIN instructors i ON i.user_id = u.id
        LEFT JOIN lab_assistants la ON la.user_id = u.id
        WHERE COALESCE(target.department_id, lab_target.department_id) = ?
          AND LOWER(COALESCE(pe.status, 'pending')) IN ('pending', 'active') AND pes.id IS NULL`, [departmentId]);
      addRecipients(students, 'student');
      addRecipients(peers, 'peer');
    } else if (targetId !== undefined && targetId !== null && String(targetId).trim() !== '') {
      const userId = Number(targetId);
      if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ success: false, message: 'A valid target_id is required.' });
      const [rows] = await pool.query(`SELECT u.id AS evaluator_id, u.email,
        COALESCE(NULLIF(TRIM(CONCAT(i.first_name, ' ', i.last_name)), ''), NULLIF(TRIM(CONCAT(s.first_name, ' ', s.last_name)), ''), u.email, s.student_id) AS name
        FROM users u
        LEFT JOIN instructors i ON i.user_id = u.id
        LEFT JOIN students s ON s.user_id = u.id
        WHERE u.id = ? LIMIT 1`, [userId]);
      if (!rows.length) return res.status(400).json({ success: false, message: 'The specified target_id was not found.' });
      addRecipients(rows, evaluation_type || 'evaluation');
    } else {
      return res.status(400).json({ success: false, message: 'target_id or send_to_all_pending is required.' });
    }

    const reminderUserIds = send_to_all_pending ? null : [Number(targetId)];
    const urgentStudentRecipients = await getStudentReminderRecipients({
      departmentId,
      userIds: reminderUserIds,
    });
    let telegramSent = 0;
    let telegramFailed = 0;
    for (const recipient of urgentStudentRecipients) {
      const delivered = await sendTelegramReminder(
        recipient.telegram_chat_id,
        recipient.name,
        recipient.pending_count,
        recipient.pending_courses
      );
      if (delivered) telegramSent += 1;
      else telegramFailed += 1;
    }

    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const recipient of recipients.values()) {
      const isStudentReminder = recipient.evaluation_type === 'student';
      const recipientMessage = isStudentReminder
        ? `URGENT WARNING: You have pending instructor evaluations for ${recipient.instructor_name || 'your assigned instructor'}. You will NOT be permitted to sit for final exams or view results until all instructor evaluations are completed. Please submit now!`
        : `REMINDER: Please complete the Peer Evaluation for ${recipient.instructor_name || 'the assigned instructor'} before the upcoming deadline.`;
      const description = `Dear ${recipient.name || 'Evaluator'}, ${recipientMessage}`;
      try {
        await pool.query('INSERT INTO audit_logs (action_title, description, performed_by) VALUES (?, ?, ?)', ['Evaluation reminder sent', description, req.user.id]);
      } catch (auditError) {
        console.warn('Evaluation reminder audit log failed:', auditError?.message || auditError);
      }
    }
    if (!recipients.size) {
      return res.status(400).json({ success: false, message: 'No pending evaluators were found for the reminder.' });
    }
    const recipientsByType = [...recipients.values()].reduce((groups, recipient) => {
      const type = recipient.evaluation_type || 'peer';
      groups[type] = groups[type] || [];
      groups[type].push(recipient);
      return groups;
    }, {});
    for (const [type, typedRecipients] of Object.entries(recipientsByType)) {
      await createNotifications({
        userIds: typedRecipients.map((recipient) => recipient.evaluator_id),
        title: 'Pending Evaluation Reminder / የግምገማ ማሳሰቢያ',
        message: type === 'student'
          ? 'URGENT WARNING: You have pending instructor evaluations. You will NOT be permitted to sit for final exams or view results until all instructor evaluations are completed. Please submit now!'
          : 'REMINDER: Please complete the Peer Evaluation before the upcoming deadline.',
        type: 'evaluation_reminder',
      });
    }
    try {
      const emailTransport = createEmailTransporter();
      await verifyEmailTransporter(emailTransport.transporter);
      for (const recipient of recipients.values()) {
        if (!recipient.email) continue;
        const recipientMessage = recipient.evaluation_type === 'student'
          ? `URGENT WARNING: You have pending instructor evaluations for ${recipient.instructor_name || 'your assigned instructor'}. You will NOT be permitted to sit for final exams or view results until all instructor evaluations are completed. Please submit now!`
          : `REMINDER: Please complete the Peer Evaluation for ${recipient.instructor_name || 'the assigned instructor'} before the upcoming deadline.`;
        await emailTransport.transporter.sendMail({ from: emailTransport.config.from, to: recipient.email, subject: 'IPES Evaluation Reminder', text: recipientMessage });
      }
      emailTransport.transporter.close();
    } catch (emailError) {
      console.error('Evaluation reminder email delivery failed:', { code: emailError?.code, message: emailError?.message });
    }
    return res.json({
      success: true,
      sent: recipients.size,
      telegramSent,
      telegramFailed,
      telegramSkipped: recipients.size - urgentStudentRecipients.length,
      message: `Reminders sent to ${recipients.size} pending evaluators. Telegram urgent reminders sent to ${telegramSent} students.`,
    });
  } catch (error) {
    console.error('Send evaluation reminder failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to send evaluation reminders.', error: error.message });
  }
});

app.put('/api/notifications/read', mwAuthenticateToken, markAllRead);
app.put('/api/notifications/:notificationId/read', mwAuthenticateToken, markNotificationRead);
app.delete('/api/notifications/:notificationId', mwAuthenticateToken, deleteNotification);
app.put('/api/notifications/mark-all-read/:userId', mwAuthenticateToken, markAllRead);
app.delete('/api/notifications/clear-all/:userId', mwAuthenticateToken, clearAllNotifications);
app.post('/api/notifications/send-telegram-reminders', mwAuthenticateToken, mwAuthorizeRoles('dept_head'), sendTelegramReminders);
app.post('/api/notifications/send-reminders', mwAuthenticateToken, mwAuthorizeRoles('dept_head'), (req, res) => {
  req.body = { ...(req.body || {}), send_to_all_pending: true };
  return sendDeptHeadEvaluationReminder(req, res);
});
app.post('/api/notifications/send', mwAuthenticateToken, mwAuthorizeRoles('admin', 'systemadmin'), sendNotification);

app.get(['/api/dept-head/tracking/peers', '/api/tracking/peers'], authenticate, authorizeRoles('dept_head'), async (req, res) => {
  try {
    const departmentId = Number(req.user.department_id ?? req.user.department ?? req.query.department_id);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return sendResponse(res, 403, 'Your department is not defined. Contact an administrator.', 'የክፍልዎ መለያ አልተገኘም። እባክዎ ከአስተዳደሩ ጋር ይገናኙ።');
    }

    const targetEvaluateeId = Number(req.query.target_instructor_id || req.query.target_evaluatee_id || req.query.evaluatee_id || req.query.instructor_id || 0);
    const requestedRole = String(req.query.target_role || req.query.role || 'instructor').trim().toLowerCase();
    const targetRole = ['instructor', 'lab_assistant'].includes(requestedRole) ? requestedRole : 'instructor';

    if (!targetEvaluateeId) return sendResponse(res, 400, 'evaluatee_id is required.', 'የታለመ ዒላማ መለያ ያስፈልጋል።', []);

    const query = targetRole === 'lab_assistant'
      ? `SELECT
          pe.id AS peer_id,
          pe.evaluator_id,
          la.employee_id AS staff_id,
          TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))) AS peer_instructor,
          CASE WHEN MAX(pes.id) IS NOT NULL THEN 'Submitted' ELSE 'Pending' END AS status
        FROM peer_evaluations pe
        JOIN lab_assistants target ON pe.evaluatee_id = target.id
        JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
        JOIN users u ON evaluator.user_id = u.id
        JOIN lab_assistants la ON la.user_id = u.id
        LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
        WHERE target.department_id = ?
          AND (target.id = ? OR target.user_id = ?)
          AND u.role = 'lab_assistant'
        GROUP BY pe.id, pe.evaluator_id, la.first_name, la.last_name, la.employee_id
        ORDER BY status DESC, peer_instructor ASC`
      : `SELECT
          pe.id AS peer_id,
          pe.evaluator_id,
          i.employee_id AS staff_id,
          TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, u.email))) AS peer_instructor,
          CASE WHEN MAX(pes.id) IS NOT NULL THEN 'Submitted' ELSE 'Pending' END AS status
        FROM peer_evaluations pe
        JOIN instructors target ON pe.evaluatee_id = target.id
        JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
        JOIN users u ON evaluator.user_id = u.id
        JOIN instructors i ON i.id = evaluator.id
        LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
        WHERE target.department_id = ?
          AND (target.id = ? OR target.user_id = ?)
          AND u.role = 'instructor'
        GROUP BY pe.id, pe.evaluator_id, i.first_name, i.last_name, i.employee_id, u.email
        ORDER BY status DESC, peer_instructor ASC`;
    const params = [departmentId, targetEvaluateeId, targetEvaluateeId];

    let rows = [];
    try {
      [rows] = await pool.query(query, params);
    } catch (err) {
      console.error('Peer Tracking DB Error:', err);
      return res.status(500).json({
        success: false,
        message: 'Database query failed',
        error: err.message,
      });
    }

    const normalized = rows.map((row) => ({
      peer_id: row.peer_id,
      evaluator_id: row.evaluator_id,
      staff_id: row.staff_id || '',
      peer_instructor: (row.peer_instructor || '').trim() || 'Unknown Peer',
      status: String(row.status || 'Pending'),
    }));

    return sendResponse(res, 200, 'Peer tracking retrieved.', 'የእርስ ላይ ግምገማ ተከታታይ ተመለሰ።', normalized);
  } catch (error) {
    console.error('Dept-head peer tracking error:', error);
    return sendResponse(res, 500, 'Unable to retrieve peer tracking.', 'የእርስ ላይ ግምገማ ተከታታይን ማግኘት አልቻለም።', []);
  }
});

app.get('/api/evaluations/peer-publish-status', authenticate, authorizeRoles('dept_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'admin'), async (req, res) => {
  try {
    const departmentId = Number(req.query.department_id || req.user?.department_id || req.user?.department || 0);
    const academicYear = String(req.query.academic_year || new Date().getFullYear());
    const semester = String(req.query.semester || 'Semester I');
    if (!departmentId || !await canManagePublishedDepartment(req, departmentId)) return res.status(403).json({ message: 'You cannot view this peer publication status.' });
    const [[publication]] = await pool.query(
      `SELECT p.status, p.started_at,
        (SELECT COUNT(DISTINCT pe.id) FROM peer_evaluations pe INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id WHERE ed.department_id = p.department_id AND ed.academic_year = p.academic_year AND ed.semester = p.semester) AS total_assignments,
        (SELECT COUNT(DISTINCT pe.id) FROM peer_evaluations pe INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id INNER JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id WHERE ed.department_id = p.department_id AND ed.academic_year = p.academic_year AND ed.semester = p.semester AND LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved')) AS completed_assignments
       FROM peer_evaluation_publications p
       WHERE p.department_id = ? AND p.academic_year = ? AND p.semester = ? LIMIT 1`,
      [departmentId, academicYear, semester]
    );
    const [[legacySubmission]] = await pool.query(
      `SELECT COUNT(*) AS submission_count
       FROM peer_evaluation_submissions pes
       INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
       INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
       WHERE ed.department_id = ? AND ed.academic_year = ? AND ed.semester = ?`,
      [departmentId, academicYear, semester]
    );
    const submissionCount = Number(legacySubmission?.submission_count || 0);
    const totalAssignments = Number(publication?.total_assignments || 0);
    const completedAssignments = Number(publication?.completed_assignments || 0);
    const hasStarted = Boolean(publication?.started_at || completedAssignments || submissionCount);
    const fullyCompleted = totalAssignments > 0 && completedAssignments === totalAssignments;
    const isPublished = Boolean(publication?.status === 'published' && totalAssignments > 0);
    return res.json({ isPublished, hasStarted, fullyCompleted, hasSubmissions: submissionCount > 0, status: isPublished ? 'published' : 'unpublished' });
  } catch (error) {
    console.error('Peer publish status query failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to load peer evaluation publish status.' });
  }
});

app.post(['/api/evaluations/peer/publish-department', '/api/evaluations/publish-peer'], authenticate, authorizeRoles('dept_head'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const departmentId = Number(req.body.department_id ?? req.user.department_id ?? req.user.department);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
    }
    if (!await canManagePublishedDepartment(req, departmentId)) return res.status(403).json({ message: 'You cannot publish peer evaluations for this department.' });

    const academicYear = String(req.body.academic_year || new Date().getFullYear());
    const semester = String(req.body.semester || 'Semester I');
    const sessionDeadline = `${academicYear} ${semester}`;
    const peerDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const peerDeadlineSql = peerDeadline.toISOString().slice(0, 19).replace('T', ' ');
    const [departmentStaff] = await connection.query(
      `SELECT i.id AS instructor_id, i.user_id, LOWER(u.role) AS role
       FROM instructors i
       INNER JOIN users u ON u.id = i.user_id
       WHERE i.department_id = ?
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
         AND LOWER(u.role) IN ('instructor', 'dept_head', 'department_head', 'college_dean', 'academic_directorate', 'academic_director', 'directorate')
       UNION ALL
       SELECT la.id AS instructor_id, la.user_id, LOWER(u.role) AS role
       FROM lab_assistants la
       INNER JOIN users u ON u.id = la.user_id
       WHERE la.department_id = ?
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
         AND LOWER(u.role) = 'lab_assistant'
       ORDER BY instructor_id ASC`,
      [departmentId, departmentId]
    );
    const instructors = departmentStaff.filter((staff) => ['instructor', 'lab_assistant'].includes(staff.role));
    const departmentHead = departmentStaff.find((staff) => ['dept_head', 'department_head'].includes(staff.role));
    const collegeDean = departmentStaff.find((staff) => staff.role === 'college_dean');
    const directorateParticipants = departmentStaff
      .filter((staff) => ['academic_directorate', 'academic_director', 'directorate'].includes(staff.role))
      .map((staff) => ({ ...staff, role: 'academic_directorate' }));
    if (!instructors.length) return res.status(400).json({ message: 'At least one active instructor is required.' });

    await connection.beginTransaction();
    const [[publication]] = await connection.query(
      'SELECT status, started_at FROM peer_evaluation_publications WHERE department_id = ? AND academic_year = ? AND semester = ? FOR UPDATE',
      [departmentId, academicYear, semester]
    );
    if (publication?.started_at) {
      await connection.rollback();
      return res.status(400).json({ success: false, hasStarted: true, message: 'Peer evaluations cannot be republished after evaluation has started.' });
    }
    await connection.query(
      `INSERT INTO peer_evaluation_publications (department_id, academic_year, semester, status, created_by)
       VALUES (?, ?, ?, 'published', ?)
       ON DUPLICATE KEY UPDATE status = 'published', created_by = VALUES(created_by), updated_at = CURRENT_TIMESTAMP`,
      [departmentId, academicYear, semester, req.user.id]
    );
    await connection.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('peer_evaluation_published', 'true')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`
    );
     await connection.query("UPDATE system_settings SET setting_value = 'published', updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'peer_evaluation_status'");
    const [dispatchRows] = await connection.query(
      `SELECT id FROM evaluation_dispatches
       WHERE department_id = ? AND evaluation_type = 'peer'
         AND academic_year = ? AND semester = ?
       ORDER BY id DESC LIMIT 1`,
      [departmentId, academicYear, semester]
    );
    let peerDispatchId;
    if (dispatchRows.length) {
      peerDispatchId = dispatchRows[0].id;
      await connection.query(
        `UPDATE evaluation_dispatches
         SET status = 'active', year_level = 'ALL', student_group = 'ALL', deadline = ?, created_by = ?
         WHERE id = ?`,
        [peerDeadlineSql, req.user.id, dispatchRows[0].id]
      );
    } else {
      const [dispatchResult] = await connection.query(
        `INSERT INTO evaluation_dispatches
          (department_id, academic_year, semester, year_level, student_group, evaluation_type, deadline, created_by, status, payload)
         VALUES (?, ?, ?, 'ALL', 'ALL', 'peer', ?, ?, 'active', ?)` ,
        [departmentId, academicYear, semester, peerDeadlineSql, req.user.id, JSON.stringify({ source: 'peer_publish' })]
      );
      peerDispatchId = dispatchResult.insertId;
    }
    const instructorParticipants = instructors.map((participant) => ({ ...participant, role: 'instructor' }));
    const departmentHeadParticipant = { ...departmentHead, role: 'dept_head' };
    const collegeDeanParticipant = { ...collegeDean, role: 'college_dean' };
    const leadershipTargets = [departmentHeadParticipant, collegeDeanParticipant, ...directorateParticipants]
      .filter((participant) => participant?.instructor_id);
    const assignments = [];
    for (const evaluator of instructorParticipants) {
      for (const target of instructorParticipants) {
        if (evaluator.instructor_id !== target.instructor_id) assignments.push([evaluator, target]);
      }
      for (const target of leadershipTargets) {
        if (evaluator.instructor_id !== target.instructor_id) assignments.push([evaluator, target]);
      }
    }
    if (departmentHead) {
      for (const instructor of instructorParticipants) assignments.push([departmentHeadParticipant, instructor]);
    }
    if (collegeDean) {
      for (const instructor of instructorParticipants) assignments.push([collegeDeanParticipant, instructor]);
      if (departmentHead) assignments.push([collegeDeanParticipant, departmentHeadParticipant]);
    }
    for (const directorate of directorateParticipants) {
      for (const instructor of instructorParticipants) assignments.push([directorate, instructor]);
      if (collegeDean) assignments.push([directorate, collegeDeanParticipant]);
    }

    let createdCount = 0;
    for (const [evaluator, target] of assignments) {
      if (!evaluator?.instructor_id || !target?.instructor_id) continue;
        const [existing] = await connection.query(
          `SELECT pe.id
           FROM peer_evaluations pe
           INNER JOIN instructors target_instructor ON target_instructor.id = pe.evaluatee_id
           WHERE pe.evaluator_id = ? AND pe.evaluatee_id = ? AND pe.course_id IS NULL
             AND target_instructor.department_id = ?
           LIMIT 1`,
          [evaluator.instructor_id, target.instructor_id, departmentId]
        );
        if (existing.length) {
          await connection.query('UPDATE peer_evaluations SET status = \'pending\', deadline = ?, dispatch_id = ? WHERE id = ?', [peerDeadlineSql, peerDispatchId, existing[0].id]);
        } else {
          await connection.query(
            'INSERT INTO peer_evaluations (evaluator_id, evaluatee_id, course_id, dispatch_id, deadline, status) VALUES (?, ?, NULL, ?, ?, \'pending\')',
            [evaluator.instructor_id, target.instructor_id, peerDispatchId, peerDeadlineSql]
          );
          createdCount += 1;
        }
    }
    await connection.query(
      `UPDATE course_assignments
       SET is_peer_published = 1,
           is_published = 1,
           publish_target = CASE WHEN is_student_published = 1 THEN 'both' ELSE 'instructor' END
       WHERE department_id = ?`,
      [departmentId]
    );
    await connection.commit();
    emitEvaluationUpdate({ type: 'peer-publication', departmentId, academicYear, semester });
    try {
      await createNotifications({
        userIds: [...new Set(assignments.map(([evaluator]) => evaluator.user_id).filter(Boolean))],
        title: 'Peer Evaluation Published',
        message: `New peer evaluations are available for the ${academicYear} ${semester} session. Please complete your assigned evaluations.`,
        type: 'peer_evaluation',
      });
    } catch (notificationError) {
      console.error('Peer evaluation publication notification failed:', notificationError);
    }
    return res.status(201).json({ success: true, staffCount: instructors.length, participantCount: new Set(assignments.flatMap(([evaluator, target]) => [evaluator.user_id, target.user_id])).size, createdCount, message: `Peer evaluations published for ${instructors.length} instructors and the department leadership hierarchy.` });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Peer publish rollback failed:', rollbackError); }
    console.error('Department peer publishing failed:', error);
    return res.status(500).json({ message: 'Unable to publish department peer evaluations.', error: error.message });
  } finally {
    connection.release();
  }
});

app.post(['/api/evaluations/peer/unpublish-department', '/api/evaluations/unpublish-peer'], authenticate, authorizeRoles('dept_head'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const departmentId = Number(req.body.department_id ?? req.user.department_id ?? req.user.department);
    const academicYear = String(req.body.academic_year || new Date().getFullYear());
    const semester = String(req.body.semester || 'Semester I');
    if (!Number.isInteger(departmentId) || departmentId <= 0) return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
    if (!await canManagePublishedDepartment(req, departmentId)) return res.status(403).json({ message: 'You cannot unpublish peer evaluations for this department.' });

    const [[peerProgress]] = await connection.query(
      `SELECT COUNT(DISTINCT pe.id) AS total_assignments,
              COUNT(DISTINCT pes.id) AS submission_count,
              COUNT(DISTINCT CASE WHEN pes.id IS NOT NULL AND LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved') THEN pe.id END) AS completed_assignments
       FROM peer_evaluations pe
       INNER JOIN instructors target ON target.id = pe.evaluatee_id
       INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
       LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
       WHERE target.department_id = ? AND pe.course_id IS NULL
         AND ed.department_id = ? AND ed.evaluation_type = 'peer'
         AND ed.academic_year = ? AND ed.semester = ?`,
      [departmentId, departmentId, academicYear, semester]
    );
    const peerHasSubmissions = Number(peerProgress?.submission_count || 0) > 0;
    if (peerHasSubmissions) {
      return res.status(409).json({ success: false, hasSubmissions: true, message: 'Cannot unpublish because peer evaluation submissions already exist.' });
    }
    const peerHasStarted = Number(peerProgress?.completed_assignments || 0) > 0;
    const peerFullyCompleted = Number(peerProgress?.total_assignments || 0) > 0
      && Number(peerProgress.completed_assignments) === Number(peerProgress.total_assignments);
    if (peerHasStarted && !peerFullyCompleted) {
      return res.status(400).json({ success: false, hasStarted: true, fullyCompleted: false, message: 'Cannot unpublish because peer evaluations are in progress. Wait until all peer evaluations are completed.' });
    }

    await connection.beginTransaction();
    await connection.query(
      `UPDATE peer_evaluation_publications
       SET status = 'unpublished'
      WHERE department_id = ? AND academic_year = ? AND semester = ?`,
      [departmentId, academicYear, semester]
    );
    await connection.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('peer_evaluation_published', 'false')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`
    );
     await connection.query("UPDATE system_settings SET setting_value = 'unpublished', updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'peer_evaluation_status'");
    await connection.query(
      `UPDATE evaluation_dispatches
       SET status = 'closed'
       WHERE department_id = ? AND evaluation_type = 'peer'
         AND academic_year = ? AND semester = ?`,
      [departmentId, academicYear, semester]
    );
    await connection.query(
      `DELETE pe FROM peer_evaluations pe
       INNER JOIN instructors target ON target.id = pe.evaluatee_id
       WHERE target.department_id = ? AND pe.course_id IS NULL
         AND pe.dispatch_id IN (
           SELECT id FROM evaluation_dispatches
           WHERE department_id = ? AND evaluation_type = 'peer'
             AND academic_year = ? AND semester = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM peer_evaluation_submissions pes
           WHERE pes.peer_evaluation_id = pe.id
         )`,
      [departmentId, departmentId, academicYear, semester]
    );
    await connection.query(
      `UPDATE course_assignments
       SET is_peer_published = 0,
           is_published = IF(is_student_published = 1, 1, 0),
           publish_target = IF(is_student_published = 1, 'student', '')
       WHERE department_id = ?`,
      [departmentId]
    );
    await connection.commit();
    return res.json({ success: true, message: 'Peer evaluations unpublished successfully.' });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Peer unpublish rollback failed:', rollbackError); }
    return res.status(500).json({ message: 'Unable to unpublish peer evaluations.', error: error.message });
  } finally { connection.release(); }
});

app.get('/api/dept-head/tracking/dept-head', authenticate, authorizeRoles('dept_head'), async (req, res) => {
  try {
    const departmentId = Number(req.user.department_id ?? req.user.department ?? req.query.department_id);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return sendResponse(res, 403, 'Your department is not defined. Contact an administrator.', 'የክፍልዎ መለያ አልተገኘም። እባክዎ ከአስተዳደሩ ጋር ይገናኙ።');
    }

    const evaluateeId = Number(req.query.evaluatee_id || req.query.instructor_id || req.query.target_id || 0);
    const requestedRole = String(req.query.target_role || req.query.role || 'instructor').trim().toLowerCase();
    const targetRole = ['instructor', 'lab_assistant'].includes(requestedRole) ? requestedRole : 'instructor';

    if (!evaluateeId) return sendResponse(res, 400, 'evaluatee_id is required.', 'የታለመ ዒላማ መለያ ያስፈልጋል።', []);

    const query = targetRole === 'lab_assistant'
      ? `SELECT
          la.id AS instructor_id,
          CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, '')) AS instructor_name,
          COALESCE(dhe.total_score, 0) AS score,
          COALESCE(dhe.status, 'Pending') AS status,
          dhe.updated_at AS submitted_at,
          dhe.id AS evaluation_id
        FROM lab_assistants la
        LEFT JOIN dept_head_evaluations dhe ON dhe.instructor_id = la.id
        WHERE la.department_id = ?
          AND (la.id = ? OR la.user_id = ?)
        GROUP BY la.id, dhe.id
        ORDER BY la.id ASC, dhe.updated_at DESC`
      : `SELECT
          i.id AS instructor_id,
          CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS instructor_name,
          COALESCE(dhe.total_score, 0) AS score,
          COALESCE(dhe.status, 'Pending') AS status,
          dhe.updated_at AS submitted_at,
          dhe.id AS evaluation_id
        FROM instructors i
        LEFT JOIN dept_head_evaluations dhe ON (dhe.instructor_id = i.id OR dhe.instructor_id = i.user_id)
        WHERE i.department_id = ?
          AND (i.id = ? OR i.user_id = ?)
        GROUP BY i.id, dhe.id
        ORDER BY i.id ASC, dhe.updated_at DESC`;

    const [rows] = await pool.query(query, [departmentId, evaluateeId, evaluateeId]);
    const normalized = rows.map((row) => ({
      id: row.evaluation_id ?? row.instructor_id,
      instructor_id: row.instructor_id,
      instructor_name: (row.instructor_name || '').trim() || 'Unknown Instructor',
      score: Number(row.score || 0),
      status: String(row.status || 'Pending'),
      submitted_at: row.submitted_at || null,
    }));

    return sendResponse(res, 200, 'Dept head tracking retrieved.', 'የዲፓርትመንት ኃላፊ ተከታታይ ተመለሰ።', normalized);
  } catch (error) {
    console.error('Dept-head dept-head tracking error:', error);
    return sendResponse(res, 500, 'Unable to retrieve dept head tracking.', 'የዲፓርትመንት ኃላፊ ተከታታይን ማግኘት አልቻለም።', []);
  }
});

// Fetch instructors for department head evaluation view
app.get(['/api/dept-head/instructors', '/api/dept-head/instructors-to-evaluate'], authenticate, authorizeRoles('dept_head'), async (req, res) => {
  try {
    const departmentValue = req.query.department ?? req.query.department_id ?? req.user.department_id ?? req.user.department;
    const departmentId = await resolveDepartmentId(departmentValue);
    if (!departmentId) {
      return sendResponse(res, 403, 'Your department is not defined. Contact an administrator.', 'የክፍልዎ መለያ አልተገኘም።');
    }

    const evaluatorId = Number(req.user.id || req.user.user_id || 0);

    const query = `
      SELECT
        i.id AS evaluatee_id,
        i.user_id,
        i.employee_id,
        i.department_id,
        CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS evaluatee_name,
        COALESCE(u.email, '') AS username,
        'instructor' AS target_role,
        COALESCE(DATE_FORMAT(dhe.deadline, '%Y-%m-%d'), DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%Y-%m-%d')) AS deadline,
        CASE WHEN dhe.id IS NOT NULL AND LOWER(dhe.status) IN ('submitted', 'completed', 'approved') THEN 'Submitted' ELSE 'Pending' END AS evaluation_status,
        dhe.id AS evaluation_id,
        dhe.criteria_scores,
        dhe.strengths,
        dhe.weaknesses,
        dhe.total_score,
        dhe.evaluatee_id AS resolved_evaluatee_id
      FROM instructors i
      JOIN users u ON i.user_id = u.id
      LEFT JOIN dept_head_evaluations dhe ON dhe.evaluatee_id = i.id AND dhe.target_role = 'instructor' AND dhe.evaluator_id = ?
      WHERE i.department_id = ?
        AND i.user_id <> ?
        AND LOWER(COALESCE(u.status, 'active')) = 'active'

      UNION ALL

      SELECT
        la.id AS evaluatee_id,
        la.user_id,
        la.employee_id,
        la.department_id,
        CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, '')) AS evaluatee_name,
        COALESCE(la.email, u.email, '') AS username,
        'lab_assistant' AS target_role,
        COALESCE(DATE_FORMAT(dhe.deadline, '%Y-%m-%d'), DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%Y-%m-%d')) AS deadline,
        CASE WHEN dhe.id IS NOT NULL AND LOWER(dhe.status) IN ('submitted', 'completed', 'approved') THEN 'Submitted' ELSE 'Pending' END AS evaluation_status,
        dhe.id AS evaluation_id,
        dhe.criteria_scores,
        dhe.strengths,
        dhe.weaknesses,
        dhe.total_score,
        dhe.evaluatee_id AS resolved_evaluatee_id
      FROM lab_assistants la
      JOIN users u ON la.user_id = u.id
      LEFT JOIN dept_head_evaluations dhe ON dhe.evaluatee_id = la.id AND dhe.target_role = 'lab_assistant' AND dhe.evaluator_id = ?
      WHERE la.department_id = ?
        AND la.user_id <> ?
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
      ORDER BY evaluatee_name ASC`;

    const [rows] = await pool.query(query, [evaluatorId, departmentId, evaluatorId, evaluatorId, departmentId, evaluatorId]);

    const formattedData = rows.map((row) => ({
      id: row.evaluatee_id,
      instructor_id: row.evaluatee_id,
      evaluatee_id: row.evaluatee_id,
      target_role: row.target_role || 'instructor',
      instructor_name: (row.evaluatee_name || '').trim() || row.username || 'Unknown staff',
      full_name: (row.evaluatee_name || '').trim() || row.username || 'Unknown staff',
      employee_id: row.employee_id,
      department_id: row.department_id,
      deadline: row.deadline,
      evaluation_status: row.evaluation_status,
      evaluation_id: row.evaluation_id,
      criteria_scores: typeof row.criteria_scores === 'string' ? (() => { try { return JSON.parse(row.criteria_scores); } catch { return {}; } })() : (row.criteria_scores || {}),
      strengths: row.strengths || '',
      weaknesses: row.weaknesses || '',
      total_score: row.total_score ? Number(row.total_score) : null,
    }));

    return sendResponse(res, 200, 'Department staff fetched.', 'የዲፓርትመንት ሰራተኞች ተመልሰዋል።', formattedData);
  } catch (err) {
    console.error('Dept Head Instructors DB Error:', err);
    return res.status(500).json({ success: false, message: 'Database query failed', error: err.message });
  }
});

const getDeptHeadPerformance = async (req, res) => {
  try {
    const userId = Number(req.user?.id || 0);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.json(getDefaultDeptHeadPerformance('Department Head user information is unavailable.'));
    }
    const [instructorRows] = await pool.query(
      'SELECT id, department_id FROM instructors WHERE user_id = ? LIMIT 1',
      [userId]
    );
    if (!instructorRows.length) {
      return res.json(getDefaultDeptHeadPerformance('Department Head profile is not available yet.'));
    }

    const instructorId = instructorRows[0].id;
    const [[activeEvaluationPeriod]] = await pool.query(
      `SELECT academic_year, semester FROM evaluation_periods
       WHERE LOWER(status) = 'active' ORDER BY id DESC LIMIT 1`
    );
    const performance = await getDeptHeadLivePerformanceMetrics({
      instructorId,
      departmentId: instructorRows[0].department_id,
      academicYear: activeEvaluationPeriod?.academic_year || '',
      semester: activeEvaluationPeriod?.semester || '',
    });
    const {
      studentRows,
      deanRows,
      peerRows,
      hasAssignedCourse,
      isTeaching,
      weighted: weightedSummary,
      deptHeadAverage: deanRawScore,
      periodEnded,
      incomingPeerCount,
      completion,
      isComplete,
    } = performance;
    const totalScore = isComplete ? weightedSummary.totalWeightedScore : null;
    const strengths = [];
    const improvements = [];
    const addFeedback = (list, value) => {
      const text = String(value || '').trim();
      if (text && !list.includes(text)) list.push(text);
    };

    const parseCriteriaData = (value) => {
      if (!value) return {};
      if (typeof value === 'object') return value;
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    };

    studentRows.forEach((row) => addFeedback(Number(row.score || 0) >= 70 ? strengths : improvements, row.feedback));
    peerRows.forEach((row) => { addFeedback(strengths, row.strengths); addFeedback(improvements, row.suggestions); });
    deanRows.forEach((row) => {
      addFeedback(strengths, row.strengths);
      addFeedback(improvements, row.weaknesses);
      const deanCriteria = parseCriteriaData(row.criteria_scores);
      const remarkText = deanCriteria?.remarks || deanCriteria?.feedback;
      if (remarkText) {
        addFeedback(deanRawScore >= 70 ? strengths : improvements, remarkText);
      }
    });

    return res.json({
      totalWeightedScore: totalScore === null ? null : Number(totalScore.toFixed(2)),
      totalScore: totalScore === null ? null : Number(totalScore.toFixed(2)),
      isComplete,
      statusBadge: isComplete ? 'Completed' : 'Pending Complete Evaluation',
      completion,
      isStudentEvaluationRequired: hasAssignedCourse,
      isStudentEvaluationExcluded: !hasAssignedCourse,
      raw_student_score: Number(weightedSummary.breakdown.student.rawPercentage.toFixed(2)),
      submission_count: studentRows.length,
      total_assignments: performance.totalAssignments,
      incomingPeerCount,
      periodEnded,
      hasAssignedCourse: Boolean(weightedSummary.hasAssignedCourse),
      hasAssignedCourses: Boolean(weightedSummary.hasAssignedCourse),
      isStudentEvaluationExcluded: !Boolean(weightedSummary.hasAssignedCourse),
      isTeaching,
      warning: weightedSummary.warning,
      breakdown: {
        ...weightedSummary.breakdown,
        student: { ...weightedSummary.breakdown.student, submissionCount: studentRows.length },
      },
      strengths,
      weaknesses: improvements,
    });
  } catch (error) {
    console.error('Department Head performance error:', error);
    return res.json(getDefaultDeptHeadPerformance('Performance data is temporarily unavailable.'));
  }
};

app.get('/api/dept-head/performance', authenticate, authorizeRoles('dept_head'), getDeptHeadPerformance);
app.get('/api/dept-head/my-performance', authenticate, authorizeRoles('dept_head'), getDeptHeadPerformance);

app.get('/api/dept-head/students', authenticate, authorizeRoles('dept_head'), async (req, res) => {
  try {
    const departmentValue = req.query.department ?? req.query.department_id ?? req.user.department_id ?? req.user.departmentId ?? req.user.department;
    const departmentId = await resolveDepartmentId(departmentValue);
    if (!departmentId) {
      return res.status(404).json({ message: 'Department was not found.' });
    }

    const yearLevel = String(req.query.year_level || '').trim();
    const programType = String(req.query.program_type || '').trim();
    const section = normalizeSectionValue(req.query.section);
    const filters = ['u.role = \'student\'', 's.department_id = ?'];
    const params = [departmentId];

    if (yearLevel && yearLevel.toLowerCase() !== 'all') {
      filters.push('LOWER(TRIM(s.year_level)) = LOWER(TRIM(?))');
      params.push(yearLevel);
    }
    if (programType && programType.toLowerCase() !== 'all') {
      filters.push('LOWER(TRIM(s.program_type)) = LOWER(TRIM(?))');
      params.push(programType);
    }
    if (section && section.toLowerCase() !== 'all') {
      filters.push("LOWER(TRIM(REPLACE(REPLACE(s.section, 'Section ', ''), 'section ', ''))) = LOWER(?)");
      params.push(section);
    }

    const [rows] = await pool.query(
      `SELECT
        s.student_id,
        TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS name,
        s.program_type,
        s.year_level,
        s.section,
        d.name AS department,
        s.department_id
      FROM users u
      INNER JOIN students s ON s.user_id = u.id
      INNER JOIN departments d ON d.id = s.department_id
      WHERE ${filters.join(' AND ')}
      ORDER BY name ASC`,
      params
    );

    return res.json(rows);
  } catch (error) {
    console.error('Department head students query failed:', error);
    return res.status(500).json({ message: 'Failed to fetch department students.' });
  }
});

app.get('/api/department-data/:type', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    const { type } = req.params;
    if (!['instructors', 'students', 'courses', 'lab_assistants'].includes(type)) {
      return res.status(400).json({ message: 'Unsupported department data type.' });
    }

    const departmentValue = req.query.department ?? req.query.department_id ?? req.user.department_id ?? req.user.departmentId ?? req.user.department;
    const departmentId = await resolveDepartmentId(departmentValue);
    if (!departmentId) return res.status(404).json({ message: 'Department was not found.' });

    let query;
    if (type === 'instructors') {
      query = `SELECT u.id, TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS name,
        u.email, COALESCE(NULLIF(TRIM(u.role), ''), 'instructor') AS role,
        COALESCE(NULLIF(TRIM(u.status), ''), 'active') AS status,
        i.employee_id, i.department_id
        FROM users u
        INNER JOIN instructors i ON i.user_id = u.id
        WHERE i.department_id = ?
          AND LOWER(COALESCE(u.role, 'instructor')) IN (
            'instructor', 'dept_head', 'department_head', 'head',
            'college_dean', 'dean', 'academic_directorate', 'academic_director',
            'directorate', 'director'
          )
        ORDER BY name ASC`;
    } else if (type === 'students') {
      query = `SELECT u.id, TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS name,
        COALESCE(u.email, s.student_id) AS email, u.role, s.student_id, s.department_id,
        s.program_type, s.year_level, s.semester, s.section
        FROM users u
        INNER JOIN students s ON s.user_id = u.id
        WHERE u.role = 'student' AND s.department_id = ?
        ORDER BY name ASC`;
    } else if (type === 'lab_assistants') {
      query = `SELECT la.id, la.full_name AS name,
        COALESCE(la.email, u.email) AS email,
        COALESCE(NULLIF(TRIM(u.role), ''), 'lab_assistant') AS role,
        COALESCE(NULLIF(TRIM(la.status), ''), 'active') AS status,
        la.employee_id, la.department_id
        FROM lab_assistants la
        INNER JOIN users u ON u.id = la.user_id
        WHERE la.department_id = ?
          AND LOWER(COALESCE(u.role, 'lab_assistant')) = 'lab_assistant'
        ORDER BY la.full_name ASC`;
    } else {
      const [courseCreditColumns] = await pool.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'courses'
           AND COLUMN_NAME IN ('credits', 'credit_hours')
         ORDER BY FIELD(COLUMN_NAME, 'credits', 'credit_hours')
         LIMIT 1`
      );
      const creditsExpression = courseCreditColumns.length
        ? `${courseCreditColumns[0].COLUMN_NAME} AS credits`
        : '0 AS credits';
      query = `SELECT c.id, c.code, c.name, c.year_level, c.semester, ${creditsExpression}, c.department_id,
        d.name AS department_name, 'Active' AS status
        FROM courses c
        INNER JOIN departments d ON c.department_id = d.id
        WHERE c.department_id = ? ORDER BY c.code ASC`;
    }

    const [rows] = await pool.query(query, [departmentId]);
    return res.json(rows);
  } catch (error) {
    console.error('Department data query failed:', error);
    return res.status(500).json({ message: 'Failed to fetch department data.' });
  }
});

// Submit or update a department head evaluation
app.post('/api/dept-head/evaluations', authenticate, authorizeRoles('dept_head'), async (req, res) => {
  try {
    const { evaluator_id, instructor_id, evaluatee_id, target_role, department_id, academic_year, semester, criteria_scores, responses, feedback, total_score } = req.body;
    const evaluatorId = Number(evaluator_id || req.user.id || req.user.user_id || 0);
    const evaluateeId = Number(evaluatee_id || instructor_id || 0);
    const targetRole = String(target_role || (evaluatee_id ? 'instructor' : 'instructor')).trim().toLowerCase();
    const deptId = Number(department_id || req.user.department_id || req.user.department || 0);

    if (!evaluatorId || !evaluateeId || !deptId) {
      return sendResponse(res, 400, 'Missing required fields.', 'የሚያስፈልጉ መረጃዎች አልተሰጡም።');
    }
    if (evaluatorId !== Number(req.user.id || req.user.user_id)) {
      return sendResponse(res, 403, 'You can only submit an evaluation as the authenticated Department Head.', 'እንደ የተረጋገጠው የዲፓርትመንት ኃላፊ ብቻ መገምገም ይችላሉ።');
    }

    const normalizedTargetRole = ['instructor', 'lab_assistant'].includes(targetRole) ? targetRole : 'instructor';
    const targetTable = normalizedTargetRole === 'lab_assistant' ? 'lab_assistants' : 'instructors';
    const [[targetRecord]] = await pool.query(
      `SELECT target.id, target.user_id, target.department_id
       FROM ${targetTable} target
       INNER JOIN users target_user ON target_user.id = target.user_id
      WHERE (target.id = ? OR target.user_id = ?)
         AND target.department_id = ?
         AND target.user_id <> ?
         AND LOWER(COALESCE(target_user.status, 'active')) = 'active'
       LIMIT 1`,
      [evaluateeId, evaluateeId, deptId, evaluatorId]
    );
    if (!targetRecord) {
      return sendResponse(res, 400, 'A Department Head cannot evaluate themselves or a staff member outside their department.', 'የዲፓርትመንት ኃላፊ ራሳቸውን ወይም ከዲፓርትመንታቸው ውጭ ያለ ሰራተኛን መገምገም አይችሉም።');
    }

    const totalScore = Number(total_score || 0);
    const weightedDeptHeadScore = Number((totalScore * 0.30).toFixed(2));
    const criteriaJson = criteria_scores ? JSON.stringify(criteria_scores) : null;
    const responsesJson = responses ? JSON.stringify(responses) : criteriaJson;
    await pool.query(
      `INSERT INTO dept_head_evaluations
       (dept_head_id, evaluator_id, instructor_id, evaluatee_id, target_role, department_id, academic_year, semester, criteria_scores, responses, total_score, feedback, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', NOW())
       ON DUPLICATE KEY UPDATE
         dept_head_id = VALUES(dept_head_id), instructor_id = VALUES(instructor_id), evaluatee_id = VALUES(evaluatee_id),
         target_role = VALUES(target_role), department_id = VALUES(department_id), academic_year = VALUES(academic_year),
         semester = VALUES(semester), criteria_scores = VALUES(criteria_scores), responses = VALUES(responses),
         total_score = VALUES(total_score), feedback = VALUES(feedback), status = VALUES(status), submitted_at = NOW(), updated_at = CURRENT_TIMESTAMP`,
      [evaluatorId, evaluatorId, evaluateeId, evaluateeId, normalizedTargetRole, deptId, academic_year || '2025/2026', semester || 'Semester II', criteriaJson, responsesJson, totalScore, feedback || null]
    );

    if (normalizedTargetRole === 'instructor') {
      await calculateAndSaveInstructorResult(
        evaluateeId,
        academic_year || '2025/2026',
        semester || 'Semester II'
      );
    }

    if (normalizedTargetRole === 'instructor') {
      await pool.query(
        `INSERT INTO evaluation_summaries (instructor_id, department_id, dept_head_raw_percentage, dept_head_weighted_score, total_weighted_score, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE department_id = VALUES(department_id), dept_head_raw_percentage = VALUES(dept_head_raw_percentage), dept_head_weighted_score = VALUES(dept_head_weighted_score), total_weighted_score = VALUES(total_weighted_score), updated_at = CURRENT_TIMESTAMP`,
        [evaluateeId, deptId, totalScore, weightedDeptHeadScore, weightedDeptHeadScore]
      );
    }

    return sendResponse(res, 200, 'Evaluation submitted successfully.', 'ግምገማው በተሳካ ሁኔታ ተሳክቷል።', { success: true, total_score: totalScore, dept_head_weighted_score: weightedDeptHeadScore, target_role: normalizedTargetRole });
  } catch (error) {
    console.error('Submit dept-head evaluation error:', error);
    return sendResponse(res, 500, 'Unable to submit evaluation.', 'ግምገማውን ማስተካከል አልቻለም።', { error: error.message });
  }
});

app.put('/api/dept-head/evaluations/:id', authenticate, authorizeRoles('dept_head'), async (req, res) => {
  try {
    const evaluationId = Number(req.params.id || 0);
    const { criteria_scores = {}, total_score = 0, strengths = '', weaknesses = '' } = req.body;
    const score = Number(total_score);
    if (!evaluationId || !Number.isFinite(score) || score < 0 || score > 30) {
      return res.status(400).json({ success: false, message: 'A valid evaluation ID and score from 0 to 30 are required.' });
    }
    const [result] = await pool.query(
      `UPDATE dept_head_evaluations
       SET criteria_scores = ?, total_score = ?, strengths = ?, weaknesses = ?, status = 'Submitted', updated_at = NOW()
       WHERE id = ? AND evaluator_id = ?`,
      [JSON.stringify(criteria_scores), score, String(strengths).trim(), String(weaknesses).trim(), evaluationId, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Evaluation not found.' });
    return res.json({ success: true, message: 'Evaluation updated successfully.', data: { id: evaluationId, total_score: score, status: 'Submitted' } });
  } catch (error) {
    console.error('Dept head evaluation update error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update evaluation.' });
  }
});

app.post(['/api/dept-head/calculate-publish', '/api/evaluations/publish-instructor-scores'], authenticate, authorizeRoles('dept_head'), async (req, res) => {
  try {
    const { department_id, academic_year, semester } = req.body || {};
    const departmentId = Number(department_id);
    const academicYear = String(academic_year || '').trim();
    const semesterValue = String(semester || '').trim();
    const userDepartmentId = Number(req.user.department_id ?? req.user.department);
    if (!Number.isInteger(departmentId) || departmentId <= 0 || departmentId !== userDepartmentId) {
      return res.status(400).json({ success: false, message: 'A valid department_id for your department is required.' });
    }
    if (!academicYear || !semesterValue) {
      return res.status(400).json({ success: false, message: 'academic_year and semester are required.' });
    }

    const [instructors] = await pool.query(
      'SELECT id FROM instructors WHERE department_id = ? ORDER BY id ASC',
      [departmentId]
    );

    const results = [];
    for (const instructor of instructors) {
      const [courseRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM course_assignments
         WHERE instructor_id = ?
            AND LOWER(COALESCE(status, 'assigned')) NOT IN ('cancelled', 'inactive', 'unassigned')
            AND (academic_year IS NULL OR LOWER(TRIM(academic_year)) = LOWER(?) OR LOWER(TRIM(academic_year)) = LOWER(SUBSTRING_INDEX(?, '/', 1)))
            AND (semester IS NULL OR LOWER(REPLACE(TRIM(semester), 'semester', '')) = LOWER(REPLACE(TRIM(?), 'semester', '')))` ,
          [instructor.id, academicYear, academicYear, semesterValue]
      );
      const hasCourseAssigned = Number(courseRows[0]?.total || 0) > 0;

      const [studentRows] = await pool.query(
        `SELECT CASE WHEN ? = 0 THEN 0 ELSE COALESCE(AVG(ses.score), 0) END AS avg_score
         FROM student_evaluation_submissions ses
         JOIN evaluation_dispatches ed ON ses.dispatch_id = ed.id
         JOIN course_assignments ca ON ca.id = ed.assignment_id
         WHERE ca.instructor_id = ?
           AND (? = '' OR COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), '')) IS NULL
             OR LOWER(COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), ''))) = LOWER(?)
             OR LOWER(COALESCE(NULLIF(TRIM(ed.academic_year), ''), NULLIF(TRIM(ca.academic_year), ''))) = LOWER(SUBSTRING_INDEX(?, '/', 1)))
           AND (? = '' OR COALESCE(NULLIF(TRIM(ed.semester), ''), NULLIF(TRIM(ca.semester), '')) IS NULL
             OR LOWER(REPLACE(COALESCE(NULLIF(TRIM(ed.semester), ''), NULLIF(TRIM(ca.semester), '')), 'semester', '')) = LOWER(REPLACE(?, 'semester', '')))
           AND LOWER(COALESCE(ed.target_type, 'instructor')) = 'instructor'
           AND LOWER(TRIM(COALESCE(ses.status, ''))) IN ('submitted', 'completed', 'approved')`,
        [hasCourseAssigned ? 1 : 0, instructor.id, academicYear, academicYear, academicYear, semesterValue, semesterValue]
      );
      const studentAverage = hasCourseAssigned ? Number(studentRows[0]?.avg_score || 0) : 0;

      const [peerRows] = await pool.query(
        `SELECT
           AVG(CASE WHEN LOWER(evaluator.role) IN ('instructor', 'dept_head', 'department_head') THEN pes.score END) AS peer_to_peer_avg,
           AVG(CASE WHEN LOWER(evaluator.role) IN ('college_dean', 'dean') THEN pes.score END) AS dean_to_peer_avg,
           AVG(pes.score) AS all_peer_avg
         FROM peer_evaluation_submissions pes
         INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
         INNER JOIN users evaluator ON evaluator.id = pes.evaluator_id
         WHERE pe.evaluatee_id = ?
           AND LOWER(TRIM(pes.status)) IN ('submitted', 'completed', 'approved')`,
        [instructor.id]
      );
      const peerToPeerAverage = Number(peerRows[0]?.peer_to_peer_avg || 0);
      const deanToPeerAverage = Number(peerRows[0]?.dean_to_peer_avg || 0);
      const allPeerAverage = Number(peerRows[0]?.all_peer_avg || 0);
      const peerAverage = peerToPeerAverage && deanToPeerAverage
        ? (peerToPeerAverage + deanToPeerAverage) / 2
        : allPeerAverage;

      const [deptHeadRows] = await pool.query(
        `SELECT COALESCE(AVG(dhe.total_score), 0) AS avg_score
         FROM dept_head_evaluations dhe
         WHERE dhe.instructor_id = ?
           AND LOWER(TRIM(dhe.status)) IN ('submitted', 'completed', 'approved')`,
        [instructor.id]
      );
      const rawDeptHeadAverage = Number(deptHeadRows[0]?.avg_score || 0);
      const deptHeadScore = rawDeptHeadAverage;
      const deptHeadPercentage = normalizeDeptHeadScore(rawDeptHeadAverage);
      const normalizedDeptHead = deptHeadScore <= 30 ? (deptHeadScore / 30) * 100 : deptHeadScore;
      const totalScore = hasCourseAssigned
        ? Number(((studentAverage * 0.5) + (normalizedDeptHead * 0.3) + (peerAverage * 0.2)).toFixed(2))
        : Number(((normalizedDeptHead * 0.6) + (peerAverage * 0.4)).toFixed(2));

      await pool.query(
        `INSERT INTO evaluation_results (instructor_id, department_id, academic_year, semester, student_average, student_score, peer_average, peer_score, dept_head_score, total_score, final_score)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE student_average = VALUES(student_average), student_score = VALUES(student_score), peer_average = VALUES(peer_average), peer_score = VALUES(peer_score), dept_head_score = VALUES(dept_head_score), total_score = VALUES(total_score), final_score = VALUES(final_score), published_at = CURRENT_TIMESTAMP`,
          [instructor.id, departmentId, academicYear, semesterValue, hasCourseAssigned ? studentAverage : 0, hasCourseAssigned ? studentAverage : 0, peerAverage, peerAverage, deptHeadScore, totalScore, totalScore]
      );

      const studentWeightedScore = hasCourseAssigned ? Number((studentAverage * 0.5).toFixed(2)) : 0;
      const deptHeadWeightedScore = hasCourseAssigned ? Number((normalizedDeptHead * 0.3).toFixed(2)) : Number((normalizedDeptHead * 0.6).toFixed(2));
      const peerWeightedScore = hasCourseAssigned ? Number((peerAverage * 0.2).toFixed(2)) : Number((peerAverage * 0.4).toFixed(2));

      await pool.query(
        `INSERT INTO evaluation_summaries (
           instructor_id, department_id,
           student_raw_percentage, student_weighted_score,
           dept_head_raw_percentage, dept_head_weighted_score,
           peer_raw_percentage, peer_weighted_score, total_weighted_score,
           is_published, published_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           department_id = VALUES(department_id),
           student_raw_percentage = VALUES(student_raw_percentage),
           student_weighted_score = VALUES(student_weighted_score),
           dept_head_raw_percentage = VALUES(dept_head_raw_percentage),
           dept_head_weighted_score = VALUES(dept_head_weighted_score),
           peer_raw_percentage = VALUES(peer_raw_percentage),
           peer_weighted_score = VALUES(peer_weighted_score),
           total_weighted_score = VALUES(total_weighted_score),
           is_published = 1, published_at = CURRENT_TIMESTAMP` ,
        [
          instructor.id,
          departmentId,
          hasCourseAssigned ? studentAverage : 0,
          studentWeightedScore,
          rawDeptHeadAverage,
          deptHeadWeightedScore,
          peerAverage,
          peerWeightedScore,
          totalScore,
        ]
      );

      const [[targetInstructor]] = await pool.query(
        `SELECT u.id AS user_id
         FROM instructors i INNER JOIN users u ON u.id = i.user_id
         WHERE i.id = ? AND LOWER(COALESCE(u.status, 'active')) = 'active' LIMIT 1`,
        [instructor.id]
      );
      await createNotifications({
        userIds: targetInstructor?.user_id ? [targetInstructor.user_id] : [],
        title: 'Final evaluation result published',
        message: `Your final evaluation result for ${academicYear} ${semesterValue} is now available.`,
        type: 'final_result_published',
      });

      results.push({
        instructor_id: instructor.id,
        student_average: Number(studentAverage.toFixed(2)),
        peer_average: Number(peerAverage.toFixed(2)),
        dept_head_score: Number(deptHeadScore.toFixed(2)),
        total_score: Number(totalScore.toFixed(2)),
      });
    }

    emitEvaluationUpdate({ type: 'final-results-published', academicYear, semester: semesterValue, instructorIds: results.map(({ instructor_id }) => instructor_id) });
    return res.status(200).json({ success: true, message: 'Final results calculated and published successfully.', data: { results } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Unable to calculate and publish results.', error: error.message });
  }
});

// Public endpoint to fetch students with strict DB filtering
app.get('/api/students', authenticate, async (req, res) => {
  try {
    const { department_id, program_type = 'All', year_level = 'All', section = 'All' } = req.query;

    // If the requester is a dept_head, restrict to their department
    let deptId = department_id;
    if (req.user && req.user.role === 'dept_head') {
      deptId = req.user.department_id || req.user.department || deptId;
    }

    if (!deptId) {
      return sendResponse(res, 400, 'department_id is required.', 'የክፍል መለያ ያስፈልጋል።');
    }

    const query = `SELECT 
      s.id,
      s.student_id,
      CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, '')) AS full_name,
      s.department_id,
      s.program_type,
      s.year_level,
      s.section
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.department_id = ?
      AND (? = 'All' OR s.program_type = ?)
      AND (? = 'All' OR s.year_level = ?)
      AND (? = 'All' OR s.section = ?)`;

    const params = [deptId, program_type, program_type, year_level, year_level, section, section];
    const [rows] = await pool.query(query, params);
    return sendResponse(res, 200, 'Students retrieved.', 'ተማሪዎች ተመልሰዋል።', rows);
  } catch (error) {
    console.error('Student list fetch error:', error?.message || error);
    return sendResponse(res, 500, 'Unable to fetch students.', 'ተማሪዎችን ማግኘት አልተቻለም።', []);
  }
});

app.post('/api/auth/register', mwAuthenticateToken, mwAuthorizeRoles('admin'), async (req, res) => {
  try {
    const {
      full_name,
      email,
      username,
      password,
      role = 'student',
      department,
      department_id,
      department_name,
      phone_number,
      college,
      academic_year,
      semester,
      year,
      section,
      specialization,
      learning_level,
      student_id,
      employee_id,
      program_type,
      gender,
      replace_existing = false,
    } = req.body;

    const validationErrors = validateRegistrationPayload({
      full_name,
      role,
      student_id,
      employee_id,
      email,
    });

    if (Object.keys(validationErrors).length) {
      return res.status(400).json({ success: false, message: 'Validation error', errors: validationErrors });
    }

    const errors = {};
    if (!full_name || !String(full_name).trim()) errors.full_name = 'full_name is required.';
    
    // Validation based on role
    if (role === 'student') {
      if (!student_id || !String(student_id).trim()) errors.student_id = 'student_id is required for students.';
      if (!section || !String(section).trim()) errors.section = 'section is required for students.';
      if (!year || !String(year).trim()) errors.year = 'year is required for students.';
    } else {
      if (!email || !String(email).trim()) errors.email = 'email is required for staff roles.';
    }

    if (Object.keys(errors).length) {
      return sendResponse(res, 400, 'Validation failed.', 'ማረጋገጫ አልተሳካም።', { errors });
    }

    const normalizedEmail = role === 'student' ? null : (typeof email === 'string' && email.trim() ? email.trim() : null);
    const normalizedStudentId = role === 'student' ? (typeof student_id === 'string' && student_id.trim() ? student_id.trim() : null) : null;
    const normalizedGender = normalizeGenderValue(gender || req.body?.sex || 'male');

    const resolvedDepartmentId = await resolveDepartmentId(department_id ?? department ?? department_name);
    const [departmentRows] = resolvedDepartmentId
      ? await pool.query('SELECT college_id FROM departments WHERE id = ? LIMIT 1', [resolvedDepartmentId])
      : [[]];
    const inferredCollegeId = departmentRows[0]?.college_id || null;
    const resolvedDepartment = [department, department_name, department_id].find((value) => typeof value === 'string' && value.trim()) || null;
    const normalizedDepartment = typeof resolvedDepartment === 'string' && resolvedDepartment.trim() ? resolvedDepartment.trim() : null;
    
    if (role === 'dept_head') {
      if (!resolvedDepartmentId) {
        return res.status(400).json({ message: 'Please select a valid department before assigning a Department Head.' });
      }
      if (await hasActiveDepartmentHead(resolvedDepartmentId)) {
        return res.status(400).json({ message: 'This department already has an assigned Department Head. Please reassign or update the existing one.' });
      }
    }

    const hashedPassword = await bcrypt.hash(getDefaultPasswordForRole(role), 12);
    
    const userFields = {
      full_name: String(full_name).trim(),
      email: normalizedEmail,
      student_id: normalizedStudentId,
      password_hash: hashedPassword,
      role,
      department: normalizedDepartment,
      department_name: typeof department_name === 'string' && department_name.trim() ? department_name.trim() : null,
      phone_number: typeof phone_number === 'string' && phone_number.trim() ? phone_number.trim() : null,
      college: typeof college === 'string' && college.trim() ? college.trim() : null,
      academic_year: typeof academic_year === 'string' && academic_year.trim() ? academic_year.trim() : null,
      semester: typeof semester === 'string' && semester.trim() ? semester.trim() : null,
      year: typeof year === 'string' && year.trim() ? year.trim() : null,
      section: typeof section === 'string' && section.trim() ? section.trim() : null,
      specialization: typeof specialization === 'string' && specialization.trim() ? specialization.trim() : null,
      learning_level: typeof learning_level === 'string' && learning_level.trim() ? learning_level.trim() : null,
      employee_id: typeof employee_id === 'string' && employee_id.trim() ? employee_id.trim() : null,
      program_type: typeof program_type === 'string' && program_type.trim() ? program_type.trim() : null,
      gender: normalizedGender,
    };

    // Use transaction: insert into users then role-specific tables
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (isSystemAdminRole(userFields.role)) {
        const activeAdmin = await getActiveSystemAdmin(conn);
        if (activeAdmin) {
          await conn.rollback();
          return sendResponse(res, 409, SYSTEM_ADMIN_CONFLICT_MESSAGE, SYSTEM_ADMIN_CONFLICT_MESSAGE);
        }
      }

      // Check if email or student_id already exists
      if (normalizedEmail) {
        const [existingEmail] = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
        if (existingEmail.length) {
          await conn.rollback();
          return sendResponse(res, 409, 'Email already exists.', 'ኢሜል አስቀድሞ አለ።');
        }
      }

      if (normalizedStudentId) {
        const [existingStudentId] = await conn.query('SELECT user_id AS id FROM students WHERE student_id = ? LIMIT 1', [normalizedStudentId]);
        if (existingStudentId.length) {
          await conn.rollback();
          return sendResponse(res, 409, 'Student ID already exists.', 'ተማሪ ቁጥር አስቀድሞ አለ።');
        }
      }

      const nameParts = String(userFields.full_name || '').trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts.shift() || '';
      const lastName = nameParts.join(' ');
      const [userResult] = isSystemAdminRole(userFields.role)
        ? await conn.query(
          'INSERT INTO users (email, first_name, last_name, password_hash, role, status, is_first_login, must_change_password, gender) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
          [userFields.email, firstName, lastName, userFields.password_hash, userFields.role, 'active', 1, userFields.gender]
        )
        : await conn.query(
          'INSERT INTO users (email, password_hash, role, status, is_first_login, must_change_password, gender) VALUES (?, ?, ?, ?, ?, 1, ?)',
          [userFields.email, userFields.password_hash, userFields.role, 'active', 1, userFields.gender]
        );
      const userId = userResult.insertId;

      // Insert into role-specific table
      if (userFields.role === 'student') {
        await conn.query(
          'INSERT INTO students (user_id, student_id, first_name, last_name, department_id, semester, year_level, section, program_type, gender, phone_number, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)',
          [
            userId,
            userFields.student_id,
            userFields.full_name || null,
            null,
            resolvedDepartmentId || null,
            req.body.semester || null,
            req.body.year || null,
            req.body.section || null,
            userFields.program_type || null,
            userFields.gender || null,
            userFields.phone_number || null,
          ]
        );
      } else if (['instructor', 'dept_head', 'lab_assistant'].includes(userFields.role)) {
        if (userFields.role === 'lab_assistant') {
          await conn.query(
            'INSERT INTO lab_assistants (user_id, employee_id, first_name, last_name, email, department_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              userId,
              userFields.employee_id || null,
              userFields.full_name?.trim().split(/\s+/)[0] || null,
              userFields.full_name?.trim().split(/\s+/).slice(1).join(' ') || userFields.full_name || null,
              normalizedEmail || userFields.email || null,
              resolvedDepartmentId || null,
              'active',
            ]
          );
        } else {
          await conn.query(
            'INSERT INTO instructors (user_id, employee_id, first_name, last_name, department_id, gender, phone_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              userId,
              userFields.employee_id || null,
              userFields.full_name || null,
              null,
              resolvedDepartmentId || null,
              userFields.gender || null,
              userFields.phone_number || null,
            ]
          );
        }
      }

      await conn.commit();
      return sendResponse(res, 201, 'User registered successfully.', 'ተጠቃሚ በተሳካ ሁኔታ ተመዝግቧል።', { id: userId, role: userFields.role });
    } catch (sqlErr) {
      console.error('SQL Error:', sqlErr);
      try { await conn.rollback(); } catch (e) {}
      if (isActiveSystemAdminUniqueError(sqlErr)) {
        return sendResponse(res, 409, SYSTEM_ADMIN_CONFLICT_MESSAGE, SYSTEM_ADMIN_CONFLICT_MESSAGE);
      }
      return sendResponse(res, 500, 'Registration failed due to database error.', 'መመዝገብ በዳታቤዝ ስህተት ምክንያት አልተሳካም።');
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error('Registration failed:', {
      message: error.message,
      code: error.code,
      sql: error.sql,
      sqlMessage: error.sqlMessage,
      stack: error.stack,
      body: req.body,
    });
    if (isActiveSystemAdminUniqueError(error)) {
      return sendResponse(res, 409, SYSTEM_ADMIN_CONFLICT_MESSAGE, SYSTEM_ADMIN_CONFLICT_MESSAGE);
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return sendResponse(res, 409, 'Department Head already exists for this department. Please update or reassign the existing Department Head.', 'ይህ ዲፓርትመንት ለነበረው የዲፓርትመንት አስተዳዳሪ ነው። እባክዎ ነበረውን ይለውጡ ወይም አስተካክሉ።');
    }

    return res.status(500).json({
      message: 'Registration failed due to database error.',
      error: error.sqlMessage || error.message,
    });
  }
});

const cleanCsvKey = (key) => String(key || '')
  .trim()
  .replace(/^\uFEFF/, '')
  .toLowerCase()
  .replace(/[^a-zA-Z0-9_]/g, '');

const normalizeFieldName = (field) => cleanCsvKey(field);
const normalizeRow = (row) => {
  const normalized = {};
  const aliases = {
    studentid: 'student_id',
    studentnumber: 'student_number',
    employeeid: 'employee_id',
    employeenumber: 'employee_number',
    fullname: 'full_name',
    firstname: 'first_name',
    lastname: 'last_name',
    gender: 'gender',
    sex: 'gender',
    departmentid: 'department_id',
    departmentname: 'department_name',
    registrationdate: 'registration_date',
    enrollmentdate: 'enrollment_date',
    programtype: 'program_type',
    academicyear: 'academic_year',
    username: 'user_name',
  };
  Object.keys(row).forEach((key) => {
    const cleanKey = normalizeFieldName(key);
    const value = row[key] != null ? String(row[key]).trim() : '';
    const snakeKey = cleanKey.replace(/_+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    normalized[cleanKey] = value;
    normalized[snakeKey] = value;
    if (aliases[cleanKey]) normalized[aliases[cleanKey]] = value;
  });
  return normalized;
};

const parseUploadRows = (fileBuffer, originalName) => {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: false });
  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) return [];
  const sheet = workbook.Sheets[sheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map(normalizeRow).filter((row) => Object.values(row).some((value) => String(value).trim() !== ''));
};

const resolveRoleFromType = (registration_type) => {
  const type = String(registration_type || '').trim().toLowerCase();
  if (type === 'dept_head') return 'dept_head';
  if (type === 'lab_assistant') return 'lab_assistant';
  if (type === 'instructor') return 'instructor';
  return 'student';
};

const resolveDepartmentId = async (value, db = pool) => {
  if (value == null) return null;
  const candidate = String(value).trim();
  if (!candidate) return null;

  const numericId = Number(candidate);
  if (Number.isFinite(numericId) && Number.isInteger(numericId) && numericId > 0) {
    const [rows] = await db.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [numericId]);
    if (rows.length) return rows[0].id;
  }

  const lowerCandidate = candidate.toLowerCase();
  const [rows] = await db.query(
    'SELECT id FROM departments WHERE LOWER(name) = ? OR LOWER(code) = ? LIMIT 1',
    [lowerCandidate, lowerCandidate]
  );

  return rows.length ? rows[0].id : null;
};

const hasActiveDepartmentHead = async (departmentId, excludeUserId = null) => {
  if (!departmentId) return false;
  const query = `SELECT u.id FROM users u
    INNER JOIN instructors i ON u.id = i.user_id
    WHERE i.department_id = ? AND u.role = ? AND u.status != ?${excludeUserId ? ' AND u.id != ?' : ''} LIMIT 1`;
  const params = [departmentId, 'dept_head', 'inactive'];
  if (excludeUserId) params.push(excludeUserId);
  const [rows] = await pool.query(query, params);
  return rows.length > 0;
};

const resolveDepartmentValue = (row) => {
  if (row.department_id) return row.department_id;
  if (row.department_name) return row.department_name;
  if (row.department) return row.department;
  return null;
};

app.post(['/api/auth/bulk-register', '/api/admin/bulk-register'], mwAuthenticateToken, mwAuthorizeRoles('admin', 'systemadmin'), upload.single('file'), async (req, res) => {
  let connection;
  try {
    if (!req.file) {
      return sendResponse(res, 400, 'No file uploaded.', 'ፋይል አልተላከም።');
    }

    const registrationType = resolveRoleFromType(req.body.registration_type || req.body.role);
    if (req.path === '/api/admin/bulk-register' && registrationType === 'student') {
      return bulkUploadStudents(req, res);
    }
    const replaceExisting = String(req.body.replace_existing || 'false').toLowerCase() === 'true';
    const rows = parseUploadRows(req.file.buffer, req.file.originalname);

    if (!rows.length) {
      return sendResponse(res, 400, 'Uploaded file contains no rows.', 'አሸናፊ ፋይሉ ምንም ረድፎችን አልያዘም።');
    }

    const result = {
      created: 0,
      updated: 0,
      failed: 0,
      created_users: [],
      errors: [],
    };

    connection = await pool.getConnection();
    await connection.beginTransaction();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 2;
      const role = resolveRoleFromType(row.role || registrationType);
      const full_name = row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim();
      const student_id = String(row.student_id || row.student_number || row.studentid || '').trim();
      const employee_id = String(row.employee_id || row.employee_number || row.employeeid || '').trim();
      const emailInput = String(row.email || row.user_name || row.username || '').trim();
      const department = resolveDepartmentValue(row);
      const resolvedDepartmentId = await resolveDepartmentId(department, connection);
      const section = row.section || '';
      const year = row.year || '';
      const program_type = row.program_type || row.program || (role === 'student' ? '' : 'regular');
      const department_name = row.department_name || '';
      const semester = row.semester || '';
      const phone_number = row.phone_number || '';
      const genderInput = String(row.gender || row.sex || '').trim().toLowerCase();
      const gender = normalizeGenderValue(genderInput || 'male');
      const academic_year = row.academic_year || '';
      const specialization = row.specialization || '';
      const learning_level = row.learning_level || '';

      // Determine identifier based on role
      const loginIdentifier = role === 'student' ? student_id : (emailInput || employee_id);

      const rowErrors = [];
      if (!full_name) rowErrors.push('full_name is required');
      if (!loginIdentifier) rowErrors.push(role === 'student' ? 'student_id is required' : 'email is required');
      if (!resolvedDepartmentId) rowErrors.push('department is required');
      if (!['male', 'm', 'female', 'f'].includes(genderInput)) rowErrors.push('gender must be male or female');
      if (role === 'student' && !student_id) rowErrors.push('student_id is required');
      if (role === 'student' && !/^mau\d{7}$/i.test(student_id)) rowErrors.push('student_id must contain mau followed by 7 digits');
      if (role === 'student' && !section) rowErrors.push('section is required');
      if (role === 'student' && !year) rowErrors.push('year is required');
      if (role === 'student' && !semester) rowErrors.push('semester is required');
      if (role === 'student' && !program_type) rowErrors.push('program_type is required');
      if (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) rowErrors.push('a valid email is required');
      if (role !== 'student' && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/.test(employee_id)) rowErrors.push('employee_id must contain at least 3 valid characters');

      if (rowErrors.length) {
        result.failed += 1;
        result.errors.push({ row: rowNumber, errors: rowErrors });
        continue;
      }

      const profileTable = role === 'student' ? 'students' : role === 'lab_assistant' ? 'lab_assistants' : 'instructors';
      const profileIdentityColumn = role === 'student' ? 'student_id' : 'employee_id';
      const profileIdentity = role === 'student' ? student_id : employee_id;
      const [[existingProfile]] = await connection.query(
        `SELECT profile.user_id AS profile_user_id,
          linked_user.id AS linked_user_id, linked_user.role AS linked_user_role,
          linked_user.email AS linked_user_email
         FROM ${profileTable} profile
         LEFT JOIN users linked_user ON linked_user.id = profile.user_id
         WHERE profile.${profileIdentityColumn} = ? LIMIT 1`,
        [profileIdentity]
      );
      const email = String(emailInput || existingProfile?.linked_user_email || `${profileIdentity}@university.edu.et`).trim().toLowerCase();
      const [[emailUser]] = await connection.query(
        'SELECT id, email, role FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1',
        [email]
      );
      if (existingProfile?.linked_user_id && emailUser && Number(existingProfile.linked_user_id) !== Number(emailUser.id)) {
        result.failed += 1;
        result.errors.push({ row: rowNumber, errors: ['The login email is already linked to a different user account.'] });
        continue;
      }
      const existingUser = existingProfile?.linked_user_id
        ? { id: existingProfile.linked_user_id, role: existingProfile.linked_user_role, email: existingProfile.linked_user_email }
        : emailUser;
      if (existingUser && String(existingUser.role).toLowerCase() !== role) {
        result.failed += 1;
        result.errors.push({ row: rowNumber, errors: ['The login email is already assigned to a different role.'] });
        continue;
      }
      if (existingUser && Number(existingProfile?.linked_user_id || 0) !== Number(existingUser.id)) {
        const [[otherProfile]] = await connection.query(
          `SELECT ${profileIdentityColumn} AS profile_identity
           FROM ${profileTable} WHERE user_id = ? LIMIT 1`,
          [existingUser.id]
        );
        if (otherProfile && String(otherProfile.profile_identity) !== String(profileIdentity)) {
          result.failed += 1;
          result.errors.push({ row: rowNumber, errors: ['The login account is already linked to a different role profile.'] });
          continue;
        }
      }

      if (role === 'dept_head' && resolvedDepartmentId) {
        const [existingDeptHead] = await connection.query(
          'SELECT u.id FROM users u INNER JOIN instructors i ON u.id = i.user_id WHERE i.department_id = ? AND u.role = ? AND u.status != ?' + (existingUser ? ' AND u.id != ?' : ' LIMIT 1'),
          existingUser ? [resolvedDepartmentId, 'dept_head', 'inactive', existingUser.id] : [resolvedDepartmentId, 'dept_head', 'inactive']
        );
        if (existingDeptHead.length) {
          result.failed += 1;
          result.errors.push({ row: rowNumber, errors: ['Department Head already exists for this department.'] });
          continue;
        }
      }

      const nameParts = full_name.split(/\s+/).filter(Boolean);
      const firstName = row.first_name || nameParts.shift() || '';
      const lastName = row.last_name || nameParts.join(' ');
      const genderValue = normalizeGenderValue(row.gender || row.sex || 'male');
      let userId = existingUser?.id;
      if (userId && existingUser.role === 'dept_head' && role === 'dept_head' && replaceExisting) {
        const password_hash = await bcrypt.hash(row.password || getDefaultPasswordForRole(role), 12);
        await connection.query(
          'UPDATE users SET password_hash = ?, first_name = ?, last_name = ?, email = ?, status = \'active\', is_first_login = 1, must_change_password = 1, gender = ? WHERE id = ?',
          [password_hash, firstName, lastName, email, genderValue, userId]
        );
      } else if (userId) {
        await connection.query(
          'UPDATE users SET first_name = ?, last_name = ?, email = ?, status = \'active\', gender = ? WHERE id = ?',
          [firstName, lastName, email, genderValue, userId]
        );
      } else {
        const password_hash = await bcrypt.hash(row.password || getDefaultPasswordForRole(role), 12);
        const [insertResult] = await connection.query(
          `INSERT INTO users (email, first_name, last_name, password_hash, role, status, is_first_login, must_change_password, gender)
           VALUES (?, ?, ?, ?, ?, 'active', 1, 1, ?)`,
          [email, firstName, lastName, password_hash, role, genderValue]
        );
        userId = insertResult.insertId;
      }

      if (role === 'student') {
        await connection.query(
          `INSERT INTO students (user_id, student_id, first_name, last_name, department_id, semester, year_level, section, program_type, gender, phone_number, registration_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)
           ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), first_name = VALUES(first_name), last_name = VALUES(last_name), department_id = VALUES(department_id), semester = VALUES(semester), year_level = VALUES(year_level), section = VALUES(section), program_type = VALUES(program_type), gender = VALUES(gender), phone_number = VALUES(phone_number)`,
          [
            userId,
            student_id,
            firstName,
            lastName,
            resolvedDepartmentId,
            semester || null,
            year || null,
            section || null,
            program_type || null,
            gender || null,
            phone_number || null,
          ]
        );
      } else if (role === 'lab_assistant') {
        await connection.query(
          `INSERT INTO lab_assistants (user_id, employee_id, first_name, last_name, email, department_id, gender, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
           ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), first_name = VALUES(first_name), last_name = VALUES(last_name), email = VALUES(email), department_id = VALUES(department_id), gender = VALUES(gender), status = 'active'`,
          [userId, employee_id, firstName, lastName, email, resolvedDepartmentId, genderValue]
        );
      } else {
        await connection.query(
          `INSERT INTO instructors (user_id, employee_id, first_name, last_name, department_id, gender, phone_number)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), first_name = VALUES(first_name), last_name = VALUES(last_name), department_id = VALUES(department_id), gender = VALUES(gender), phone_number = VALUES(phone_number)`,
          [
            userId,
            employee_id,
            firstName,
            lastName,
            resolvedDepartmentId,
            genderValue || null,
            phone_number || null,
          ]
        );
      }

      if (existingUser) result.updated += 1;
      else result.created += 1;
      result.created_users.push({
        id: userId,
        email,
        role,
        full_name,
        first_name: firstName,
        last_name: lastName,
        department: department || resolvedDepartmentId,
        department_id: resolvedDepartmentId,
        department_name,
        employee_id,
        student_id,
        semester,
        year,
        section,
        program_type,
        gender,
      });
    }

    if (result.failed > 0) {
      await connection.rollback();
      connection.release();
      connection = null;
      return res.status(400).json({
        success: false,
        message: 'Bulk registration was rolled back because one or more rows failed.',
        created: 0,
        updated: 0,
        failed: result.failed,
        errors: result.errors,
      });
    }

    await connection.commit();
    connection.release();
    return sendResponse(res, 200, 'Bulk registration completed.', 'ብዛት ምዝገባ ተካሄዷል።', result);
  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('Bulk registration failed:', {
      message: error.message,
      code: error.code,
      sql: error.sql,
      stack: error.stack,
      file: req.file?.originalname,
      body: req.body,
    });
    return sendResponse(res, 500, 'Bulk registration failed.', 'የብዛት ምዝገባ አልተሳካም።', {
      errors: [{ message: error.message }],
    });
  }
});

app.get('/api/auth/me', authenticate, me);

app.post('/api/auth/register-instructor', authenticate, authorizeRoles('admin', 'systemadmin'), async (req, res) => {
  const body = req.body || {};
  const role = 'instructor';
  const firstName = String(body.firstName ?? body.first_name ?? body.full_name?.split(/\s+/)[0] ?? body.name?.split(/\s+/)[0] ?? '').trim();
  const lastName = String(body.lastName ?? body.last_name ?? body.full_name?.split(/\s+/).slice(1).join(' ') ?? body.name?.split(/\s+/).slice(1).join(' ') ?? '').trim();
  const email = String(body.email ?? body.username ?? '').trim();
  const employeeId = String(body.employeeId ?? body.employee_id ?? '').trim();
  const departmentIdValue = body.departmentId ?? body.department_id ?? body.department ?? body.departmentName ?? body.department_name ?? '';
  const departmentId = departmentIdValue === null || departmentIdValue === undefined || departmentIdValue === '' ? null : departmentIdValue;
  const gender = normalizeGenderValue(body.gender);
  const password = typeof body.password === 'string' ? body.password.trim() : '';

  const validationErrors = validateRegistrationPayload({
    first_name: firstName,
    last_name: lastName,
    role,
    employee_id: employeeId,
    email,
    gender,
  });

  if (Object.keys(validationErrors).length) {
    return res.status(400).json({
      success: false,
      message: Object.values(validationErrors).join(', '),
      errors: Object.entries(validationErrors).map(([field, msg]) => ({ field, msg })),
    });
  }

  const normalizedEmail = String(email).trim();
  if (!normalizedEmail || !firstName || !lastName) {
    return sendResponse(res, 400, 'Missing required fields (email, first_name, last_name).', 'የሚጠየቁ መረጃዎች አሉ።');
  }

  const resolvedDepartmentId = await resolveDepartmentId(departmentId);
  if (!resolvedDepartmentId) {
    return res.status(400).json({
      success: false,
      message: 'Please select a valid department before registering.',
      errors: [{ field: 'departmentId', msg: 'Please select a valid department before registering.' }],
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [exists] = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
    if (exists.length) {
      await conn.rollback();
      return sendResponse(res, 409, 'Email already exists.', 'ኢሜል አስቀድሞ አለ።');
    }

    const hashed = await bcrypt.hash(getDefaultPasswordForRole(role), 12);

    const [userResult] = await conn.query(
      'INSERT INTO users (email, password_hash, role, status, is_first_login, must_change_password) VALUES (?, ?, ?, ?, ?, 1)',
      [normalizedEmail, hashed, role, 'active', 1]
    );
    const userId = userResult.insertId;

    await conn.query(
      'INSERT INTO instructors (user_id, employee_id, first_name, last_name, department_id, gender) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, employeeId || null, firstName, lastName, resolvedDepartmentId || null, gender || null]
    );

    await conn.commit();
    return sendResponse(res, 201, 'Instructor registered successfully.', 'አስተማሪ በተሳካ ሁኔታ ተመዝግቧል።', { id: userId });
  } catch (error) {
    console.error('Register instructor failed:', error);
    try { await conn.rollback(); } catch (e) {}
    return res.status(500).json({
      message: 'Registration failed due to database error.',
      error: error.sqlMessage || error.message,
    });
  } finally {
    conn.release();
  }
});

app.post('/api/auth/register-lab-assistant', authenticate, authorizeRoles('admin', 'systemadmin'), async (req, res) => {
  const body = req.body || {};
  const role = 'lab_assistant';
  const firstName = String(body.firstName ?? body.first_name ?? body.full_name?.split(/\s+/)[0] ?? body.name?.split(/\s+/)[0] ?? '').trim();
  const lastName = String(body.lastName ?? body.last_name ?? body.full_name?.split(/\s+/).slice(1).join(' ') ?? body.name?.split(/\s+/).slice(1).join(' ') ?? '').trim();
  const email = String(body.email ?? body.username ?? '').trim();
  const employeeId = String(body.employeeId ?? body.employee_id ?? '').trim();
  const departmentIdValue = body.departmentId ?? body.department_id ?? body.department ?? body.departmentName ?? body.department_name ?? '';
  const departmentId = departmentIdValue === null || departmentIdValue === undefined || departmentIdValue === '' ? null : departmentIdValue;
  const gender = normalizeGenderValue(body.gender);
  const password = typeof body.password === 'string' ? body.password.trim() : '';

  const validationErrors = validateRegistrationPayload({
    first_name: firstName,
    last_name: lastName,
    role,
    employee_id: employeeId,
    email,
    gender,
  });

  if (Object.keys(validationErrors).length) {
    return res.status(400).json({
      success: false,
      message: Object.values(validationErrors).join(', '),
      errors: Object.entries(validationErrors).map(([field, msg]) => ({ field, msg })),
    });
  }

  const normalizedEmail = String(email).trim();
  if (!normalizedEmail || !firstName || !lastName) {
    return sendResponse(res, 400, 'Missing required fields (email, first_name, last_name).', 'የሚጠየቁ መረጃዎች አሉ።');
  }

  const resolvedDepartmentId = await resolveDepartmentId(departmentId);
  if (!resolvedDepartmentId) {
    return res.status(400).json({
      success: false,
      message: 'Please select a valid department before registering.',
      errors: [{ field: 'departmentId', msg: 'Please select a valid department before registering.' }],
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [exists] = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
    if (exists.length) {
      await conn.rollback();
      return sendResponse(res, 409, 'Email already exists.', 'ኢሜል አስቀድሞ አለ።');
    }

    const hashed = await bcrypt.hash(getDefaultPasswordForRole(role), 12);

    const [userResult] = await conn.query(
      'INSERT INTO users (email, password_hash, role, status, is_first_login, must_change_password) VALUES (?, ?, ?, ?, ?, 1)',
      [normalizedEmail, hashed, role, 'active', 1]
    );
    const userId = userResult.insertId;

    await conn.query(
      'INSERT INTO lab_assistants (user_id, employee_id, first_name, last_name, email, department_id, gender, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, employeeId || null, firstName, lastName, normalizedEmail, resolvedDepartmentId || null, gender || null, 'active']
    );

    await conn.commit();
    return sendResponse(res, 201, 'Lab assistant registered successfully.', 'ላብ አስተዳዳሪ በተሳካ ሁኔታ ተመዝግቧል።', { id: userId });
  } catch (error) {
    console.error('Register lab assistant failed:', error);
    try { await conn.rollback(); } catch (e) {}
    return res.status(500).json({
      message: 'Registration failed due to database error.',
      error: error.sqlMessage || error.message,
    });
  } finally {
    conn.release();
  }
});

// Register a student (creates user + student record) using a transaction (admin only)
app.post('/api/auth/register-student', mwAuthenticateToken, mwAuthorizeRoles('admin', 'systemadmin'), async (req, res) => {
  const {
    first_name,
    last_name,
    department_id,
    department,
    department_name,
    student_id,
    username,
    gender,
    semester,
    year_level,
    section,
    program_type,
    password,
    email,
  } = req.body;

  const validationErrors = validateRegistrationPayload({
    first_name,
    last_name,
    role: 'student',
    student_id,
    email,
  });

  if (Object.keys(validationErrors).length) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: validationErrors });
  }

  if (!student_id || !first_name || !last_name) {
    return sendResponse(res, 400, 'Missing required fields (student_id, first_name, last_name).', 'የሚጠየቁ መረጃዎች አሉ።');
  }

  const resolvedDepartmentId = await resolveDepartmentId(department_id ?? department ?? department_name);
  if (!resolvedDepartmentId) {
    return res.status(400).json({
      message: 'Please select a valid department before registering.',
    });
  }

  if (department_id || department || department_name) {
    console.debug('Student registration department resolution:', { department_id, department, department_name, resolvedDepartmentId });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query('SELECT user_id AS id FROM students WHERE student_id = ? LIMIT 1', [student_id]);
    if (existing.length) {
      await conn.rollback();
      return sendResponse(res, 400, 'Student ID already exists.', 'ተማሪ ቁጥር አስቀድሞ አለ።');
    }

    const hashedPassword = await bcrypt.hash(getDefaultPasswordForRole('student'), 12);

    const [userResult] = await conn.query(
      'INSERT INTO users (email, password_hash, role, status, is_first_login, must_change_password) VALUES (?, ?, ?, ?, ?, 1)',
      [null, hashedPassword, 'student', 'active', 1]
    );
    const newUserId = userResult.insertId;

    await conn.query(
      'INSERT INTO students (user_id, student_id, first_name, last_name, department_id, semester, year_level, section, program_type, gender, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)',
      [
        newUserId,
        student_id || null,
        first_name || null,
        last_name || null,
        resolvedDepartmentId || null,
        semester || null,
        year_level || null,
        section || null,
        program_type || null,
        gender || null,
      ]
    );

    await conn.commit();
    return sendResponse(res, 201, 'Student registered successfully.', 'ተማሪ በተሳካ ሁኔታ ተመዝግቧል።', { id: newUserId });
  } catch (error) {
    console.error('Registration Error:', error);
    try { await conn.rollback(); } catch (rollbackError) {
      console.error('Rollback Error:', rollbackError);
    }
    return res.status(500).json({
      message: 'Registration failed due to database error.',
      error: error.sqlMessage || error.message,
    });
  } finally {
    conn.release();
  }
});

// Legacy alias for clients that still use /api/auth/departments.
app.post('/api/auth/departments', mwAuthenticateToken, mwAuthorizeRoles('admin', 'systemadmin'), createDepartment);

// List departments
app.get('/api/departments', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.id,
              d.college_id,
              d.department_name,
              d.department_code,
              d.name,
              d.code,
              c.name AS college_name
       FROM departments d
       LEFT JOIN colleges c ON d.college_id = c.id
       ORDER BY c.name ASC, d.name ASC`
    );
    return sendResponse(res, 200, 'Departments loaded.', 'ዲፓርትመንቶች ተጫኑ።', rows);
  } catch (error) {
    console.error('Fetch departments failed:', error?.message || error);
    return sendResponse(res, 500, 'Unable to load departments.', 'ዲፓርትመንቶችን ማግኘት አልቻለም።');
  }
});

const getDepartmentInstructors = async (req, res) => {
  try {
    const departmentId = Number(req.params.deptId);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({ message: 'A valid department ID is required.' });
    }

    const [rows] = await pool.query(
      `SELECT * FROM (
        SELECT
          i.id AS staff_id,
          i.id AS instructor_id,
          u.id AS user_id,
          CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS full_name,
          u.email,
          LOWER(COALESCE(u.role, 'instructor')) AS role,
          i.department_id,
          d.name AS department_name,
          c.name AS college_name
        FROM users u
        INNER JOIN instructors i ON i.user_id = u.id
        LEFT JOIN departments d ON d.id = i.department_id
        LEFT JOIN colleges c ON c.id = d.college_id
        WHERE i.department_id = ?
          AND LOWER(COALESCE(u.status, 'active')) = 'active'
          AND LOWER(COALESCE(u.role, 'instructor')) IN ('instructor', 'lab_assistant', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_director', 'director')

        UNION ALL

        SELECT
          la.id AS staff_id,
          NULL AS instructor_id,
          la.user_id AS user_id,
          CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, '')) AS full_name,
          la.email,
          'lab_assistant' AS role,
          la.department_id,
          d.name AS department_name,
          c.name AS college_name
        FROM lab_assistants la
        LEFT JOIN departments d ON d.id = la.department_id
        LEFT JOIN colleges c ON c.id = d.college_id
        LEFT JOIN users u ON u.id = la.user_id
        WHERE la.department_id = ?
          AND LOWER(COALESCE(u.status, 'active')) = 'active'
          AND LOWER(COALESCE(u.role, 'lab_assistant')) = 'lab_assistant'
      ) staff
      ORDER BY full_name ASC`,
      [departmentId, departmentId]
    );

    return res.json(rows.map((row) => ({
      ...row,
      id: row.staff_id ?? row.instructor_id ?? row.user_id,
      role: String(row.role || 'instructor').toLowerCase().replace(/^department_head$/, 'dept_head').replace(/^dean$/, 'college_dean'),
      staff_id: row.staff_id ?? row.instructor_id ?? row.user_id,
      instructor_id: row.instructor_id ?? row.staff_id ?? row.user_id,
      name: row.full_name || row.name || row.email || 'Unknown staff',
    })));
  } catch (error) {
    console.error('Department instructors query failed:', error);
    return res.status(500).json({ message: 'Unable to load department instructors.', error: error.message });
  }
};

const getDepartmentStaff = async (req, res) => {
  try {
    const departmentId = Number(req.query.department_id ?? req.query.department ?? req.user?.department_id ?? req.user?.department ?? 0);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({ message: 'A valid department ID is required.' });
    }

    const [[currentDepartment]] = await pool.query(
      'SELECT college_id FROM departments WHERE id = ? LIMIT 1',
      [departmentId]
    );
    const collegeId = Number(currentDepartment?.college_id || 0);

    const [rows] = await pool.query(
      `SELECT * FROM (
        SELECT
          i.user_id AS id,
          CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS name,
          u.email,
          LOWER(COALESCE(u.role, 'instructor')) AS role
        FROM instructors i
        JOIN users u ON u.id = i.user_id
        WHERE i.department_id = ?
          AND LOWER(COALESCE(u.status, 'active')) = 'active'
          AND LOWER(COALESCE(u.role, 'instructor')) IN ('instructor', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_director', 'director')

        UNION ALL

        SELECT
          la.user_id AS id,
          CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, '')) AS name,
          la.email,
          'lab_assistant' AS role
        FROM lab_assistants la
        JOIN users u ON u.id = la.user_id
        WHERE la.department_id = ?
          AND LOWER(COALESCE(u.status, 'active')) = 'active'
          AND LOWER(COALESCE(u.role, 'lab_assistant')) = 'lab_assistant'

        UNION ALL

        SELECT
          u.id AS id,
          CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS name,
          u.email,
          LOWER(COALESCE(u.role, 'instructor')) AS role
        FROM users u
        LEFT JOIN instructors i ON i.user_id = u.id
        LEFT JOIN lab_assistants la ON la.user_id = u.id
        LEFT JOIN departments d ON d.id = COALESCE(i.department_id, la.department_id)
        WHERE LOWER(COALESCE(u.status, 'active')) = 'active'
          AND LOWER(COALESCE(u.role, 'instructor')) IN ('college_dean', 'dean')
          AND (? > 0)
          AND d.college_id = ?
      ) staff
      ORDER BY name ASC`,
      [departmentId, departmentId, departmentId, collegeId]
    );

    return res.json(Array.from(new Map(rows.map((row) => [String(row.id), {
      id: Number(row.id),
      name: row.name || row.email || 'Unknown staff',
      email: row.email || '',
      role: String(row.role || 'instructor').toLowerCase().replace(/^department_head$/, 'dept_head').replace(/^dean$/, 'college_dean'),
    }])).values()));
  } catch (error) {
    console.error('Department staff query failed:', error);
    return res.status(500).json({ message: 'Unable to load department staff.', error: error.message });
  }
};

app.get('/api/courses/department-instructors/:deptId', authenticate, authorizeRoles('admin', 'dept_head', 'college_dean'), getDepartmentInstructors);
app.get('/api/instructors/department/:deptId', authenticate, authorizeRoles('admin', 'dept_head', 'college_dean'), getDepartmentInstructors);
app.get('/api/dept-head/department-staff', authenticate, authorizeRoles('admin', 'dept_head', 'college_dean'), getDepartmentStaff);

app.get('/api/courses/filter', authenticate, authorizeRoles('admin', 'dept_head', 'college_dean'), async (req, res) => {
  try {
    const departmentId = Number(req.query.deptId);
    const year = String(req.query.year || '').trim();
    const semester = String(req.query.semester || '').trim();
    if (!departmentId || !year || !semester) return res.status(400).json({ message: 'deptId, year, and semester are required.' });
    const [rows] = await pool.query(
      `SELECT id, code, name, department_id, year_level, semester, credit_hours
       FROM courses WHERE department_id = ? AND (year_level = ? OR year_level IS NULL OR year_level = '') AND (semester = ? OR semester IS NULL OR semester = '') ORDER BY code ASC`,
      [departmentId, year, semester]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to filter courses.', error: error.message });
  }
});

const getCoursesByFilters = async (req, res) => {
  try {
    const departmentId = Number(req.query.department_id ?? req.query.deptId);
    const requestedYear = String(req.query.year_level || req.query.year || '').trim();
    const requestedSemester = String(req.query.semester || '').trim();
    const yearNum = requestedYear.match(/\d+/)?.[0] || requestedYear;
    const dbYear = /^year\s+\d+$/i.test(requestedYear) ? requestedYear : `Year ${yearNum}`;
    const semesterValue = requestedSemester.replace(/^semester\s+/i, '').trim();
    const numericSemester = semesterValue.match(/^(\d+)(?:st|nd|rd|th)?$/i)?.[1] || semesterValue;
    const semesterRoman = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }[numericSemester] || numericSemester;
    const dbSemester = `Semester ${semesterRoman}`;
    if (!departmentId || !requestedYear || !requestedSemester) return res.status(400).json({ message: 'deptId, year, and semester are required.' });
    const [rows] = await pool.query(
      `SELECT id, code, name, code AS course_code, name AS course_title, department_id, year_level, semester
       FROM courses
       WHERE department_id = ?
         AND (year_level = ? OR year_level LIKE ?)
         AND semester = ?
       ORDER BY code ASC`,
      [departmentId, dbYear, `%${dbYear}%`, dbSemester]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load courses by year and semester.', error: error.message });
  }
};

app.get('/api/courses/by-filters', authenticate, authorizeRoles('admin', 'dept_head', 'college_dean'), getCoursesByFilters);
app.get('/api/courses/by-year-semester', authenticate, authorizeRoles('admin', 'dept_head', 'college_dean'), getCoursesByFilters);

// Create a course
app.post('/api/auth/courses', async (req, res) => {
  const code = req.body.course_code || req.body.code;
  const name = req.body.course_name || req.body.name;
  const departmentId = req.body.department_id ?? req.body.departmentId ?? null;
  if (!code || !name) return sendResponse(res, 400, 'code and name are required', 'code እና name ያስፈልጋሉ');
  try {
    const [result] = await pool.query('INSERT INTO courses (code, name, department_id) VALUES (?, ?, ?)', [code, name, departmentId || null]);
    return sendResponse(res, 201, 'Course created.', 'ኮርስ ተፈጥሯል።', { id: result.insertId, code, name, department_id: departmentId });
  } catch (error) {
    console.error('Create course failed:', error?.message || error);
    return sendResponse(res, 500, 'Unable to create course.', 'ኮርስን ማፍጠር አልቻለም።');
  }
});

app.get('/api/course-assignments', authenticate, async (req, res) => {
  try {
    const params = [];
    const isDepartmentHead = ['dept_head', 'department_head'].includes(String(req.user?.role || '').toLowerCase());
    const departmentId = Number(req.user?.department_id ?? req.user?.departmentId ?? req.user?.department ?? 0);
    const requestedDepartmentId = req.query.department_id == null ? null : Number(req.query.department_id);
    let query = `SELECT ca.id, ca.course_id, c.code AS course_code, c.name AS course_name, ca.department_id, ca.instructor_id, ca.student_id, ca.program_type, ca.year_level, ca.semester, ca.section, ca.publish_target, ca.is_published, ca.is_student_published, ca.is_peer_published, ca.academic_year, ca.status, ca.created_at,
      ca.staff_id, ca.assigned_role,
      NULLIF(TRIM(CONCAT(COALESCE(i_instructor.first_name, lab_assistant.first_name, ''), ' ', COALESCE(i_instructor.last_name, lab_assistant.last_name, ''))), '') AS instructor_name,
      NULLIF(TRIM(CONCAT(COALESCE(i_instructor.first_name, lab_assistant.first_name, ''), ' ', COALESCE(i_instructor.last_name, lab_assistant.last_name, ''))), '') AS staff_name,
      CASE
        WHEN ca.instructor_id IS NULL AND ca.staff_id IS NULL AND ca.lab_assistant_id IS NULL THEN 'unassigned'
        WHEN lab_assistant.id IS NOT NULL OR LOWER(COALESCE(ca.assigned_role, '')) = 'lab_assistant' THEN 'lab_assistant'
        ELSE 'instructor'
      END AS staff_role,
      ca.id AS assignment_id,
      COALESCE(NULLIF(staff_user.email, ''), NULLIF(i_user.email, '')) AS instructor_email,
      CASE WHEN ca.instructor_id IS NULL AND ca.staff_id IS NULL THEN 'unassigned' ELSE COALESCE(NULLIF(LOWER(TRIM(ca.status)), ''), 'assigned') END AS normalized_status,
      COALESCE(NULLIF(TRIM(CONCAT(s_student.first_name, ' ', s_student.last_name)), ''), s_user.email, '') AS student_name
      FROM course_assignments ca
      LEFT JOIN courses c ON ca.course_id = c.id
      LEFT JOIN users u ON ca.instructor_id = u.id
      LEFT JOIN instructors i_instructor ON i_instructor.id = COALESCE(ca.instructor_id, CASE WHEN LOWER(COALESCE(ca.assigned_role, 'instructor')) <> 'lab_assistant' THEN ca.staff_id END)
      LEFT JOIN users i_user ON i_user.id = i_instructor.user_id
      LEFT JOIN lab_assistants lab_assistant ON lab_assistant.id = COALESCE(ca.lab_assistant_id, CASE WHEN LOWER(COALESCE(ca.assigned_role, '')) = 'lab_assistant' THEN ca.staff_id END)
      LEFT JOIN users staff_user ON staff_user.id = COALESCE(i_instructor.user_id, lab_assistant.user_id, u.id, ca.instructor_id, ca.staff_id)
      LEFT JOIN students s_student ON ca.student_id = s_student.id
      LEFT JOIN users s_user ON s_user.id = s_student.user_id`;

    if (isDepartmentHead) {
      if (!Number.isInteger(departmentId) || departmentId <= 0) {
        return sendResponse(res, 403, 'Your department is not defined.', 'የክፍል መረጃዎ አልተገለጸም።');
      }
      if (requestedDepartmentId !== null && requestedDepartmentId !== departmentId) {
        return sendResponse(res, 403, 'You can only view assignments in your department.', 'የእርስዎን ክፍል ስራዎች ብቻ ማየት ይችላሉ።');
      }
      query += ' WHERE ca.department_id = ?';
      params.push(departmentId);
    } else if (requestedDepartmentId !== null) {
      if (!Number.isInteger(requestedDepartmentId) || requestedDepartmentId <= 0) {
        return sendResponse(res, 400, 'A valid department_id is required.', 'ትክክለኛ department_id ያስፈልጋል።');
      }
      query += ' WHERE ca.department_id = ?';
      params.push(requestedDepartmentId);
    }

    const statusScope = isDepartmentHead ? ' AND department_id = ?' : '';
    const statusParams = isDepartmentHead ? [departmentId] : [];
    await pool.query(
      `UPDATE course_assignments SET status = 'unassigned'
       WHERE instructor_id IS NULL AND staff_id IS NULL
         AND LOWER(COALESCE(status, '')) <> 'unassigned'${statusScope}`,
      statusParams
    );

    query += ' ORDER BY ca.created_at DESC';
    const [rows] = await pool.query(query, params);
    return sendResponse(res, 200, 'Course assignments retrieved.', 'የኮርስ ስራዎች ተመልሰዋል።', rows.map((row) => ({
      ...row,
      course_code: row.course_code || '',
      course_name: row.course_name || 'Unknown Course',
      instructor_name: row.instructor_name || null,
      section: row.section || '',
      semester: row.semester || '',
      status: row.normalized_status === 'unassigned' ? 'unassigned' : (row.status || 'Assigned'),
    })));
  } catch (error) {
    console.error('Course assignments fetch error:', error?.message || error);
    return sendResponse(res, 200, 'Course assignments unavailable; returning empty list.', 'ስራዎች አልተገኙም; ባዶ ዝርዝር ተመልሷል።', []);
  }
});

app.post('/api/courses/batch-assign', authenticate, authorizeRoles('dept_head', 'admin', 'college_dean'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { instructorId, courseIds, yearLevel, semester, section, programType } = req.body;
    const ids = Array.isArray(courseIds) ? [...new Set(courseIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))] : [];
    const callerDepartmentId = Number(req.user.department_id || req.body.departmentId || 0);
    if (!instructorId || !ids.length || !yearLevel || !semester || !section || !programType || !callerDepartmentId) {
      return res.status(400).json({ message: 'instructorId, courseIds, yearLevel, semester, section, and programType are required.' });
    }

    const [instructorRows] = await connection.query(
      `SELECT i.id, i.department_id, u.role FROM instructors i INNER JOIN users u ON u.id = i.user_id
       WHERE (i.id = ? OR i.user_id = ?) AND LOWER(u.role) IN ('instructor', 'dept_head', 'college_dean') AND LOWER(COALESCE(u.status, 'active')) = 'active' LIMIT 1`,
      [Number(instructorId), Number(instructorId)]
    );
    if (!instructorRows.length) return res.status(404).json({ message: 'Teaching staff member not found.' });

    const placeholders = ids.map(() => '?').join(', ');
    const [courseRows] = await connection.query(`SELECT id, department_id FROM courses WHERE id IN (${placeholders})`, ids);
    if (courseRows.length !== ids.length) return res.status(404).json({ message: 'One or more courses were not found.' });
    if (req.user.role === 'dept_head' && courseRows.some((course) => Number(course.department_id) !== callerDepartmentId)) {
      return res.status(403).json({ message: 'You can only assign courses from your department.' });
    }

    await connection.beginTransaction();
    for (const course of courseRows) {
      await connection.query(
        `INSERT INTO course_assignments (department_id, course_id, instructor_id, program_type, year_level, semester, section, is_published, is_student_published, is_peer_published, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'Assigned')`,
        [course.department_id, course.id, instructorRows[0].id, programType, yearLevel, semester, String(section).trim()]
      );
    }
    await connection.commit();
    return res.status(201).json({ success: true, assignedCount: courseRows.length });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Batch assignment rollback failed:', rollbackError); }
    console.error('Batch assignment failed:', error);
    return res.status(500).json({ message: 'Unable to save batch course assignments.', error: error.message });
  } finally {
    connection.release();
  }
});

app.post('/api/courses/batch-assign-matrix', authenticate, authorizeRoles('dept_head', 'admin', 'college_dean'), batchAssignMatrix);

app.post('/api/assignments/assign', authenticate, authorizeRoles('dept_head', 'admin', 'college_dean'), async (req, res) => {
  try {
    const { course_id, instructor_id, program_type, year_level, semester, section } = req.body;
    const normalizedSection = normalizeSectionValue(section);
    const departmentId = Number(req.user.department_id || req.body.department_id || 0);
    const courseId = Number(course_id);
    const instructorId = Number(instructor_id);
    if (!departmentId || !courseId || !instructorId || !program_type || !year_level || !semester || !normalizedSection) {
      return res.status(400).json({ message: 'All assignment fields are required.' });
    }

    const [courseRows] = await pool.query('SELECT id, department_id FROM courses WHERE id = ? LIMIT 1', [courseId]);
    const [instructorRows] = await pool.query(
      `SELECT i.id, i.department_id, u.role
       FROM instructors i INNER JOIN users u ON u.id = i.user_id
       WHERE (i.id = ? OR i.user_id = ?)
         AND LOWER(u.role) IN ('instructor', 'dept_head', 'college_dean')
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
       LIMIT 1`,
      [instructorId, instructorId]
    );
    if (!courseRows.length) return res.status(404).json({ message: 'Course not found.' });
    if (!instructorRows.length) return res.status(404).json({ message: 'Instructor not found.' });
    if (Number(courseRows[0].department_id) !== departmentId || Number(instructorRows[0].department_id) !== departmentId) {
      return res.status(403).json({ message: 'Course and instructor must belong to your department.' });
    }

    const [result] = await pool.query(
      `INSERT INTO course_assignments
        (department_id, course_id, instructor_id, program_type, year_level, semester, section, is_published, is_student_published, is_peer_published, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'Assigned')`,
      [departmentId, courseId, instructorRows[0].id, program_type, year_level, semester, normalizedSection]
    );
    return res.status(201).json({ id: result.insertId, message: 'Course assignment saved.' });
  } catch (error) {
    console.error('Assignment save failed:', error);
    return res.status(500).json({ message: 'Unable to save course assignment.' });
  }
});

const canManagePublishedDepartment = async (req, departmentId) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'academic_directorate' || role === 'academic_director' || role === 'directorate') return true;
  if (role === 'dept_head') {
    const claimedDepartmentId = Number(req.user?.department_id || req.user?.department || 0);
    if (claimedDepartmentId === departmentId) return true;
    const [[profile]] = await pool.query(
      `SELECT i.department_id
       FROM instructors i
       INNER JOIN users u ON u.id = i.user_id
       WHERE i.user_id = ? AND LOWER(u.role) IN ('dept_head', 'department_head')
       LIMIT 1`,
      [req.user.id]
    );
    return Number(profile?.department_id || 0) === departmentId;
  }
  if (role === 'college_dean' || role === 'dean') {
    const [[scope]] = await pool.query(
      `SELECT 1 FROM instructors i
       INNER JOIN departments d ON d.id = i.department_id
       WHERE i.user_id = ? AND d.college_id = (SELECT college_id FROM departments WHERE id = ? LIMIT 1)
       LIMIT 1`,
      [req.user.id, departmentId]
    );
    return Boolean(scope);
  }
  return false;
};

const isPeerPublicationActive = async (departmentId, academicYear, semester) => {
  const [[publication]] = await pool.query(
    `SELECT id
     FROM peer_evaluation_publications
     WHERE department_id = ? AND academic_year = ? AND semester = ? AND status = 'published'
     LIMIT 1`,
    [departmentId, academicYear, semester]
  );
  if (publication?.id) return true;

  const [[activeForm]] = await pool.query(
    `SELECT id
     FROM evaluation_forms
     WHERE department_id = ?
       AND academic_year = ?
       AND semester = ?
       AND LOWER(COALESCE(form_type, '')) IN ('peer', 'peer_evaluation')
       AND is_published = 1
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     LIMIT 1`,
    [departmentId, academicYear, semester]
  );
  return Boolean(activeForm?.id);
};

app.get(['/api/evaluations/publish-assignments', '/api/dept-head/publish-list'], authenticate, authorizeRoles('dept_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'admin'), async (req, res) => {
  try {
    const departmentId = await resolveDepartmentId(req.query.department || req.user.department_id || req.user.department);
    const requestedStaffType = String(req.query.staff_type || 'all').trim().toLowerCase();
    const staffType = ['instructor', 'lab_assistant'].includes(requestedStaffType) ? requestedStaffType : 'all';
    const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedLimit = Number.parseInt(req.query.limit, 10) || 10;
    const limit = [5, 10, 20, 50].includes(requestedLimit) ? requestedLimit : 10;
    if (!departmentId) return res.status(404).json({ message: 'Department was not found.' });
    if (!await canManagePublishedDepartment(req, departmentId)) return res.status(403).json({ message: 'You cannot manage evaluation publishing for this department.' });

    const filters = [
      ['program_type', 'ca.program_type'],
      ['year_level', 'ca.year_level'],
      ['semester', 'ca.semester'],
      ['section', 'ca.section'],
    ];
    const filterConditions = [];
    const filterParams = [];
    for (const [key, column] of filters) {
      const value = String(req.query[key] || '').trim();
      if (value) {
        filterConditions.push(`${column} = ?`);
        filterParams.push(value);
      }
    }
    const search = String(req.query.search || '').trim();
    if (search) {
      filterConditions.push(`(
        c.code LIKE ? OR c.name LIKE ?
        OR CONCAT(COALESCE(i.first_name, la.first_name, ''), ' ', COALESCE(i.last_name, la.last_name, '')) LIKE ?
        OR ca.program_type LIKE ? OR ca.year_level LIKE ? OR ca.semester LIKE ? OR ca.section LIKE ?
      )`);
      const searchTerm = `%${search}%`;
      filterParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }
    const whereClause = `ca.department_id = ?
      AND (? = 'all' OR CASE WHEN LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant' THEN 'lab_assistant' ELSE 'instructor' END = ?)
      ${filterConditions.map((condition) => `AND ${condition}`).join('\n      ')}`;
    const baseParams = [departmentId, staffType, staffType, ...filterParams];
    const paginationClause = hasPagination ? ' LIMIT ? OFFSET ?' : '';
    const queryParams = hasPagination
      ? [...baseParams, limit, (page - 1) * limit]
      : baseParams;
    const [courseRows] = await pool.query(
      `SELECT ca.id, ca.course_id, ca.instructor_id, ca.program_type, ca.year_level, ca.semester, ca.section,
        ca.staff_id, ca.assigned_role, ca.is_student_published, ca.is_peer_published,
        c.code AS course_code, c.name AS course_name,
        NULLIF(TRIM(CONCAT(COALESCE(i.first_name, la.first_name, ''), ' ', COALESCE(i.last_name, la.last_name, ''))), '') AS instructor_name,
        COALESCE(i.user_id, la.user_id, u.id) AS target_user_id,
        CASE WHEN LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant' THEN 'lab_assistant' ELSE 'instructor' END AS target_type,
        CASE WHEN LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant' THEN 'lab_assistant' ELSE 'instructor' END AS publish_role
       FROM course_assignments ca
       INNER JOIN courses c ON c.id = ca.course_id
       LEFT JOIN users u ON ca.instructor_id = u.id
       LEFT JOIN instructors i ON i.id = ca.instructor_id
       LEFT JOIN lab_assistants la ON LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant' AND la.id = ca.staff_id
       LEFT JOIN users staff_user ON staff_user.id = COALESCE(i.user_id, la.user_id)
       WHERE ${whereClause}
       ORDER BY ca.created_at DESC${paginationClause}`,
      queryParams
    );

    const rows = [
      ...courseRows.map((row) => ({
        ...row,
        type: row.target_type === 'lab_assistant' ? 'Lab Assistant' : 'Course / Instructor',
        target_role: row.target_type,
      })),
    ];

    if (hasPagination) {
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM course_assignments ca
         INNER JOIN courses c ON c.id = ca.course_id
         LEFT JOIN instructors i ON i.id = ca.instructor_id
         LEFT JOIN lab_assistants la ON LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant' AND la.id = ca.staff_id
         WHERE ${whereClause}`,
        baseParams
      );
      const totalItems = Number(total || 0);
      const totalPages = Math.max(1, Math.ceil(totalItems / limit));
      return res.json({
        success: true,
        data: {
          rows,
          pagination: { currentPage: Math.min(page, totalPages), itemsPerPage: limit, totalItems, totalPages },
        },
      });
    }

    return res.json(rows);
  } catch (error) {
    console.error('Publish assignments query failed:', error);
    return res.status(500).json({ message: 'Unable to load evaluation assignments.' });
  }
});

const getDeptHeadPublishableEvaluations = async (departmentId) => {
  const [courseRows] = await pool.query(
    `SELECT ca.id, ca.course_id, ca.instructor_id, ca.program_type, ca.year_level, ca.semester, ca.section,
      ca.is_student_published, ca.is_peer_published, c.code AS course_code, c.name AS course_name,
      TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS instructor_name,
      'course' AS target_type, 'instructor' AS publish_role
     FROM course_assignments ca
     INNER JOIN courses c ON c.id = ca.course_id
     INNER JOIN instructors i ON i.id = ca.instructor_id
     WHERE ca.department_id = ? ORDER BY ca.created_at DESC`,
    [departmentId]
  );

  const [labRows] = await pool.query(
    `SELECT la.id,
      NULL AS course_id,
      NULL AS instructor_id,
      NULL AS program_type,
      NULL AS year_level,
      NULL AS semester,
      NULL AS section,
      COALESCE(MAX(IF(ed.status = 'published', 1, 0)), 0) AS is_student_published,
      0 AS is_peer_published,
      'LAB' AS course_code,
      'Course: Department Lab / Practical Work' AS course_name,
      CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, '')) AS instructor_name,
      'lab_assistant' AS target_type,
      'lab_assistant' AS publish_role,
      la.user_id AS target_user_id,
      la.first_name AS target_first_name,
      la.last_name AS target_last_name,
      la.employee_id AS target_employee_id
     FROM lab_assistants la
     INNER JOIN users u ON u.id = la.user_id
     LEFT JOIN evaluation_dispatches ed ON ed.target_user_id = la.id AND ed.department_id = ? AND ed.evaluation_type = 'student' AND ed.status = 'published'
     WHERE la.department_id = ?
       AND LOWER(COALESCE(u.status, 'active')) = 'active'
     GROUP BY la.id
     ORDER BY la.first_name ASC, la.last_name ASC`,
    [departmentId, departmentId]
  );

  return [
    ...courseRows.map((row) => ({ ...row, type: 'Course / Instructor' })),
    ...labRows.map((row) => ({
      ...row,
      id: `lab-assistant-${row.id}`,
      course_code: 'LAB',
      course_name: 'Course: Department Lab / Practical Work',
      instructor_name: `Instructor/Staff: ${String(row.instructor_name || '').trim() || 'Lab Assistant'}`,
      type: 'Lab Assistant',
      target_role: 'lab_assistant',
    })),
  ];
};

app.get('/api/dept-head/publishable-evaluations', authenticate, authorizeRoles('dept_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'admin'), async (req, res) => {
  try {
    const departmentId = await resolveDepartmentId(req.query.department || req.user.department_id || req.user.department);
    if (!departmentId) return res.status(404).json({ message: 'Department was not found.' });
    if (!await canManagePublishedDepartment(req, departmentId)) return res.status(403).json({ message: 'You cannot manage evaluation publishing for this department.' });
    const rows = await getDeptHeadPublishableEvaluations(departmentId);
    return res.json(rows);
  } catch (error) {
    console.error('Publishable evaluations query failed:', error);
    return res.status(500).json({ message: 'Unable to load publishable evaluations.' });
  }
});

app.post('/api/evaluations/toggle-peer-publish', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    const requestedDepartmentId = Number(req.body?.department_id || req.user.department_id || req.user.department);
    const departmentId = req.user.role === 'dept_head' ? Number(req.user.department_id) : requestedDepartmentId;
    const publishStatus = Number(req.body?.publish_status);
    if (!Number.isInteger(departmentId) || departmentId <= 0) return res.status(400).json({ success: false, message: 'A valid department_id is required.' });
    if (![0, 1].includes(publishStatus)) return res.status(400).json({ success: false, message: 'publish_status must be 0 or 1.' });

    if (publishStatus === 1) {
      const [[existingPeerSession]] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM evaluation_dispatches ed
         WHERE ed.department_id = ?
           AND LOWER(COALESCE(ed.evaluation_type, '')) = 'peer'
           AND LOWER(COALESCE(ed.status, '')) = 'active'`,
        [departmentId]
      );
      if (Number(existingPeerSession?.total || 0) > 0) {
        return res.status(400).json({ success: false, isAlreadyPublished: true, message: 'Peer evaluations have already been published for this department.' });
      }
    } else {
      const [[submittedPeerEvaluation]] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM peer_evaluation_submissions pes
         INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
         INNER JOIN instructors target ON target.id = pe.evaluatee_id
         INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
         WHERE target.department_id = ?
           AND LOWER(COALESCE(ed.evaluation_type, '')) = 'peer'
           AND LOWER(COALESCE(ed.status, '')) = 'active'`,
        [departmentId]
      );
      if (Number(submittedPeerEvaluation?.total || 0) > 0) {
        return res.status(400).json({ success: false, message: 'Cannot unpublish because an instructor has already submitted a peer evaluation.' });
      }
    }

    const [result] = await pool.query(
      'UPDATE course_assignments SET is_peer_published = ?, is_published = IF(? = 1, 1, is_student_published), publish_target = CASE WHEN ? = 1 AND is_student_published = 1 THEN \'both\' WHEN ? = 1 THEN \'instructor\' WHEN is_student_published = 1 THEN \'student\' ELSE \'\' END WHERE department_id = ?',
      [publishStatus, publishStatus, publishStatus, publishStatus, departmentId]
    );
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('peer_evaluation_published', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
      [publishStatus === 1 ? 'true' : 'false']
    );
    await pool.query(
      "UPDATE system_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'peer_evaluation_status'",
      [publishStatus === 1 ? 'published' : 'unpublished']
    );
    return res.json({ success: true, department_id: departmentId, is_peer_published: publishStatus, updated: result.affectedRows });
  } catch (error) {
    console.error('Toggle peer publish failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to update peer publish status.', error: error.message });
  }
});

app.get('/api/evaluations/publish-statuses/:deptId', authenticate, authorizeRoles('dept_head', 'dean', 'college_dean', 'academic_directorate', 'academic_director', 'directorate', 'admin'), async (req, res) => {
  try {
    const requestedDepartmentId = Number(req.params.deptId);
    let callerDepartmentId = Number(req.user.department_id || req.user.departmentId);
    if (req.user.role === 'dept_head' && (!Number.isInteger(callerDepartmentId) || callerDepartmentId <= 0)) {
      const [[caller]] = await pool.query(
        `SELECT COALESCE(i.department_id, s.department_id) AS department_id
         FROM users u
         LEFT JOIN instructors i ON i.user_id = u.id
         LEFT JOIN students s ON s.user_id = u.id
         WHERE u.id = ? LIMIT 1`,
        [req.user.id]
      );
      callerDepartmentId = Number(caller?.department_id || 0);
    }
    const departmentId = req.user.role === 'dept_head' ? callerDepartmentId : requestedDepartmentId;
    if (!Number.isInteger(requestedDepartmentId) || requestedDepartmentId <= 0 || !Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({ success: false, message: 'A valid department_id is required.' });
    }
    if (!await canManagePublishedDepartment(req, departmentId)) return res.status(403).json({ success: false, message: 'You cannot view publishing status for this department.' });
    const academicYear = String(req.query.academic_year || new Date().getFullYear());
    const statusFilters = ['department_id = ?', 'academic_year = ?'];
    const statusParams = [departmentId, academicYear];
    [['program_type', req.query.program_type], ['year_level', req.query.year_level], ['semester', req.query.semester], ['section', normalizeSectionValue(req.query.section)]].forEach(([column, value]) => {
      if (value) { statusFilters.push(`LOWER(TRIM(${column})) = LOWER(TRIM(?))`); statusParams.push(value); }
    });
    const [[status]] = await pool.query(
      `SELECT COALESCE(MAX(is_student_published), 0) AS is_student_published,
              COALESCE(MAX(is_peer_published), 0) AS is_peer_published,
              EXISTS (
                SELECT 1 FROM peer_evaluations pe
                INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
                WHERE ed.department_id = ?
                  AND ed.evaluation_type = 'peer'
                  AND ed.status IN ('active', 'pending')
              ) AS has_peer_assignments
      FROM course_assignments WHERE ${statusFilters.join(' AND ')}`,
          [departmentId, ...statusParams]
    );
    const [[studentSubmission]] = await pool.query(
      `SELECT COUNT(DISTINCT ed.id) AS total_assignments,
              COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved') THEN ed.id END) AS completed_assignments
       FROM evaluation_dispatches ed
       LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
       WHERE ed.department_id = ? AND ed.evaluation_type = 'student'
         AND (ed.academic_year = ? OR ed.academic_year IS NULL)
         AND (ed.semester = ? OR ed.semester IS NULL)
        AND (? = '' OR ed.year_level = ?)
         AND ed.status IN ('pending', 'submitted')`,
      [departmentId, academicYear, req.query.semester || 'Semester I', req.query.year_level || '', req.query.year_level || '']
    );
    const studentEvaluationStarted = Number(studentSubmission?.completed_assignments || 0) > 0;
    const studentEvaluationFullyCompleted = Number(studentSubmission?.total_assignments || 0) > 0
      && Number(studentSubmission.completed_assignments) === Number(studentSubmission.total_assignments);
    return res.json({
      success: true,
      department_id: departmentId,
      is_student_published: Boolean(status?.is_student_published),
      is_peer_published: Boolean(status?.is_peer_published && status?.has_peer_assignments),
      studentEvaluationStarted,
      studentEvaluationFullyCompleted,
    });
  } catch (error) {
    console.error('Publish statuses query failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to load publish statuses.', error: error.message });
  }
});

const findPublishedEvaluationTerm = async (departmentId, yearLevel, semester, academicYear, programType = null, section = null, staffType = 'all') => {
  const filters = [
    'ca.department_id = ?',
    'ca.semester = ?',
    'ca.academic_year = ?',
    'ca.is_published = 1',
  ];
  const params = [departmentId, semester, academicYear];
  if (yearLevel) {
    filters.push(`REGEXP_REPLACE(LOWER(TRIM(COALESCE(ca.year_level, ''))), '[^0-9]', '') = REGEXP_REPLACE(LOWER(TRIM(?)), '[^0-9]', '')`);
    params.push(yearLevel);
  }
  if (programType) {
    filters.push('LOWER(TRIM(ca.program_type)) = LOWER(TRIM(?))');
    params.push(programType);
  }
  if (section) {
    filters.push("LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(REPLACE(REPLACE(?, 'Section ', ''), 'section ', '')))");
    params.push(section);
  }
  if (staffType !== 'all') {
    filters.push("CASE WHEN LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant' THEN 'lab_assistant' ELSE 'instructor' END = ?");
    params.push(staffType);
  }

  const [rows] = await pool.query(
    `SELECT ca.id
     FROM course_assignments ca
     WHERE ${filters.join(' AND ')}
     LIMIT 1`,
    params
  );
  return rows.length > 0;
};

const validateEvaluationPublishTerm = async (res, departmentId, yearLevel, semester, academicYear, programType = null, section = null, staffType = 'all') => {
  if (await findPublishedEvaluationTerm(departmentId, yearLevel, semester, academicYear, programType, section, staffType)) {
    res.status(400).json({ message: 'Evaluation form has already been published for this academic term.' });
    return false;
  }
  return true;
};

app.get('/api/evaluations/student-list', authenticate, authorizeRoles('student'), async (req, res) => {
  try {
    const departmentId = Number(req.user.department_id || req.query.department_id || 0);
    const yearLevel = String(req.query.year_level || req.query.year || '').trim();
    const semester = String(req.query.semester || '').trim();
    const academicYear = String(req.query.academic_year || new Date().getFullYear());
    if (!departmentId) return res.status(400).json({ message: 'Student department is not configured.' });
    const [rows] = await pool.query(
      `SELECT i.id AS instructor_id,
        CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS instructor_name,
        GROUP_CONCAT(DISTINCT c.code ORDER BY c.code SEPARATOR ', ') AS course_codes,
        COUNT(DISTINCT ca.course_id) AS course_count
       FROM course_assignments ca
       INNER JOIN instructors i ON i.id = ca.instructor_id
       INNER JOIN users u ON u.id = i.user_id AND LOWER(u.status) = 'active'
       INNER JOIN courses c ON c.id = ca.course_id
       WHERE ca.department_id = ?
         AND ca.is_published = 1
         AND (? = '' OR ca.year_level = ?)
         AND (? = '' OR ca.semester = ?)
         AND (? = '' OR ca.academic_year = ?)
       GROUP BY i.id, i.first_name, i.last_name
       ORDER BY instructor_name ASC`,
      [departmentId, yearLevel, yearLevel, semester, semester, academicYear, academicYear]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load student evaluation list.', error: error.message });
  }
});

app.post(['/api/evaluations/publish', '/api/evaluations/publish-student'], authenticate, authorizeRoles('dept_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'admin'), async (req, res) => {
  try {
    const { department_id, program_type, semester, section } = req.body;
    const requestedBatch = String(req.body.batchYear || '').trim();
    if (requestedBatch && !['3rd Year', '4th Year', 'All Batches'].includes(requestedBatch)) {
      return res.status(400).json({ success: false, message: 'batchYear must be 3rd Year, 4th Year, or All Batches.' });
    }
    const batchYear = ['3rd Year', '4th Year', 'All Batches'].includes(requestedBatch) ? requestedBatch : '';
    const year_level = batchYear && batchYear !== 'All Batches'
      ? batchYear
      : batchYear === 'All Batches'
        ? ''
        : String(req.body.year_level || '').trim();
    const requestedStaffType = String(req.body.staff_type || 'all').trim().toLowerCase();
    const staffType = ['instructor', 'lab_assistant'].includes(requestedStaffType) ? requestedStaffType : 'all';
    const departmentId = await resolveDepartmentId(department_id || req.user.department_id || req.user.department);
    if (!departmentId) return res.status(404).json({ message: 'Department was not found.' });
    if (!await canManagePublishedDepartment(req, departmentId)) return res.status(403).json({ message: 'You cannot publish evaluations for this department.' });
    const academicYear = String(req.body.academic_year || new Date().getFullYear());
    const duplicateFilters = ['ca.department_id = ?', 'ca.academic_year = ?', 'ca.is_student_published = 1'];
    const duplicateParams = [departmentId, academicYear];
    duplicateFilters.push("(? = 'all' OR CASE WHEN LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant' THEN 'lab_assistant' ELSE 'instructor' END = ?)");
    duplicateParams.push(staffType, staffType);
    [['ca.program_type', program_type], ['ca.semester', semester], ['ca.section', normalizeSectionValue(section)]].forEach(([column, value]) => {
      if (value) { duplicateFilters.push(`LOWER(TRIM(${column})) = LOWER(TRIM(?))`); duplicateParams.push(value); }
    });
    if (year_level) {
      duplicateFilters.push(`REGEXP_REPLACE(LOWER(TRIM(COALESCE(ca.year_level, ''))), '[^0-9]', '') = REGEXP_REPLACE(LOWER(TRIM(?)), '[^0-9]', '')`);
      duplicateParams.push(year_level);
    }
    const [[existingBatch]] = await pool.query(`SELECT COUNT(*) AS total FROM course_assignments ca WHERE ${duplicateFilters.join(' AND ')}`, duplicateParams);
    if (Number(existingBatch?.total || 0) > 0) {
      return res.status(400).json({ success: false, isAlreadyPublished: true, message: 'Evaluation form has already been published for this section/batch.' });
    }
    if (!await validateEvaluationPublishTerm(res, departmentId, year_level, semester, academicYear, program_type, section, staffType)) return;

    const filters = ['ca.department_id = ?', 'ca.academic_year = ?'];
    const params = [departmentId, academicYear];
    [['ca.program_type', program_type], ['ca.semester', semester], ['ca.section', normalizeSectionValue(section)]].forEach(([column, value]) => {
      if (value) { filters.push(`LOWER(TRIM(${column})) = LOWER(TRIM(?))`); params.push(value); }
    });
    if (year_level) {
      filters.push(`REGEXP_REPLACE(LOWER(TRIM(COALESCE(ca.year_level, ''))), '[^0-9]', '') = REGEXP_REPLACE(LOWER(TRIM(?)), '[^0-9]', '')`);
      params.push(year_level);
    }
    filters.push("(? = 'all' OR CASE WHEN LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant' THEN 'lab_assistant' ELSE 'instructor' END = ?)");
    params.push(staffType, staffType);
    const [assignments] = await pool.query(`SELECT ca.id, ca.course_id, ca.instructor_id, ca.staff_id, ca.assigned_role, ca.year_level, ca.semester, c.code AS course_code, c.name FROM course_assignments ca JOIN courses c ON c.id = ca.course_id WHERE ${filters.join(' AND ')}`, params);
    if (!assignments.length) {
      return res.status(404).json({ success: false, message: `No course assignments were found for ${batchYear || year_level || 'the selected'} target batch.` });
    }

    const [students] = await pool.query(
      `SELECT s.id, s.user_id, s.program_type, s.year_level, s.semester, s.section
       FROM students s
       WHERE s.department_id = ?
        AND (? = '' OR LOWER(TRIM(?)) IN ('all', 'all programs') OR LOWER(TRIM(s.program_type)) = LOWER(TRIM(?)))
        AND (? = '' OR LOWER(TRIM(?)) IN ('all', 'all years') OR REGEXP_REPLACE(LOWER(TRIM(s.year_level)), '[^0-9]', '') = REGEXP_REPLACE(LOWER(TRIM(?)), '[^0-9]', ''))
         AND (? = '' OR LOWER(TRIM(s.semester)) = LOWER(TRIM(?)))
        AND (? = '' OR LOWER(TRIM(?)) IN ('all', 'all sections') OR LOWER(TRIM(REPLACE(REPLACE(s.section, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(?)))`,
      [departmentId, program_type || '', program_type || '', program_type || '', year_level || '', year_level || '', year_level || '', semester || '', semester || '', normalizeSectionValue(section), normalizeSectionValue(section), normalizeSectionValue(section)]
    );

    const notificationUserIds = new Set();
    for (const assignment of assignments) {
      const isLabAssistant = String(assignment.assigned_role || '').toLowerCase() === 'lab_assistant';
      const [staffRows] = isLabAssistant
        ? await pool.query('SELECT user_id, first_name, last_name, employee_id FROM lab_assistants WHERE id = ? LIMIT 1', [assignment.staff_id])
        : await pool.query('SELECT user_id, first_name, last_name, employee_id FROM instructors WHERE id = ? LIMIT 1', [assignment.instructor_id]);
      const staff = staffRows[0];
      if (staff?.user_id) notificationUserIds.add(staff.user_id);
      await pool.query('UPDATE course_assignments SET is_published = 1, is_student_published = 1, publish_target = CASE WHEN is_peer_published = 1 THEN \'both\' ELSE \'student\' END WHERE id = ?', [assignment.id]);
      for (const student of students) {
        if (student.user_id) notificationUserIds.add(student.user_id);
        const dispatchValues = isLabAssistant
          ? [assignment.id, student.id, assignment.course_id, assignment.name, semester || assignment.semester || null, year_level || assignment.year_level || null, 'student', req.user.id, JSON.stringify({ source: 'student_publish', labAssistantId: assignment.staff_id }), departmentId, 'student', 'lab_assistant', assignment.staff_id, staff?.first_name || '', staff?.last_name || '', staff?.employee_id || '', assignment.course_code || null, program_type || null, academicYear]
          : [assignment.id, student.id, assignment.course_id, assignment.name, semester || assignment.semester || null, year_level || assignment.year_level || null, 'student', req.user.id, JSON.stringify({ source: 'student_publish' }), departmentId, 'student', null, null, null, null, null, null, assignment.course_code || null, program_type || null, academicYear];
        await pool.query(
          'INSERT INTO evaluation_dispatches (assignment_id, student_id, course_id, course_name, semester, year_level, student_group, created_by, payload, department_id, evaluation_type, target_type, target_user_id, target_first_name, target_last_name, target_employee_id, course_code, program_type, academic_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          dispatchValues
        );
      }
    }

    await createNotifications({ userIds: [...notificationUserIds], title: 'Evaluation form published', message: `A new ${academicYear} ${semester || ''} evaluation form is available.`, type: 'evaluation_published' });
    const publishedCount = assignments.length;
    return res.json({
      message: `Published student evaluations for ${publishedCount} target group(s).`,
      batchYear: batchYear || year_level || 'All Batches',
      publishedCount,
    });
  } catch (error) { console.error('Student evaluation publish failed:', error); return res.status(500).json({ message: 'Unable to publish student evaluations.' }); }
});

app.post('/api/dept-head/publish-student-evaluations', authenticate, authorizeRoles('dept_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'admin'), async (req, res) => {
  try {
    const { department_id, program_type, year_level, semester, section } = req.body;
    const departmentId = await resolveDepartmentId(department_id || req.user.department_id || req.user.department);
    if (!departmentId) return res.status(404).json({ message: 'Department was not found.' });
    if (!await canManagePublishedDepartment(req, departmentId)) return res.status(403).json({ message: 'You cannot publish evaluations for this department.' });

    const academicYear = String(req.body.academic_year || new Date().getFullYear());
    const duplicateFilters = ['ca.department_id = ?', 'ca.academic_year = ?', 'ca.is_student_published = 1'];
    const duplicateParams = [departmentId, academicYear];
    [['ca.program_type', program_type], ['ca.year_level', year_level], ['ca.semester', semester], ['ca.section', normalizeSectionValue(section)]].forEach(([column, value]) => {
      if (value) { duplicateFilters.push(`LOWER(TRIM(${column})) = LOWER(TRIM(?))`); duplicateParams.push(value); }
    });
    const [[existingBatch]] = await pool.query(`SELECT COUNT(*) AS total FROM course_assignments ca WHERE ${duplicateFilters.join(' AND ')}`, duplicateParams);
    if (Number(existingBatch?.total || 0) > 0) {
      return res.status(400).json({ success: false, isAlreadyPublished: true, message: 'Evaluation form has already been published for this section/batch.' });
    }
    if (!await validateEvaluationPublishTerm(res, departmentId, year_level, semester, academicYear, program_type, section)) return;

    const filters = ['ca.department_id = ?', 'ca.academic_year = ?'];
    const params = [departmentId, academicYear];
    [['ca.program_type', program_type], ['ca.year_level', year_level], ['ca.semester', semester], ['ca.section', normalizeSectionValue(section)]].forEach(([column, value]) => {
      if (value) { filters.push(`LOWER(TRIM(${column})) = LOWER(TRIM(?))`); params.push(value); }
    });
    const [assignments] = await pool.query(`SELECT ca.id, ca.course_id, ca.instructor_id, ca.year_level, ca.semester, c.code AS course_code, c.name FROM course_assignments ca JOIN courses c ON c.id = ca.course_id WHERE ${filters.join(' AND ')}`, params);

    const [students] = await pool.query(
      `SELECT s.id, s.user_id, s.program_type, s.year_level, s.semester, s.section
       FROM students s
       WHERE s.department_id = ?
        AND (? = '' OR LOWER(TRIM(?)) IN ('all', 'all programs') OR LOWER(TRIM(s.program_type)) = LOWER(TRIM(?)))
        AND (? = '' OR LOWER(TRIM(?)) IN ('all', 'all years') OR REGEXP_REPLACE(LOWER(TRIM(s.year_level)), '[^0-9]', '') = REGEXP_REPLACE(LOWER(TRIM(?)), '[^0-9]', ''))
         AND (? = '' OR LOWER(TRIM(s.semester)) = LOWER(TRIM(?)))
        AND (? = '' OR LOWER(TRIM(?)) IN ('all', 'all sections') OR LOWER(TRIM(REPLACE(REPLACE(s.section, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(?)))`,
      [departmentId, program_type || '', program_type || '', program_type || '', year_level || '', year_level || '', year_level || '', semester || '', semester || '', normalizeSectionValue(section), normalizeSectionValue(section), normalizeSectionValue(section)]
    );

    const [labAssistants] = await pool.query(
      `SELECT la.id, la.user_id, la.first_name, la.last_name, la.employee_id
       FROM lab_assistants la
       INNER JOIN users u ON u.id = la.user_id
       WHERE la.department_id = ?
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
       ORDER BY la.first_name ASC, la.last_name ASC`,
      [departmentId]
    );

    const notificationUserIds = new Set();
    for (const assignment of assignments) {
      const [[instructor]] = await pool.query('SELECT user_id FROM instructors WHERE id = ? LIMIT 1', [assignment.instructor_id]);
      if (instructor?.user_id) notificationUserIds.add(instructor.user_id);
      await pool.query('UPDATE course_assignments SET is_published = 1, is_student_published = 1, publish_target = CASE WHEN is_peer_published = 1 THEN \'both\' ELSE \'student\' END WHERE id = ?', [assignment.id]);
      for (const student of students) {
        if (student.user_id) notificationUserIds.add(student.user_id);
        await pool.query(
          'INSERT INTO evaluation_dispatches (assignment_id, student_id, course_id, course_name, semester, year_level, student_group, created_by, payload, department_id, evaluation_type, target_type, target_user_id, target_first_name, target_last_name, target_employee_id, course_code, program_type, academic_year, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'published\')',
          [
            assignment.id,
            student.id,
            assignment.course_id,
            assignment.name,
            semester || assignment.semester || null,
            year_level || assignment.year_level || null,
            'student',
            req.user.id,
            JSON.stringify({ source: 'dept_head_student_publish' }),
            departmentId,
            'student',
            null,
            null,
            null,
            null,
            null,
            assignment.course_code || null,
            program_type || null,
            academicYear,
          ]
        );
      }
    }

    for (const labAssistant of labAssistants) {
      if (labAssistant.user_id) notificationUserIds.add(labAssistant.user_id);
      // Add all students in department to notification list for lab assistant publish
      for (const student of students) {
        if (student.user_id) notificationUserIds.add(student.user_id);
      }

      const [[existingLabDispatch]] = await pool.query(
        `SELECT id
         FROM evaluation_dispatches
         WHERE department_id = ?
           AND target_type = 'lab_assistant'
           AND target_user_id = ?
           AND evaluation_type = 'student'
           AND academic_year = ?
           AND semester = ?
           AND program_type = 'ALL'
           AND year_level = 'ALL'
           AND section = 'ALL'
         LIMIT 1`,
        [departmentId, labAssistant.id, academicYear, semester || null]
      );

      if (!existingLabDispatch) {
        await pool.query(
          `INSERT INTO evaluation_dispatches (
            department_id, course_code, course_name, academic_year, semester,
            year_level, section, program_type, student_group, created_by, payload, evaluation_type, status, target_type, target_user_id,
            target_first_name, target_last_name, target_employee_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 'lab_assistant', ?, ?, ?, ?)
          `,
          [
            departmentId,
            'LAB',
            'Course: Department Lab / Practical Work',
            academicYear,
            semester || null,
            'ALL',
            'ALL',
            'ALL',
            'student',
            req.user.id,
            JSON.stringify({ source: 'dept_head_student_publish_lab_assistant', labAssistantId: labAssistant.id }),
            'student',
            labAssistant.id,
            labAssistant.first_name || '',
            labAssistant.last_name || '',
            labAssistant.employee_id || '',
          ]
        );
      }
    }

    await createNotifications({ userIds: [...notificationUserIds], title: 'Evaluation form published', message: `A new ${academicYear} ${semester || ''} evaluation form is available.`, type: 'evaluation_published' });
    return res.status(200).json({ success: true, message: `Published student evaluations for ${assignments.length + labAssistants.length} target group(s).` });
  } catch (error) {
    console.error('Dept-head student evaluation publish failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to publish student evaluations.' });
  }
});

app.post('/api/evaluations/student/unpublish', authenticate, authorizeRoles('dept_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'admin'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { department_id, program_type, year_level, semester, section } = req.body;
    const departmentId = await resolveDepartmentId(department_id || req.user.department_id || req.user.department);
    const academicYear = String(req.body.academic_year || new Date().getFullYear());
    if (!departmentId) return res.status(404).json({ message: 'Department was not found.' });
    if (!await canManagePublishedDepartment(req, departmentId)) return res.status(403).json({ message: 'You cannot unpublish evaluations for this department.' });

    const filters = ['ca.department_id = ?', 'ca.academic_year = ?', 'ca.is_student_published = 1'];
    const params = [departmentId, academicYear];
    [['ca.program_type', program_type], ['ca.year_level', year_level], ['ca.semester', semester], ['ca.section', normalizeSectionValue(section)]].forEach(([column, value]) => {
      if (value) { filters.push(`LOWER(TRIM(${column})) = LOWER(TRIM(?))`); params.push(value); }
    });
    const [assignments] = await connection.query(`SELECT id FROM course_assignments ca WHERE ${filters.join(' AND ')}`, params);
    if (!assignments.length) return res.status(404).json({ message: 'No published student evaluation batch found.' });
    const assignmentIds = assignments.map((assignment) => assignment.id);
    const placeholders = assignmentIds.map(() => '?').join(', ');
    const [[progress]] = await connection.query(
      `SELECT COUNT(DISTINCT ed.id) AS total_assignments,
              COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved') THEN ed.id END) AS completed_assignments
       FROM evaluation_dispatches ed
       LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
       WHERE ed.assignment_id IN (${placeholders})`,
      assignmentIds
    );
    const studentHasStarted = Number(progress?.completed_assignments || 0) > 0;
    const studentFullyCompleted = Number(progress?.total_assignments || 0) > 0
      && Number(progress.completed_assignments) === Number(progress.total_assignments);
    if (studentHasStarted && !studentFullyCompleted) {
      return res.status(400).json({ success: false, hasStarted: true, fullyCompleted: false, message: 'Cannot unpublish because student evaluations are in progress. Wait until all student evaluations are completed.' });
    }

    await connection.beginTransaction();
    await connection.query(
      `UPDATE evaluation_dispatches
       SET status = 'closed'
       WHERE assignment_id IN (${placeholders})`,
      assignmentIds
    );
    await connection.query(
      `DELETE ed FROM evaluation_dispatches ed
       WHERE ed.assignment_id IN (${placeholders})
         AND NOT EXISTS (
           SELECT 1 FROM student_evaluation_submissions ses
           WHERE ses.dispatch_id = ed.id
         )`,
      assignmentIds
    );
    await connection.query(`UPDATE course_assignments SET is_student_published = 0, is_published = IF(is_peer_published = 1, 1, 0), publish_target = IF(is_peer_published = 1, 'instructor', '') WHERE id IN (${placeholders})`, assignmentIds);
    await connection.commit();
    return res.json({ success: true, message: 'Student evaluation form unpublished successfully.' });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Student unpublish rollback failed:', rollbackError); }
    return res.status(500).json({ message: 'Unable to unpublish student evaluations.', error: error.message });
  } finally { connection.release(); }
});

app.post('/api/evaluations/publish-instructor', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    const { department_id, program_type, year_level, semester, section } = req.body;
    const departmentId = await resolveDepartmentId(department_id || req.user.department_id || req.user.department);
    if (!departmentId) return res.status(404).json({ message: 'Department was not found.' });
    const academicYear = String(req.body.academic_year || new Date().getFullYear());
    if (!await validateEvaluationPublishTerm(res, departmentId, year_level, semester, academicYear, program_type, section)) return;
    const filters = ['ca.department_id = ?', 'ca.academic_year = ?'];
    const params = [departmentId, academicYear];
    [['ca.program_type', program_type], ['ca.year_level', year_level], ['ca.semester', semester], ['ca.section', normalizeSectionValue(section)]].forEach(([column, value]) => { if (value) { filters.push(`LOWER(TRIM(${column})) = LOWER(TRIM(?))`); params.push(value); } });
    const [assignments] = await pool.query(`SELECT id, course_id, instructor_id FROM course_assignments ca WHERE ${filters.join(' AND ')}`, params);
    const evaluatorUserIds = new Set();
    for (const assignment of assignments) {
      await pool.query('UPDATE course_assignments SET is_published = 1, is_peer_published = 1, publish_target = CASE WHEN is_student_published = 1 THEN \'both\' ELSE \'instructor\' END WHERE id = ?', [assignment.id]);
      const [peers] = await pool.query('SELECT id, user_id FROM instructors WHERE department_id = ? AND id <> ?', [departmentId, assignment.instructor_id]);
      for (const peer of peers) {
        evaluatorUserIds.add(peer.user_id);
        await pool.query('INSERT IGNORE INTO peer_evaluations (evaluator_id, evaluatee_id, course_id, status) VALUES (?, ?, ?, \'pending\')', [peer.id, assignment.instructor_id, assignment.course_id]);
      }
    }
    if (evaluatorUserIds.size) {
      await createNotifications({
        userIds: [...evaluatorUserIds],
        title: 'Instructor Evaluation Published',
        message: 'A new instructor peer evaluation is available. Please complete your assigned evaluation.',
        type: 'peer_evaluation',
      });
    }
    return res.json({ message: `Published instructor evaluations for ${assignments.length} assignments.` });
  } catch (error) { console.error('Instructor evaluation publish failed:', error); return res.status(500).json({ message: 'Unable to publish instructor evaluations.' }); }
});

app.get('/api/instructor/assigned-courses', authenticate, authorizeRoles('instructor', 'dept_head', 'admin'), async (req, res) => {
  try {
    const userId = req.user.role === 'instructor' ? req.user.id : Number(req.query.instructor_id || req.query.user_id || req.user.id);
    const [rows] = await pool.query(
      `SELECT ca.id, ca.course_id, c.code AS course_code, c.name AS course_name, ca.department_id, ca.program_type, ca.year_level, ca.semester, ca.section, ca.is_published, ca.status
       FROM course_assignments ca
       LEFT JOIN courses c ON c.id = ca.course_id
       WHERE ca.instructor_id = ? AND ca.is_published = 1
       ORDER BY ca.created_at DESC`,
      [userId]
    );

    return sendResponse(res, 200, 'Instructor assignments retrieved.', 'የመምህራን ስራዎች ተመልሰዋል።', rows);
  } catch (error) {
    console.error('Instructor assignments fetch error:', error?.message || error);
    return sendResponse(res, 200, 'Instructor assignments unavailable; returning empty list.', 'የመምህራን ስራዎች አልተገኙም።', []);
  }
});

app.get(['/api/instructor/peer-evaluations', '/api/peer-evaluations/assigned', '/api/evaluations/peer-list-for-instructor', '/api/evaluations/peers'], authenticate, authorizeRoles('instructor', 'lab_assistant', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'admin'), async (req, res) => {
  try {
    const instructorIdParam = Number(req.query.instructor_id || req.query.user_id || 0);
    let evaluatorId = 0;
    let evaluatorUserId = Number(req.user?.id || 0);

    if (instructorIdParam) {
      const [userRows] = await pool.query(
        'SELECT id, user_id FROM instructors WHERE id = ? OR user_id = ? LIMIT 1',
        [instructorIdParam, instructorIdParam]
      );
      evaluatorId = Number(userRows[0]?.id || 0);
      evaluatorUserId = Number(userRows[0]?.user_id || 0);
    }

    if (!evaluatorId && evaluatorUserId) {
      const [[profile]] = await pool.query(
        'SELECT id FROM instructors WHERE user_id = ? LIMIT 1',
        [evaluatorUserId]
      );
      evaluatorId = Number(profile?.id || 0);
    }

    if (!evaluatorId) {
      return res.status(400).json({ success: false, message: 'Instructor ID is required.' });
    }

    const [[evaluatorProfile]] = await pool.query(
      'SELECT department_id FROM instructors WHERE id = ? LIMIT 1',
      [evaluatorId]
    );
    const academicYear = String(req.query.academic_year || new Date().getFullYear());
    const semester = String(req.query.semester || 'Semester I');
    if (!evaluatorProfile?.department_id || !await isPeerPublicationActive(evaluatorProfile.department_id, academicYear, semester)) {
      return res.json({ success: true, pendingCount: 0, evaluations: [], isPublished: false, message: 'Peer evaluation is not currently published.' });
    }

    console.log('Fetching peer evaluations for evaluator instructor_id:', evaluatorId);

    await pool.query(
      `INSERT IGNORE INTO peer_evaluations
        (evaluator_id, evaluatee_id, course_id, dispatch_id, deadline, status)
             SELECT evaluator.id, target.id, NULL, dispatch.id, dispatch.deadline, 'pending'
      FROM instructors evaluator
       INNER JOIN instructors target ON target.department_id = evaluator.department_id
       INNER JOIN users target_user ON target_user.id = target.user_id
       INNER JOIN evaluation_dispatches dispatch
         ON dispatch.department_id = evaluator.department_id
        AND dispatch.evaluation_type = 'peer'
        AND dispatch.academic_year = ?
        AND dispatch.semester = ?
        AND dispatch.status = 'active'
       WHERE evaluator.id = ?
         AND target.id <> evaluator.id
         AND LOWER(COALESCE(target_user.status, 'active')) = 'active'
         AND LOWER(TRIM(target_user.role)) IN (
           'instructor', 'dept_head', 'department_head', 'depthead',
           'college_dean', 'dean', 'lab_assistant',
           'academic_director', 'academic_directorate', 'directorate'
         )
         AND NOT EXISTS (
           SELECT 1 FROM peer_evaluations existing
           WHERE existing.evaluator_id = evaluator.id
             AND existing.evaluatee_id = target.id
             AND existing.course_id IS NULL
         )
      ORDER BY dispatch.id DESC`,
      [academicYear, semester, evaluatorId]
    );

    const [rows] = await pool.query(
      `SELECT
        pe.id,
        pe.id AS peer_evaluation_id,
        i.id AS evaluatee_id,
        i.id AS instructor_id,
        pe.course_id,
        CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS instructor_name,
        u.email,
        LOWER(u.role) AS instructor_role,
        CASE
          WHEN LOWER(u.role) IN ('dept_head', 'department_head', 'depthead') THEN 'dept_head'
          WHEN LOWER(u.role) IN ('college_dean', 'dean') THEN 'college_dean'
          ELSE 'instructor'
        END AS target_role,
        c.code AS course_code,
        c.name AS course_name,
        COALESCE(NULLIF(pe.deadline, ''), DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%Y-%m-%d')) AS deadline,
        CASE WHEN pes.id IS NULL THEN 'pending' ELSE 'completed' END AS status,
        CASE
          WHEN pes.score IS NULL THEN NULL
          WHEN pes.score <= 5 THEN ROUND(pes.score * 20, 2)
          ELSE ROUND(pes.score, 2)
        END AS raw_score,
        CASE
          WHEN pes.score IS NULL THEN NULL
          WHEN pes.score <= 5 THEN ROUND(pes.score * 4, 2)
          ELSE ROUND(pes.score * 0.20, 2)
        END AS weighted_score,
        CASE
          WHEN pes.score IS NULL THEN NULL
          WHEN pes.score <= 5 THEN ROUND(pes.score * 20, 2)
          ELSE ROUND(pes.score, 2)
        END AS total_score,
        pes.strengths,
        pes.suggestions,
        pes.responses,
        pes.status AS submission_status,
        pes.id AS submission_id,
        CASE WHEN pes.id IS NOT NULL THEN 1 ELSE 0 END AS is_evaluated,
        'instructor' AS target_type
       FROM instructors evaluator
       INNER JOIN instructors i ON i.department_id = evaluator.department_id
       INNER JOIN users u ON u.id = i.user_id
       LEFT JOIN peer_evaluations pe
         ON pe.evaluator_id = evaluator.id
        AND pe.evaluatee_id = i.id
        AND pe.course_id IS NULL
        AND LOWER(TRIM(pe.status)) IN ('pending', 'active', 'submitted')
      LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
       AND pes.evaluator_id = ?
       LEFT JOIN courses c ON pe.course_id = c.id
       WHERE evaluator.id = ?
         AND i.id <> evaluator.id
         AND pe.id IS NOT NULL
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
         AND LOWER(TRIM(u.role)) IN (
           'instructor', 'dept_head', 'department_head', 'depthead',
           'college_dean', 'dean', 'lab_assistant',
           'academic_director', 'academic_directorate', 'directorate'
         )
       ORDER BY instructor_name ASC`,
      [evaluatorUserId, evaluatorId]
    );

    const normalized = rows.map(row => ({
      ...row,
      raw_score: row.raw_score === null ? null : Number(row.raw_score),
      weighted_score: row.weighted_score === null ? null : Number(row.weighted_score),
      total_score: row.total_score === null ? null : Number(row.total_score),
      is_evaluated: Boolean(row.is_evaluated),
      responses: row.responses ? (typeof row.responses === 'string' ? JSON.parse(row.responses) : row.responses) : {},
    }));

    const pendingCount = normalized.reduce((count, row) => count + (row.status === 'pending' ? 1 : 0), 0);
    return res.status(200).json({
      success: true,
      pendingCount,
      evaluations: normalized,
      isPublished: normalized.length > 0,
    });
  } catch (err) {
    console.error('Peer Evaluations SQL Error:', err?.message || err);
    return res.status(500).json({ success: false, pendingCount: 0, evaluations: [], message: 'Unable to load peer evaluations.', error: err?.message });
  }
});

app.get('/api/peer-evaluations/targets', authenticate, authorizeRoles('instructor', 'lab_assistant', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'admin'), async (req, res) => {
  try {
    const currentUserId = Number(req.user?.id || 0);
    let departmentId = Number(req.user?.department_id || req.query.department_id || 0);

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }

    if (!departmentId) {
      const [[profile]] = await pool.query(
        `SELECT COALESCE(i.department_id, la.department_id) AS department_id
         FROM users u
         LEFT JOIN instructors i ON i.user_id = u.id
         LEFT JOIN lab_assistants la ON la.user_id = u.id
         WHERE u.id = ?
         LIMIT 1`,
        [currentUserId]
      );
      departmentId = Number(profile?.department_id || 0);
    }

    if (!departmentId) {
      return res.status(400).json({ success: false, message: 'Department is not assigned for this user.' });
    }

    const [rows] = await pool.query(
      `SELECT
         i.id AS target_instructor_id,
         u.id AS user_id,
         CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS name,
         u.email,
         LOWER(TRIM(COALESCE(u.role, ''))) AS role,
         COALESCE(NULLIF(d.department_name, ''), d.name) AS department_name,
         CASE WHEN pe.id IS NOT NULL THEN 'Completed' ELSE 'Pending' END AS status,
         pe.id AS evaluation_id,
         pe.total_score
       FROM instructors i
       INNER JOIN users u ON u.id = i.user_id
       LEFT JOIN departments d ON d.id = i.department_id
       LEFT JOIN peer_evaluations pe
         ON pe.evaluator_id = ?
        AND pe.evaluatee_id = i.id
        AND pe.course_id IS NULL
       WHERE i.department_id = ?
         AND u.id <> ?
         AND LOWER(COALESCE(u.status, 'active')) = 'active'
         AND LOWER(TRIM(u.role)) IN (
           'instructor', 'dept_head', 'department_head', 'depthead',
           'college_dean', 'dean', 'lab_assistant',
           'academic_director', 'academic_directorate', 'directorate'
         )
       ORDER BY name ASC`,
      [currentUserId, departmentId, currentUserId]
    );

    return res.json({
      success: true,
      targets: rows.map((row) => ({
        id: row.target_instructor_id,
        target_instructor_id: row.target_instructor_id,
        user_id: row.user_id,
        name: row.name || row.email || 'Unknown',
        email: row.email,
        role: row.role,
        department_name: row.department_name || 'N/A',
        evaluation_id: row.evaluation_id || null,
        total_score: row.total_score != null ? Number(row.total_score) : 0,
        status: String(row.status || 'Pending').toLowerCase() === 'completed' ? 'Completed' : 'Pending',
      })),
      count: rows.length,
    });
  } catch (error) {
    console.error('Peer evaluation targets fetch error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Unable to load peer evaluation targets.', error: error?.message || 'Unknown error' });
  }
});

app.get('/api/student/assigned-courses', authenticate, authorizeRoles('student'), async (req, res) => {
  try {
    const [studentRows] = await pool.query('SELECT department_id, year_level, semester, section FROM students WHERE user_id = ? LIMIT 1', [req.user.id]);
    if (!studentRows.length) {
      return sendResponse(res, 200, 'Student record not found.', 'የተማሪ መረጃ አልተገኘም።', []);
    }

    const student = studentRows[0];
    const normalizedSection = normalizeSectionValue(student.section);
    const [rows] = await pool.query(
      `SELECT ca.id, ca.course_id, c.code AS course_code, c.name AS course_name, ca.department_id, ca.program_type, ca.year_level, ca.semester, ca.section, ca.is_student_published, ca.is_peer_published, ca.status
       FROM course_assignments ca
       LEFT JOIN courses c ON c.id = ca.course_id
       WHERE ca.department_id = ?
         AND ca.year_level = ?
         AND ca.semester = ?
         AND LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section ', ''), 'section ', ''))) = LOWER(?)
         AND ca.is_student_published = 1
       ORDER BY c.code ASC`,
      [student.department_id, student.year_level, student.semester, normalizedSection]
    );

    return sendResponse(res, 200, 'Student assignments retrieved.', 'የተማሪ ስራዎች ተመልሰዋል።', rows);
  } catch (error) {
    console.error('Student assignments fetch error:', error?.message || error);
    return sendResponse(res, 200, 'Student assignments unavailable; returning empty list.', 'የተማሪ ስራዎች አልተገኙም።', []);
  }
});

app.post('/api/course-assignments', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    const {
      course_id,
      instructor_id,
      program_type,
      year_level,
      semester,
      section,
      publish_target = 'both',
    } = req.body;

    const normalizedSection = normalizeSectionValue(section);
    if (!course_id || !instructor_id || !program_type || !year_level || !semester || !normalizedSection) {
      return sendResponse(res, 400, 'course_id, instructor_id, program_type, year_level, semester, and section are required.', 'course_id፣ instructor_id፣ program_type፣ year_level፣ semester እና section ያስፈልጋሉ።');
    }

    const departmentId = req.user.department_id || null;
    const [courseRows] = await pool.query('SELECT department_id, name FROM courses WHERE id = ? LIMIT 1', [course_id]);
    if (!courseRows.length) {
      return sendResponse(res, 404, 'Course not found.', 'ኮርስ አልተገኘም።');
    }

    if (departmentId && courseRows[0].department_id !== departmentId) {
      return sendResponse(res, 403, 'Course must belong to your department.', 'ኮርሱ የየትም ክፍልዎ መሆን አለበት።');
    }

    const publishTargetValue = normalizePublishTarget(publish_target);
    const isPublishedValue = publishTargetValue ? 1 : 0;
    const isStudentPublished = publishTargetValue === 'student' || publishTargetValue === 'both' ? 1 : 0;
    const isPeerPublished = publishTargetValue === 'instructor' || publishTargetValue === 'both' ? 1 : 0;

    const [result] = await pool.query(
      'INSERT INTO course_assignments (course_id, department_id, instructor_id, program_type, year_level, semester, section, publish_target, is_published, is_student_published, is_peer_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [course_id, departmentId, instructor_id, program_type, year_level, semester, normalizedSection, publishTargetValue, isPublishedValue, isStudentPublished, isPeerPublished]
    );

    return sendResponse(res, 201, 'Course assignment saved successfully!', 'የኮርስ ምውጫ በተሳካ ሁኔታ ተቀምጧል።', { id: result.insertId, publish_target: publishTargetValue, section: normalizedSection });
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, 'Unable to create assignment.', 'ስራ ለመፍጠር አልተቻለም።');
  }
});

app.post('/api/dept-head/assign-course', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    console.log('Incoming Assign Payload:', req.body);
    const {
      course_id,
      instructor_id,
      department_id,
      program_type,
      year_level,
      semester,
      section,
      publish_target = 'both',
      is_published,
      academic_year,
    } = req.body;
    const normalizedSection = normalizeSectionValue(section);
    const departmentIdFromBody = Number(department_id);
    const courseIdNum = Number(course_id);
    const instructorIdNum = Number(instructor_id);
    const publishedVal = is_published ? 1 : 0;
    const publishTargetValue = normalizePublishTarget(publish_target);
    const acYear = typeof academic_year === 'string' && academic_year.trim() ? academic_year.trim() : '2026';

    if (!Number.isInteger(courseIdNum) || courseIdNum <= 0 || !Number.isInteger(instructorIdNum) || instructorIdNum <= 0 || !program_type || !year_level || !semester || !normalizedSection) {
      return sendResponse(res, 400, 'course_id, instructor_id, program_type, year_level, semester, and section are required and must be valid.', 'course_id፣ instructor_id፣ program_type፣ year_level፣ semester እና section ያስፈልጋሉ እና ትክክለኛ መሆን አለባቸው።');
    }

    let departmentId = Number(departmentIdFromBody) || Number(req.user.department_id) || null;
    const [courseRows] = await pool.query('SELECT department_id, code, name FROM courses WHERE id = ? LIMIT 1', [courseIdNum]);
    if (!courseRows.length) {
      return sendResponse(res, 404, 'Course not found.', 'ኮርስ አልተገኘም።');
    }

    if (!departmentId) {
      departmentId = courseRows[0].department_id || null;
    }

    if (!departmentId) {
      return sendResponse(res, 400, 'department_id is required.', 'department_id ያስፈልጋል።');
    }

    if (courseRows[0].department_id !== departmentId) {
      return sendResponse(res, 403, 'Course must belong to your department.', 'ኮርሱ የየትም ክፍልዎ መሆን አለበት።');
    }

    const [instructorRows] = await pool.query(
      'SELECT id, user_id FROM instructors WHERE id = ? OR user_id = ? LIMIT 1',
      [instructorIdNum, instructorIdNum]
    );
    if (!instructorRows.length) {
      return sendResponse(res, 404, 'Instructor record not found.', 'የመምህር መዝገብ አልተገኘም።');
    }

    const instructorRecordId = instructorRows[0].id;
    const isStudentPublished = publishTargetValue === 'student' || publishTargetValue === 'both' ? 1 : 0;
    const isPeerPublished = publishTargetValue === 'instructor' || publishTargetValue === 'both' ? 1 : 0;

    const [result] = await pool.query(
      'INSERT INTO course_assignments (department_id, course_id, instructor_id, program_type, year_level, semester, section, publish_target, is_published, is_student_published, is_peer_published, academic_year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [departmentId, courseIdNum, instructorRecordId, program_type, year_level, semester, normalizedSection, publishTargetValue, publishedVal, isStudentPublished, isPeerPublished, acYear]
    );

    if (publishedVal === 1) {
      if (publishTargetValue !== 'instructor') {
        let [studentRows] = await pool.query(
          `SELECT id, user_id FROM students s
           WHERE s.department_id = ?
             AND (
               LOWER(TRIM(s.program_type)) = LOWER(TRIM(?))
               OR s.program_type IS NULL
               OR ? IS NULL
               OR ? = ''
               OR LOWER(?) = 'all'
             )
             AND (
               REGEXP_REPLACE(LOWER(s.year_level), '[^0-9]', '') = REGEXP_REPLACE(LOWER(?), '[^0-9]', '')
               OR s.year_level IS NULL
               OR ? IS NULL
               OR ? = ''
               OR LOWER(?) = 'all'
             )
             AND (
               LOWER(TRIM(s.semester)) = LOWER(TRIM(?))
               OR s.semester IS NULL
               OR ? IS NULL
               OR ? = ''
               OR LOWER(?) = 'all'
             )
             AND (
               LOWER(TRIM(s.section)) = LOWER(TRIM(?))
               OR s.section IS NULL
               OR ? IS NULL
               OR ? = ''
               OR LOWER(?) = 'all'
             )`,
          [departmentId, program_type, program_type, program_type, program_type,
           year_level, year_level, year_level, year_level, year_level,
           semester, semester, semester, semester, semester,
           normalizedSection, normalizedSection, normalizedSection, normalizedSection, normalizedSection]
        );

        console.log(`[Assign Course Success] Creating dispatches for ${studentRows.length} students.`);

        for (const student of studentRows) {
          try {
            await pool.query(
              'INSERT INTO evaluation_dispatches (assignment_id, template_id, student_id, student_identifier, course_id, course_name, academic_year, semester, year_level, student_group, created_by, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [result.insertId, null, student.id, null, courseIdNum, courseRows[0].name || '', acYear, semester, year_level, 'student', req.user.id, JSON.stringify({ source: 'course_publish' })]
            );
          } catch (dispatchError) {
            console.warn('Failed to dispatch student evaluation for student', student.id, dispatchError.message || dispatchError);
          }
        }
      }

      if (publishTargetValue !== 'student') {
        await pool.query(`CREATE TABLE IF NOT EXISTS peer_evaluations (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          evaluator_id INT UNSIGNED NOT NULL,
          evaluatee_id INT UNSIGNED DEFAULT NULL,
          course_id INT UNSIGNED DEFAULT NULL,
          deadline VARCHAR(64) DEFAULT '2026-08-17',
          status ENUM('pending', 'submitted') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        const [courseIdColumn] = await pool.query("SHOW COLUMNS FROM peer_evaluations LIKE 'course_id'");
        if (!courseIdColumn.length) {
          await pool.query('ALTER TABLE peer_evaluations ADD COLUMN course_id INT UNSIGNED DEFAULT NULL');
        }

        console.log('Dispatching to instructors strictly by department_id...');
        const [peerRows] = await pool.query(
          'SELECT id FROM instructors WHERE department_id = ? AND id != ?',
          [departmentId, instructorRecordId]
        );
        console.log(`Found ${peerRows.length} peer instructors in department ${departmentId}`);
        for (const peer of peerRows) {
          if (!peer.id) continue;
          await pool.query(
            'INSERT INTO peer_evaluations (evaluator_id, evaluatee_id, course_id, status) VALUES (?, ?, ?, ?)',
            [peer.id, instructorRecordId, courseIdNum, 'pending']
          );
        }
      }
    }

    return sendResponse(res, 200, 'Course assigned successfully', 'የኮርስ ምውጫ በተሳካ ሁኔታ ተደርጓል።', { id: result.insertId });
  } catch (err) {
    console.log('Incoming Assign Payload:', req.body);
    console.error('CRITICAL BACKEND ERROR ON ASSIGN COURSE:');
    console.error('SQL Message:', err.sqlMessage || err.message);
    console.error('Full Error Stack:', err);
    return res.status(500).json({ error: 'Unable to create department assignment.', details: err.sqlMessage || err.message });
  }
});

app.get('/api/evaluations', async (req, res) => {
  try {
    const query = `SELECT e.id, e.assignment_id, e.score, e.feedback, e.status, e.created_at, e.updated_at,
      ca.course_code, ca.course_name, ca.assignment_title,
      COALESCE(
        CONCAT(i.first_name, ' ', i.last_name),
        CONCAT(s.first_name, ' ', s.last_name),
        u.email,
        s.student_id
      ) AS evaluator_name
      FROM evaluations e
      LEFT JOIN course_assignments ca ON e.assignment_id = ca.id
      LEFT JOIN users u ON e.evaluator_id = u.id
      LEFT JOIN instructors i ON i.user_id = u.id
      LEFT JOIN students s ON s.user_id = u.id
      ORDER BY e.created_at DESC`;
    const [rows] = await pool.query(query);
    return sendResponse(res, 200, 'Evaluations retrieved.', 'ግምገማዎች ተመልሰዋል።', rows);
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, 'Unable to retrieve evaluations.', 'ግምገማዎችን ማግኘት አልተቻለም።');
  }
});

app.post('/api/evaluations', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    const { assignment_id, score, feedback = '', status = 'submitted' } = req.body;

    if (!assignment_id || score === undefined) {
      return sendResponse(res, 400, 'assignment_id and score are required.', 'assignment_id እና score ያስፈልጋሉ።');
    }

    const [assignmentRows] = await pool.query('SELECT * FROM course_assignments WHERE id = ? LIMIT 1', [assignment_id]);
    if (!assignmentRows.length) {
      return sendResponse(res, 404, 'Assignment not found.', 'ስራ አልተገኘም።');
    }

    const cappedScore = Math.min(Math.max(Number(score), 0), 30);
    const evaluatorId = req.user.id;
    const evaluatorRole = req.user.role || 'dept_head';

    const [result] = await pool.query(
      'INSERT INTO evaluations (assignment_id, evaluator_id, evaluator_role, score, feedback, status) VALUES (?, ?, ?, ?, ?, ?)',
      [assignment_id, evaluatorId, evaluatorRole, cappedScore, feedback, status]
    );

    await pool.query('UPDATE course_assignments SET status = ? WHERE id = ?', ['evaluated', assignment_id]);

    return sendResponse(res, 201, 'Evaluation submitted successfully.', 'ግምገማ በተሳካ ሁኔታ ተላክቷል።', { id: result.insertId });
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, 'Unable to submit evaluation.', 'ግምገማ ለመላክ አልተቻለም።');
  }
});

app.get('/api/evaluations/template', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM evaluation_templates ORDER BY updated_at DESC LIMIT 1');
    if (!rows.length) {
      // No template exists yet — return an empty object with 200 so frontend can use defaults
      return sendResponse(res, 200, 'No evaluation template found; returning empty.', 'የግምገማ አቅም አልተገኘም፤ ባዶ ነገር ተመልሷል።', {});
    }
    return sendResponse(res, 200, 'Evaluation template loaded.', 'የግምገማ አቅም ተጫኗል።', rows[0]);
  } catch (error) {
    console.error('Evaluation template fetch error:', error?.message || error);
    // Return an empty object so frontend can proceed using local/default template
    return sendResponse(res, 200, 'Evaluation template unavailable; returning empty.', 'የግምገማ አቅም አልተገኘም፤ ባዶ ነገር ተመልሷል።', {});
  }
});

app.post('/api/evaluations/template', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    const { name = 'Student Evaluation Template', template_data } = req.body;
    if (!template_data) {
      return sendResponse(res, 400, 'Template data is required.', 'የአቅም ውሂብ ያስፈልጋል።');
    }
    const [result] = await pool.query(
      'INSERT INTO evaluation_templates (name, template_data, created_by) VALUES (?, ?, ?)',
      [name, JSON.stringify(template_data), req.user.id]
    );
    return sendResponse(res, 201, 'Evaluation template saved.', 'የግምገማ አቅም ተቀምጧል።', { id: result.insertId });
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, 'Unable to save evaluation template.', 'የግምገማ አቅም ለማስቀመጥ አልተቻለም።');
  }
});

app.put('/api/evaluations/template/:id', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    const { name, template_data } = req.body;
    const [rows] = await pool.query('SELECT * FROM evaluation_templates WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) {
      return sendResponse(res, 404, 'Evaluation template not found.', 'የግምገማ አቅም አልተገኘም።');
    }
    const updateFields = [];
    const values = [];
    if (name) {
      updateFields.push('name = ?');
      values.push(name);
    }
    if (template_data) {
      updateFields.push('template_data = ?');
      values.push(JSON.stringify(template_data));
    }
    if (!updateFields.length) {
      return sendResponse(res, 400, 'No updates provided.', 'ምንም የማስተካከያ መረጃ አልተሰጠም።');
    }
    values.push(req.params.id);
    await pool.query(`UPDATE evaluation_templates SET ${updateFields.join(', ')} WHERE id = ?`, values);
    return sendResponse(res, 200, 'Evaluation template updated.', 'የግምገማ አቅም ተዘምኗል።');
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, 'Unable to update evaluation template.', 'የግምገማ አቅም ለማዘመን አልተቻለም።');
  }
});

const criterionTypes = ['student', 'peer', 'dept_head', 'dean', 'dean_evaluates_dept_head'];
const targetRoles = ['instructor', 'lab_assistant'];

const getCriteriaQuery = (req) => {
  const type = req.query.type ? String(req.query.type).trim().toLowerCase() : null;
  const rawTargetRole = req.query.target_role !== undefined ? String(req.query.target_role).trim().toLowerCase() : 'instructor';
  const targetRole = targetRoles.includes(rawTargetRole) ? rawTargetRole : 'instructor';

  if (type && !criterionTypes.includes(type)) return { error: 'Invalid evaluator type.' };

  const filters = [];
  const values = [];

  if (type) {
    filters.push('evaluator_type = ?');
    values.push(type);
  }

  filters.push('(target_role = ? OR target_role IS NULL)');
  values.push(targetRole);

  return {
    type,
    targetRole,
    query: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    values,
  };
};

const getCriteriaPagination = (req) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const search = String(req.query.search || '').trim();
  return { page, limit, offset: (page - 1) * limit, search };
};

const getPaginatedCriteria = async (req) => {
  const criteriaQuery = getCriteriaQuery(req);
  if (criteriaQuery.error) return { error: criteriaQuery.error };
  const { page, limit, offset, search } = getCriteriaPagination(req);
  const filters = [...criteriaQuery.values];
  let whereSQL = criteriaQuery.query;
  if (search) {
    whereSQL += `${whereSQL ? ' AND' : 'WHERE'} (criterion_text LIKE ? OR criterion_text_am LIKE ? OR category LIKE ?)`;
    const searchParam = `%${search}%`;
    filters.push(searchParam, searchParam, searchParam);
  }
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM evaluation_criteria ${whereSQL}`, filters);
  const totalItems = Number(countRow?.total || 0);
  const [rows] = await pool.query(
    `SELECT id, evaluator_type, target_role, criterion_text, criterion_text_am, category, weight, is_active, created_at
     FROM evaluation_criteria ${whereSQL}
     ORDER BY evaluator_type ASC, target_role ASC, category ASC, id ASC
     LIMIT ? OFFSET ?`,
    [...filters, limit, offset]
  );
  return { rows, pagination: { totalItems, totalPages: Math.ceil(totalItems / limit), currentPage: page, itemsPerPage: limit } };
};

const getLegacyPaginatedCriteria = async (req) => {
  const type = req.query.type ? String(req.query.type).trim().toLowerCase() : null;
  if (type && !criterionTypes.includes(type)) return { error: 'Invalid evaluator type.' };
  const { page, limit, offset, search } = getCriteriaPagination(req);
  const clauses = [];
  const values = [];
  if (type) {
    clauses.push('evaluator_type = ?');
    values.push(type);
  }
  if (search) {
    clauses.push('(criterion_text LIKE ? OR criterion_text_am LIKE ? OR category LIKE ?)');
    const searchParam = `%${search}%`;
    values.push(searchParam, searchParam, searchParam);
  }
  const whereSQL = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM evaluation_criteria ${whereSQL}`, values);
  const totalItems = Number(countRow?.total || 0);
  const [rows] = await pool.query(
    `SELECT id, evaluator_type, criterion_text, criterion_text_am, category, weight, is_active, created_at
     FROM evaluation_criteria ${whereSQL}
     ORDER BY evaluator_type ASC, category ASC, id ASC
     LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return { rows, pagination: { totalItems, totalPages: Math.ceil(totalItems / limit), currentPage: page, itemsPerPage: limit } };
};

app.get('/api/admin/evaluation-criteria', authenticate, authorizeRoles('admin', 'systemadmin'), async (req, res) => {
  try {
    const result = await getPaginatedCriteria(req);
    if (result.error) return res.status(400).json({ message: result.error });
    return res.json({ success: true, data: result.rows, pagination: result.pagination });
  } catch (error) {
    const isMissingTargetRoleColumn = error && (error.code === 'ER_BAD_FIELD_ERROR' || error.code === 'ER_NO_SUCH_FIELD' || String(error.message).includes('target_role'));
    if (isMissingTargetRoleColumn) {
      const result = await getLegacyPaginatedCriteria(req);
      if (result.error) return res.status(400).json({ message: result.error });
      return res.json({ success: true, data: result.rows, pagination: result.pagination });
    }
    return res.status(500).json({ message: 'Unable to load all evaluation criteria.', error: error.message });
  }
});

app.get('/api/admin/criteria', authenticate, authorizeRoles('admin', 'systemadmin'), async (req, res) => {
  try {
    const result = await getPaginatedCriteria(req);
    if (result.error) return res.status(400).json({ message: result.error });
    return res.json({ success: true, data: result.rows, pagination: result.pagination });
  } catch (error) {
    const isMissingTargetRoleColumn = error && (error.code === 'ER_BAD_FIELD_ERROR' || error.code === 'ER_NO_SUCH_FIELD' || String(error.message).includes('target_role'));
    if (isMissingTargetRoleColumn) {
      const result = await getLegacyPaginatedCriteria(req);
      if (result.error) return res.status(400).json({ message: result.error });
      return res.json({ success: true, data: result.rows, pagination: result.pagination });
    }
    return res.status(500).json({ message: 'Unable to load all evaluation criteria.', error: error.message });
  }
});

app.get('/api/criteria', authenticate, authorizeRoles('student', 'instructor', 'dept_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'lab_assistant', 'admin', 'systemadmin'), async (req, res) => {
  try {
    const type = String(req.query.type || '').trim().toLowerCase();
    const rawTargetRole = req.query.target_role !== undefined ? String(req.query.target_role).trim().toLowerCase() : 'instructor';
    const targetRole = targetRoles.includes(rawTargetRole) ? rawTargetRole : 'instructor';

    if (!criterionTypes.includes(type)) return res.status(400).json({ message: 'A valid evaluator type is required.' });

    const [rows] = await pool.query(
      `SELECT id, evaluator_type, target_role, criterion_text, criterion_text_am, category, weight, is_active, created_at
       FROM evaluation_criteria
       WHERE evaluator_type = ? AND is_active = 1 AND (target_role = ? OR target_role IS NULL)
       ORDER BY category ASC, id ASC`,
      [type, targetRole]
    );
    return res.json(rows);
  } catch (error) {
    const isMissingTargetRoleColumn = error && (error.code === 'ER_BAD_FIELD_ERROR' || error.code === 'ER_NO_SUCH_FIELD' || String(error.message).includes('target_role'));
    if (isMissingTargetRoleColumn) {
      const [rows] = await pool.query(
        `SELECT id, evaluator_type, criterion_text, criterion_text_am, category, weight, is_active, created_at
         FROM evaluation_criteria
         WHERE evaluator_type = ? AND is_active = 1
         ORDER BY category ASC, id ASC`,
        [type]
      );
      return res.json(rows);
    }
    return res.status(500).json({ message: 'Unable to load evaluation criteria.', error: error.message });
  }
});

app.post('/api/admin/criteria', authenticate, authorizeRoles('admin', 'systemadmin'), async (req, res) => {
  try {
    const evaluatorType = String(req.body.evaluator_type || '').trim().toLowerCase();
    const targetRole = String(req.body.target_role || 'instructor').trim().toLowerCase();
    const criterionText = String(req.body.criterion_text || '').trim();
    const criterionTextAm = String(req.body.criterion_text_am || '').trim();
    const category = String(req.body.category || 'General').trim() || 'General';
    const weight = Number(req.body.weight ?? 5);
    if (!criterionTypes.includes(evaluatorType) || !targetRoles.includes(targetRole) || !criterionText || criterionText.length > 255 || !Number.isInteger(weight) || weight < 1) {
      return res.status(400).json({ message: 'evaluator_type, target_role, criterion_text, and a positive whole-number weight are required.' });
    }
    if (criterionTextAm.length > 255) return res.status(400).json({ message: 'criterion_text_am must be 255 characters or fewer.' });
    const [result] = await pool.query('INSERT INTO evaluation_criteria (evaluator_type, target_role, criterion_text, criterion_text_am, category, weight, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)', [evaluatorType, targetRole, criterionText, criterionTextAm || null, category, weight]);
    return res.status(201).json({ id: result.insertId, evaluator_type: evaluatorType, target_role: targetRole, criterion_text: criterionText, criterion_text_am: criterionTextAm || null, category, weight, is_active: 1 });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create evaluation criterion.', error: error.message });
  }
});

app.put('/api/admin/criteria/:id', authenticate, authorizeRoles('admin', 'systemadmin'), async (req, res) => {
  try {
    const criterionId = Number(req.params.id);
    const fields = [];
    const values = [];
    if (req.body.criterion_text !== undefined) { const text = String(req.body.criterion_text).trim(); if (!text || text.length > 255) return res.status(400).json({ message: 'criterion_text must be 1-255 characters.' }); fields.push('criterion_text = ?'); values.push(text); }
    if (req.body.criterion_text_am !== undefined) { const textAm = String(req.body.criterion_text_am || '').trim(); if (textAm.length > 255) return res.status(400).json({ message: 'criterion_text_am must be 255 characters or fewer.' }); fields.push('criterion_text_am = ?'); values.push(textAm || null); }
    if (req.body.target_role !== undefined) { const targetRole = String(req.body.target_role).trim().toLowerCase(); if (!targetRoles.includes(targetRole)) return res.status(400).json({ message: 'target_role must be instructor or lab_assistant.' }); fields.push('target_role = ?'); values.push(targetRole); }
    if (req.body.category !== undefined) { fields.push('category = ?'); values.push(String(req.body.category).trim() || 'General'); }
    if (req.body.weight !== undefined) { const weight = Number(req.body.weight); if (!Number.isInteger(weight) || weight < 1) return res.status(400).json({ message: 'weight must be a positive whole number.' }); fields.push('weight = ?'); values.push(weight); }
    if (req.body.is_active !== undefined) { fields.push('is_active = ?'); values.push(req.body.is_active ? 1 : 0); }
    if (!Number.isInteger(criterionId) || criterionId <= 0 || !fields.length) return res.status(400).json({ message: 'A valid criterion id and update are required.' });
    values.push(criterionId);
    const [result] = await pool.query(`UPDATE evaluation_criteria SET ${fields.join(', ')} WHERE id = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ message: 'Evaluation criterion not found.' });
    return res.json({ success: true, id: criterionId });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update evaluation criterion.', error: error.message });
  }
});

app.delete('/api/admin/criteria/:id', authenticate, authorizeRoles('admin', 'systemadmin'), async (req, res) => {
  try {
    const criterionId = Number(req.params.id);
    const [result] = await pool.query('UPDATE evaluation_criteria SET is_active = 0 WHERE id = ?', [criterionId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Evaluation criterion not found.' });
    return res.json({ success: true, message: 'Evaluation criterion disabled.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to disable evaluation criterion.', error: error.message });
  }
});

app.post('/api/evaluations/publish-dispatch', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    const { department_id, program_type = null, year_level, semester, section = null, academic_year } = req.body;
    const departmentId = await resolveDepartmentId(department_id || req.user.department_id || req.user.department);
    if (!departmentId || !year_level || !semester || !academic_year) return res.status(400).json({ message: 'Batch department, year level, semester, and academic year are required.' });

    const [existing] = await pool.query(
      `SELECT id FROM evaluation_dispatches
       WHERE department_id = ? AND program_type <=> ? AND year_level = ? AND semester = ? AND student_group <=> ? AND academic_year = ?
       LIMIT 1`,
      [departmentId, program_type, year_level, semester, section, academic_year]
    );
    if (existing.length) {
      await pool.query('UPDATE evaluation_dispatches SET is_student_published = 1, status = \'pending\' WHERE id = ?', [existing[0].id]);
      await notifyStudentCohort({
        departmentId,
        programType: program_type,
        yearLevel: year_level,
        semester,
        section,
        title: 'New evaluation forms available',
        message: 'New instructor evaluation forms are available. Please complete them.',
        type: 'evaluation_dispatch',
      });
      return res.json({ success: true, dispatchId: existing[0].id, updated: true });
    }

    const [result] = await pool.query(
      `INSERT INTO evaluation_dispatches (department_id, program_type, year_level, semester, student_group, academic_year, is_student_published, status, created_by, payload)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?)`,
      [departmentId, program_type, year_level, semester, section, academic_year, req.user.id, JSON.stringify({ source: 'batch_publish' })]
    );
    await notifyStudentCohort({
      departmentId,
      programType: program_type,
      yearLevel: year_level,
      semester,
      section,
      title: 'New evaluation forms available',
      message: 'New instructor evaluation forms are available. Please complete them.',
      type: 'evaluation_dispatch',
    });
    return res.status(201).json({ success: true, dispatchId: result.insertId, updated: false });
  } catch (error) {
    console.error('Batch dispatch publish failed:', error);
    return res.status(500).json({ message: 'Unable to publish evaluation batch.', error: error.message });
  }
});

app.get('/api/student/evaluations', authenticate, authorizeRoles('student'), async (req, res) => {
  try {
    const [[student]] = await pool.query('SELECT id, department_id, year_level, semester, section, program_type FROM students WHERE user_id = ? LIMIT 1', [req.user.id]);
    if (!student) return res.json([]);
    const studentSection = normalizeSectionValue(student.section);
    const [rows] = await pool.query(
      `SELECT DISTINCT ca.id AS assignment_id, ed.id AS dispatch_id, c.code AS course_code, c.name AS course_name,
        ca.year_level, ca.semester, ca.section, ca.program_type,
        CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS instructor_name
       FROM course_assignments ca
       INNER JOIN courses c ON c.id = ca.course_id
       LEFT JOIN instructors i ON i.id = ca.instructor_id
       INNER JOIN evaluation_dispatches ed ON ed.department_id = ca.department_id
         AND ed.year_level = ca.year_level AND ed.semester = ca.semester
         AND ed.academic_year = ca.academic_year AND ed.is_student_published = 1
         AND (ed.program_type IS NULL OR ed.program_type = ca.program_type)
         AND (
           ed.student_id = ? OR (
             ed.student_id IS NULL
             AND ed.student_group IS NOT NULL
             AND LOWER(TRIM(REPLACE(REPLACE(ed.student_group, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(REPLACE(REPLACE(?, 'Section ', ''), 'section ', '')))
           )
         )
       WHERE ca.department_id = ? AND ca.year_level = ? AND ca.semester = ?
         AND ca.section = ? AND ca.program_type = ?
       ORDER BY c.code ASC`,
      [student.id, studentSection, student.department_id, student.year_level, student.semester, student.section, student.program_type]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load student evaluations.', error: error.message });
  }
});

app.delete('/api/courses/assign/:assignmentId', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const assignmentId = Number(req.params.assignmentId);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) return res.status(400).json({ message: 'Invalid assignment ID.' });
    const [rows] = await connection.query('SELECT id, department_id, course_id, instructor_id FROM course_assignments WHERE id = ? LIMIT 1', [assignmentId]);
    if (!rows.length) return res.status(404).json({ message: 'Course assignment not found.' });
    const assignment = rows[0];
    if (req.user.role === 'dept_head' && Number(assignment.department_id) !== Number(req.user.department_id)) return res.status(403).json({ message: 'You can only delete assignments in your department.' });

    const [submittedStudents] = await connection.query('SELECT ses.id FROM student_evaluation_submissions ses INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id WHERE ed.assignment_id = ? LIMIT 1', [assignmentId]);
    const [submittedPeers] = await connection.query('SELECT pes.id FROM peer_evaluation_submissions pes INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id WHERE pe.course_id = ? AND pe.evaluatee_id = ? LIMIT 1', [assignment.course_id, assignment.instructor_id]);
    if (submittedStudents.length || submittedPeers.length) return res.status(400).json({ success: false, message: 'Cannot delete this assignment because evaluations have already been submitted.' });

    await connection.beginTransaction();
    await connection.query('DELETE FROM evaluation_dispatches WHERE assignment_id = ?', [assignmentId]);
    await connection.query('DELETE FROM peer_evaluations WHERE course_id = ? AND evaluatee_id = ?', [assignment.course_id, assignment.instructor_id]);
    await connection.query('DELETE FROM course_assignments WHERE id = ?', [assignmentId]);
    await connection.commit();
    return res.json({ success: true, message: 'Course assignment deleted successfully.' });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Assignment delete rollback failed:', rollbackError); }
    return res.status(500).json({ message: 'Unable to delete course assignment.', error: error.message });
  } finally { connection.release(); }
});

app.post('/api/evaluations/dispatch', authenticate, authorizeRoles('dept_head', 'admin'), async (req, res) => {
  try {
    const {
      template_id = null,
      student_id = null,
      student_identifier = null,
      student_group = null,
      course_code = null,
      course_name = null,
      academic_year = null,
      semester = null,
      year_level = null,
      student_identifier_text = null,
      payload = {},
    } = req.body;

    if (!course_code || !course_name || !academic_year || !semester || !year_level) {
      return sendResponse(res, 400, 'Required dispatch fields are missing.', 'የማስተላለፊያ አስፈላጊ መረጃዎች የጎደሉት ናቸው።');
    }

    // If a course_code is provided, attempt to dispatch to all students assigned to that course
    const [assignedStudents] = await pool.query(
      `SELECT DISTINCT s.id AS student_id, s.user_id
       FROM course_assignments ca
       INNER JOIN students s ON s.id = ca.student_id
       WHERE ca.course_code = ? AND ca.student_id IS NOT NULL`,
      [course_code]
    );

    if (assignedStudents.length) {
      const insertedIds = [];
      for (const row of assignedStudents) {
        try {
          const [r] = await pool.query(
            'INSERT INTO evaluation_dispatches (template_id, student_id, student_identifier, course_code, course_name, academic_year, semester, year_level, student_group, student_identifier_text, created_by, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [template_id, row.student_id, null, course_code, course_name, academic_year, semester, year_level, student_group, student_identifier_text, req.user.id, JSON.stringify(payload)]
          );
          insertedIds.push(r.insertId);
        } catch (err) {
          console.warn('Failed to insert dispatch for student', row.student_id, err.message || err);
        }
      }
      await createNotifications({
        userIds: assignedStudents.map((student) => student.user_id),
        title: 'New evaluation form assigned',
        message: `Please complete the ${course_name} instructor evaluation.`,
        type: 'evaluation_dispatch',
      });
      return sendResponse(res, 201, 'Student evaluations dispatched to course students.', 'የተማሪ ግምገማዎች ወደ ኮርስ ተማሪዎች ተልከዋል።', { created: insertedIds.length, ids: insertedIds });
    }

    // Fallback: create a generic dispatch (e.g., for a group or individual identifier)
    const [result] = await pool.query(
      'INSERT INTO evaluation_dispatches (template_id, student_id, student_identifier, course_code, course_name, academic_year, semester, year_level, student_group, student_identifier_text, created_by, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [template_id, student_id, student_identifier, course_code, course_name, academic_year, semester, year_level, student_group, student_identifier_text, req.user.id, JSON.stringify(payload)]
    );

    return sendResponse(res, 201, 'Student evaluation dispatched successfully.', 'የተማሪ ግምገማ በተሳካ ሁኔታ ተላክቷል።', { id: result.insertId });
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, 'Unable to dispatch evaluation.', 'ግምገማ ለማስተላለፍ አልተቻለም።');
  }
});

app.get('/api/student/profile', authenticate, authorizeRoles('student'), async (req, res) => {
  try {
    if (!req.user) {
      throw new Error('Authenticated user is required');
    }

    const [rows] = await pool.query(
      `SELECT u.id AS user_id,
        COALESCE(u.email, s.student_id, '') AS username,
        s.id AS student_row_id,
        s.student_id,
        s.first_name,
        s.last_name,
        s.department_id,
        TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS full_name,
        d.name AS department_name,
        s.program_type,
        s.program_type AS program,
        s.year_level,
        s.semester,
        s.section
      FROM users u
      LEFT JOIN students s ON u.id = s.user_id
      LEFT JOIN departments d ON s.department_id = d.id
      WHERE u.id = ? LIMIT 1`,
      [req.user.id]
    );

    if (!rows.length) {
      return sendResponse(res, 200, 'Student profile retrieved successfully.', 'የተማሪ መረጃ በትክክል ተቀርቧል።', {
        user_id: req.user.id,
        student_id: null,
        username: req.user.username,
        full_name: req.user.username,
        department_id: null,
        department_name: null,
        program_type: null,
        year_level: null,
        semester: null,
        section: null,
      });
    }

    const profile = rows[0];
    const fullName = profile.full_name && profile.full_name.trim()
      ? profile.full_name
      : (profile.first_name && profile.last_name)
        ? `${profile.first_name} ${profile.last_name}`
        : profile.username || 'Student';

    profile.full_name = fullName;
    profile.first_name = profile.first_name || profile.username || '';
    profile.last_name = profile.last_name || '';
    profile.program = profile.program_type || null;

    return sendResponse(res, 200, 'Student profile retrieved successfully.', 'የተማሪ መረጃ በትክክል ተቀርቧል።', profile);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Unable to load student profile.',
    });
  }
});

app.get('/api/instructor/profile', authenticate, authorizeRoles('instructor'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        i.id,
        CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS full_name,
        d.name AS department_name,
        i.employee_id,
        i.gender
      FROM instructors i
      LEFT JOIN departments d ON i.department_id = d.id
      WHERE i.user_id = ? LIMIT 1`,
      [req.user.id]
    );

    if (!rows.length) {
      return sendResponse(res, 404, 'Instructor profile not found.', 'የመምህር መገለጫ አልተገኘም።');
    }

    return sendResponse(res, 200, 'Instructor profile retrieved successfully.', 'የመምህር መገለጫ ተቀርቧል።', rows[0]);
  } catch (error) {
    console.error('Instructor profile error:', error);
    return res.status(500).json({ message: 'Unable to load instructor profile.' });
  }
});

app.get('/api/lab-assistant/profile', authenticate, authorizeRoles('lab_assistant'), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.json({
        success: false,
        data: {
          id: null,
          user_id: null,
          employee_id: 'N/A',
          first_name: 'Lab Assistant',
          last_name: '',
          department_id: null,
          department_name: 'N/A'
        },
        message: 'Authentication required.'
      });
    }

    const [rows] = await pool.query(
      `SELECT la.id, la.user_id, la.employee_id, la.first_name, la.last_name, la.department_id,
              COALESCE(NULLIF(d.department_name, ''), d.name, 'N/A') AS department_name,
              c.name AS college_name
       FROM lab_assistants la
       LEFT JOIN departments d ON d.id = la.department_id
       LEFT JOIN colleges c ON c.id = d.college_id
       WHERE la.user_id = ? LIMIT 1`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.json({
        success: false,
        data: {
          id: null,
          user_id: userId,
          employee_id: 'N/A',
          first_name: 'Lab Assistant',
          last_name: '',
          department_id: null,
          department_name: 'N/A'
        },
        message: 'Lab Assistant profile not found.'
      });
    }

    return res.json({
      success: true,
      data: rows[0],
      message: 'Lab Assistant profile retrieved.'
    });
  } catch (error) {
    console.error('Lab Assistant profile error:', error);
    return res.json({
      success: false,
      data: {
        id: null,
        user_id: null,
        employee_id: 'N/A',
        first_name: 'Lab Assistant',
        last_name: '',
        department_id: null,
        department_name: 'N/A'
      },
      message: 'Unable to load Lab Assistant profile. Showing defaults.'
    });
  }
});

app.get('/api/lab-assistant/performance-summary', authenticate, authorizeRoles('lab_assistant'), async (req, res) => {
  try {
    const [[assistant]] = await pool.query('SELECT id, user_id, employee_id, first_name, last_name, department_id FROM lab_assistants WHERE user_id = ? LIMIT 1', [req.user.id]);
    if (!assistant) return sendResponse(res, 404, 'Lab Assistant profile not found.', 'የላብ ረዳት መገለጫ አልተገኘም።');
    const [[student]] = await pool.query(
      `SELECT COALESCE(AVG(ses.score), 0) AS score
       FROM student_evaluation_submissions ses
       INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
       WHERE ed.department_id = ? AND ed.target_type = 'lab_assistant' AND ed.target_user_id IN (?, ?)
         AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved')`,
      [assistant.department_id, assistant.id, assistant.user_id]
    );
    const [[peer]] = await pool.query(
      `SELECT COALESCE(AVG(pes.score), 0) AS score
       FROM peer_evaluation_submissions pes
       INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
       INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
       WHERE ed.department_id = ? AND ed.target_type = 'lab_assistant' AND ed.target_user_id IN (?, ?)
         AND LOWER(COALESCE(pes.status, 'submitted')) IN ('submitted', 'completed', 'approved')`,
      [assistant.department_id, assistant.id, assistant.user_id]
    );
    const studentScore = Number(student?.score || 0);
    const peerScore = Number(peer?.score || 0);
    return sendResponse(res, 200, 'Lab Assistant performance retrieved.', 'የላብ ረዳት አፈጻጸም ተገኝቷል።', {
      studentScore: Number(studentScore.toFixed(2)),
      peerScore: Number(peerScore.toFixed(2)),
      overallScore: Number((studentScore * 0.5 + peerScore * 0.5).toFixed(2)),
      weights: { student: 50, peer: 50 },
    });
  } catch (error) {
    console.error('Lab Assistant performance error:', error);
    return res.status(500).json({ message: 'Unable to load Lab Assistant performance.' });
  }
});

const getInstructorPerformance = async (req, res) => {
  try {
    const [instructorRows] = await pool.query('SELECT id, department_id FROM instructors WHERE user_id = ? LIMIT 1', [req.user.id]);
    if (!instructorRows.length) {
      return sendResponse(res, 404, 'Instructor profile not found.', 'የመምህር መገለጫ አልተገኘም።');
    }

    const instructor = instructorRows[0];
    const [[activeEvaluationPeriod]] = await pool.query(
      `SELECT academic_year, semester FROM evaluation_periods
       WHERE LOWER(status) = 'active' ORDER BY id DESC LIMIT 1`
    );
    const unified = await getInstructorOverallPerformance({
      instructorId: instructor.id,
      academicYear: String(req.query.academic_year || activeEvaluationPeriod?.academic_year || '').trim(),
      semester: String(req.query.semester || activeEvaluationPeriod?.semester || '').trim(),
    });
    return sendResponse(res, 200, 'Performance summary retrieved.', 'የአፈጻጸም ማጠቃለያ ተመለሰ።', {
      totalWeightedScore: unified.totalScore,
      totalScore: unified.totalScore,
      isComplete: unified.isComplete,
      statusBadge: unified.statusBadge,
      status: unified.isComplete ? unified.classification.split(' (')[0] : unified.statusBadge,
      badgeColor: unified.isComplete ? (unified.totalScore >= 90 ? 'emerald' : unified.totalScore >= 85 ? 'blue' : unified.totalScore >= 70 ? 'cyan' : unified.totalScore >= 50 ? 'amber' : 'red') : 'amber',
      completion: unified.completion,
      hasAssignedCourse: unified.hasAssignedCourse,
      hasAssignedCourses: unified.hasAssignedCourse,
      total_assignments: unified.totalAssignments,
      isStudentEvaluationExcluded: !unified.hasAssignedCourse,
      raw_student_score: unified.studentRaw,
      submission_count: unified.student.count,
      role: unified.role,
      isDepartmentHead: false,
      breakdown: {
        student: { rawPercentage: unified.studentRaw, rawScore: unified.studentRaw, weightedContribution: unified.studentWeighted, weight: unified.weights.student, isAvailable: unified.hasAssignedCourse, submissionCount: unified.student.count },
        deptHead: { rawPercentage: unified.deptHeadRaw, rawScore: unified.deptHeadRaw, weightedContribution: unified.deptHeadWeighted, weight: unified.weights.deptHead, isAvailable: unified.deptHead.count > 0 },
        peer: { rawPercentage: unified.peerRaw, rawScore: unified.peerRaw, weightedContribution: unified.peerWeighted, weight: unified.weights.peer, isAvailable: unified.peer.count > 0 },
      },
      instructor: { name: unified.instructorName, department: unified.department },
      academicYear: unified.academicYear,
      semester: unified.semester,
    });
    const [latestResultRows] = await pool.query(
      `SELECT e.instructor_id, e.student_average, e.student_score, e.peer_average,
              e.peer_score, e.dept_head_score, e.total_score, e.final_score,
              e.academic_year, e.semester,
              TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS instructor_name,
              d.name AS department_name
       FROM evaluation_results e
       INNER JOIN instructors i ON i.id = e.instructor_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.instructor_id = ?
         AND (COALESCE(e.total_score, 0) > 0 OR COALESCE(e.final_score, 0) > 0
           OR COALESCE(e.student_average, 0) > 0 OR COALESCE(e.peer_average, 0) > 0
           OR COALESCE(e.dept_head_score, 0) > 0)
       ORDER BY e.id DESC
       LIMIT 1`,
      [instructor.id]
    );
    const latestResult = latestResultRows[0] || null;
    const [summaryRows] = await pool.query(
      `SELECT student_score, student_weighted_score,
              dept_head_score, dept_head_weighted_score,
              peer_score, peer_weighted_score, total_weighted_score,
              ${INSTRUCTOR_WEIGHTED_SCORE_SQL} AS sql_final_score,
              is_published
       FROM (
         SELECT student_raw_percentage AS student_score,
                student_weighted_score,
                dept_head_raw_percentage AS dept_head_score,
                dept_head_weighted_score,
                peer_raw_percentage AS peer_score,
                peer_weighted_score,
                total_weighted_score,
                is_published
         FROM evaluation_summaries
         WHERE instructor_id = ? AND is_published = 1
       ) AS published_summary
       LIMIT 1`,
      [instructor.id]
    );
    const [assignmentRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM course_assignments
       WHERE instructor_id = ?
         AND (semester IS NULL OR TRIM(semester) <> '')
         AND (academic_year IS NULL OR TRIM(academic_year) <> '')`,
      [instructor.id]
    );
    const hasAssignedCourse = Number(assignmentRows[0]?.total || 0) > 0;
    const requestedAcademicYear = String(req.query.academic_year || '').trim();
    const requestedSemester = String(req.query.semester || '').trim();
    const [studentRows] = await pool.query(
      `SELECT ses.score, ses.feedback, ses.strengths, ses.improvements, ses.responses, ed.course_name, ses.created_at
       FROM student_evaluation_submissions ses
       JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
       JOIN course_assignments ca ON ca.id = ed.assignment_id
       WHERE ca.instructor_id = ?
         AND LOWER(COALESCE(ed.target_type, 'instructor')) = 'instructor'
         AND LOWER(COALESCE(ses.status, 'submitted')) IN ('submitted', 'completed', 'approved')
         AND (? = '' OR ca.academic_year = ? OR ed.academic_year = ?)
         AND (? = '' OR LOWER(TRIM(ca.semester)) = LOWER(TRIM(?)) OR LOWER(TRIM(ed.semester)) = LOWER(TRIM(?)))
       ORDER BY ses.created_at DESC`,
      [instructor.id, requestedAcademicYear, requestedAcademicYear, requestedAcademicYear, requestedSemester, requestedSemester, requestedSemester]
    );
    const [deptHeadRows] = await pool.query(
      `SELECT dhe.total_score AS score, dhe.criteria_scores, dhe.created_at
       FROM dept_head_evaluations dhe
       WHERE (dhe.instructor_id = ? OR dhe.evaluatee_id = ?)
         AND LOWER(TRIM(dhe.status)) IN ('submitted', 'completed', 'approved')
       ORDER BY dhe.created_at DESC`,
      [instructor.id, req.user.id]
    );
    const [peerTargetColumns] = await pool.query(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('peer_evaluations', 'peer_evaluation_submissions')
         AND COLUMN_NAME IN ('evaluatee_id', 'evaluated_instructor_id', 'target_instructor_id', 'instructor_id')`
    );
    const getTargetColumn = (tableName) => {
      const available = peerTargetColumns
        .filter((column) => column.TABLE_NAME === tableName)
        .map((column) => column.COLUMN_NAME);
      return ['evaluatee_id', 'evaluated_instructor_id', 'target_instructor_id', 'instructor_id'].find((column) => available.includes(column));
    };
    const peerTargetColumn = getTargetColumn('peer_evaluations');
    const submissionTargetColumn = getTargetColumn('peer_evaluation_submissions');
    const peerTargetPredicates = [];
    const peerTargetParams = [];
    if (peerTargetColumn) {
      peerTargetPredicates.push(`pe.${peerTargetColumn} IN (?, ?)`);
      peerTargetParams.push(instructor.id);
      peerTargetParams.push(req.user.id);
    }
    if (submissionTargetColumn) {
      peerTargetPredicates.push(`pes.${submissionTargetColumn} IN (?, ?)`);
      peerTargetParams.push(instructor.id);
      peerTargetParams.push(req.user.id);
    }
    peerTargetPredicates.push('target.user_id = ?');
    peerTargetParams.push(req.user.id);
    const peerTargetJoin = peerTargetColumn
      ? `LEFT JOIN instructors target ON target.id = pe.${peerTargetColumn}`
      : 'LEFT JOIN instructors target ON 1 = 0';
    const [peerRows] = await pool.query(
      `SELECT pes.score, pes.strengths, pes.suggestions, pes.responses, pes.created_at
       FROM peer_evaluation_submissions pes
       JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
       ${peerTargetJoin}
       WHERE (${peerTargetPredicates.join(' OR ')})
         AND LOWER(TRIM(pes.status)) IN ('submitted', 'completed', 'approved')
       ORDER BY pes.created_at DESC`,
      peerTargetParams
    );

    const parseJson = (value) => {
      if (!value) return {};
      if (typeof value === 'object') return value;
      try { return JSON.parse(value); } catch { return {}; }
    };
    const average = (rows) => rows.length ? rows.reduce((total, row) => total + Number(row.score || 0), 0) / rows.length : 0;
    const calculatedScores = { student: average(studentRows), deptHead: average(deptHeadRows), peer: average(peerRows) };
    const scores = {
      student: calculatedScores.student > 0
        ? calculatedScores.student
        : Number(latestResult?.student_score ?? latestResult?.student_average ?? 0),
      deptHead: calculatedScores.deptHead > 0
        ? calculatedScores.deptHead
        : Number(latestResult?.dept_head_score ?? 0),
      peer: calculatedScores.peer > 0
        ? calculatedScores.peer
        : Number(latestResult?.peer_score ?? latestResult?.peer_average ?? 0),
    };
    const isDepartmentHead = ['dept_head', 'department_head', 'depthead'].includes(String(req.user?.role || '').trim().toLowerCase());
    const weightedSummary = calculateInstructorWeightedScore({
      student: scores.student,
      deptHead: scores.deptHead,
      peer: scores.peer,
      hasAssignedCourse,
      isDepartmentHead,
      deptHeadMaxScore: 30,
    });
    const persistedSqlScore = Number(summaryRows[0]?.sql_final_score);
    const hasLiveEvaluationData = studentRows.length > 0 || deptHeadRows.length > 0 || peerRows.length > 0;
    const totalScore = hasLiveEvaluationData ? weightedSummary.totalWeightedScore : (persistedSqlScore > 0 ? persistedSqlScore : weightedSummary.totalWeightedScore);
    const [[term]] = await pool.query(
      'SELECT academic_year, semester FROM course_assignments WHERE instructor_id = ? ORDER BY created_at DESC LIMIT 1',
      [instructor.id]
    );
    const academicYear = String(latestResult?.academic_year || term?.academic_year || new Date().getFullYear());
    const semester = String(latestResult?.semester || term?.semester || '');
    await pool.query(
      `INSERT INTO evaluation_results
        (instructor_id, department_id, academic_year, semester, student_average, student_score, peer_average, peer_score, dept_head_score, total_score, final_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         student_average = VALUES(student_average), student_score = VALUES(student_score),
         peer_average = VALUES(peer_average), peer_score = VALUES(peer_score),
         dept_head_score = VALUES(dept_head_score), total_score = VALUES(total_score),
         final_score = VALUES(final_score), published_at = CURRENT_TIMESTAMP`,
      [instructor.id, instructor.department_id, academicYear, semester, scores.student, scores.student, scores.peer, scores.peer, scores.deptHead, totalScore, totalScore]
    );
    const status = totalScore >= 90 ? 'Excellent' : totalScore >= 85 ? 'Very Good' : totalScore >= 70 ? 'Good' : totalScore >= 50 ? 'Satisfactory' : 'Unsatisfactory';
    const badgeColor = totalScore >= 90 ? 'emerald' : totalScore >= 85 ? 'blue' : totalScore >= 70 ? 'cyan' : totalScore >= 50 ? 'amber' : 'red';
    const strengths = [];
    const improvements = [];
    const addUnique = (list, value) => {
      const text = sanitizeEvaluationFeedback(value);
      if (text && !list.includes(text)) list.push(text);
    };
    const classifyRemark = (text, score) => {
      const normalized = String(text || '').trim();
      if (!normalized) {
        return;
      }
      const indicatesImprovement = /improv|enhanc|weak|need|lack|late|timely|คว|should|suggest/i.test(normalized);
      addUnique(indicatesImprovement || score < 50 ? improvements : strengths, normalized);
    };

    studentRows.forEach((row) => {
      if (row.strengths) addUnique(strengths, row.strengths);
      if (row.improvements) addUnique(improvements, row.improvements);
      classifyRemark(row.feedback, Number(row.score || 0));
    });
    deptHeadRows.forEach((row) => {
      const criteria = parseJson(row.criteria_scores);
      classifyRemark(criteria.remarks || criteria.feedback, Number(row.score || 0));
    });
    peerRows.forEach((row) => {
      addUnique(strengths, row.strengths);
      addUnique(improvements, row.suggestions);
    });

    return sendResponse(res, 200, 'Performance summary retrieved.', 'የአፈጻጸም ማጠቃለያ ተመለሰ።', {
      totalWeightedScore: Number(totalScore.toFixed(2)),
      totalScore: Number(totalScore.toFixed(2)),
      status,
      badgeColor,
      hasAssignedCourse: Boolean(weightedSummary.hasAssignedCourse),
      isDepartmentHead: Boolean(isDepartmentHead),
      warning: weightedSummary.warning,
      breakdown: weightedSummary.breakdown,
      feedback: { strengths, improvements },
      instructor: {
        name: latestResult?.instructor_name || 'Instructor',
        department: latestResult?.department_name || '',
      },
      academicYear,
      semester,
    });
  } catch (error) {
    console.error('Performance dashboard error:', error);
    return sendResponse(res, 500, 'Unable to retrieve performance dashboard.', 'የአፈጻጸም ዳሽቦርድን ማግኘት አልተቻለም።');
  }
};

app.get(['/api/instructor/dashboard', '/api/instructor/performance-summary', '/api/instructor/performance'], authenticate, authorizeRoles('instructor', 'dept_head'), getInstructorPerformance);
app.post('/api/instructors/goals', authenticate, authorizeRoles('instructor'), async (req, res) => {
  const focusArea = String(req.body?.focusArea || '').trim();
  const goal = String(req.body?.goal || '').trim();
  const term = String(req.body?.term || '').trim();
  if (!focusArea || !goal || !term) return res.status(400).json({ success: false, message: 'Focus area, goal, and term are required.' });
  try {
    const [result] = await pool.query(
      'INSERT INTO instructor_goals (instructor_user_id, focus_area, goal, term) VALUES (?, ?, ?, ?)',
      [req.user.id, focusArea, goal, term]
    );
    return res.status(201).json({ success: true, data: { id: result.insertId, focusArea, goal, term, status: 'active' } });
  } catch (error) {
    console.error('Instructor goal save failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to save improvement goal.' });
  }
});

app.get('/api/student/pending-evaluations', authenticate, authorizeRoles('student'), async (req, res) => {
  try {
    if (!req.user) {
      console.warn('Request missing authenticated user for pending evaluations');
      return res.status(200).json([]);
    }

    const [studentRows] = await pool.query(
      'SELECT id, department_id, program_type, year_level, semester, section FROM students WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );

    if (!studentRows.length) {
      return res.status(200).json([]);
    }

    const student = studentRows[0];
    const normalizedSection = normalizeSectionValue(student.section);
    const [rows] = await pool.query(
      `SELECT c.code AS course_code, c.name AS course_name,
        CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS instructor_name,
        DATE_FORMAT(DATE_ADD(ca.created_at, INTERVAL 7 DAY), '%Y-%m-%d') AS deadline,
        ca.id AS assignment_id,
        ca.is_published,
        ca.is_student_published,
        ca.is_peer_published,
        ed.id AS dispatch_id
      FROM course_assignments ca
      JOIN courses c ON ca.course_id = c.id
      LEFT JOIN instructors i ON ca.instructor_id = i.id
      INNER JOIN evaluation_dispatches ed ON ed.assignment_id = ca.id AND (
        ed.student_id = ? OR (
          ed.student_id IS NULL
          AND ed.student_group IS NOT NULL
          AND LOWER(TRIM(REPLACE(REPLACE(ed.student_group, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(REPLACE(REPLACE(?, 'Section ', ''), 'section ', '')))
        )
      )
      WHERE ca.department_id = ?
        AND LOWER(TRIM(ca.year_level)) = LOWER(TRIM(?))
        AND LOWER(TRIM(ca.semester)) = LOWER(TRIM(?))
        AND LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section ', ''), 'section ', ''))) = LOWER(?)
        AND (ca.is_student_published = 1 OR LOWER(TRIM(COALESCE(ca.status, ''))) = 'published')
        AND LOWER(TRIM(COALESCE(ca.program_type, ''))) = LOWER(TRIM(COALESCE(?, '')))
      ORDER BY c.code ASC`,
      [student.id, normalizedSection, student.department_id, student.year_level, student.semester, normalizedSection, student.program_type]
    );

    return sendResponse(res, 200, 'Pending evaluations retrieved successfully.', 'የቅድሚያ ግምገማዎች በትክክል ተቀርቧል።', rows);
  } catch (error) {
    console.error(error);
    return res.status(200).json([]);
  }
});

app.get('/api/student/evaluations/pending', authenticate, authorizeRoles('student'), async (req, res) => {
  try {
    if (!req.user) {
      console.warn('Pending evaluations request missing authenticated user.');
      return res.status(200).json([]);
    }

    const [studentRows] = await pool.query('SELECT id, department_id, program_type, year_level, semester, section FROM students WHERE user_id = ? LIMIT 1', [req.user.id]);
    if (!studentRows.length) {
      return res.status(200).json([]);
    }

    const student = studentRows[0];
    const academicYear = String(req.query.academic_year || new Date().getFullYear());
    const semester = String(req.query.semester || student.semester || 'Semester I');
    const studentSection = normalizeSectionValue(student.section);

    const [evaluations] = await pool.query(
      `SELECT ed.id,
        ed.assignment_id,
        ed.course_id,
        ed.template_id,
        ed.student_id,
        ed.student_identifier,
        COALESCE(ed.course_code, c.code) AS course_code,
        COALESCE(ed.course_name, c.name) AS course_name,
        ed.academic_year,
        ed.semester,
        ed.year_level,
        ed.student_group,
        ed.student_identifier_text,
        ed.payload,
        ed.status,
        ed.created_at,
        CASE WHEN LOWER(COALESCE(ca.assigned_role, ed.target_type, 'instructor')) = 'lab_assistant' THEN 'lab_assistant' ELSE 'instructor' END AS target_type,
        CASE WHEN LOWER(COALESCE(ca.assigned_role, ed.target_type, 'instructor')) = 'lab_assistant' THEN COALESCE(ca.staff_id, ed.target_user_id) ELSE i.id END AS target_user_id,
        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(i.first_name, la.first_name, ''), ' ', COALESCE(i.last_name, la.last_name, ''))), ''), CONCAT(COALESCE(ed.target_first_name, ''), ' ', COALESCE(ed.target_last_name, ''))) AS instructor_name,
        COALESCE(NULLIF(TRIM(CONCAT(COALESCE(i.first_name, la.first_name, ''), ' ', COALESCE(i.last_name, la.last_name, ''))), ''), CONCAT(COALESCE(ed.target_first_name, ''), ' ', COALESCE(ed.target_last_name, ''))) AS target_name,
        ses.score AS total_score,
        ses.feedback,
        ses.responses,
        ses.submitted_at,
        ses.editable_until,
        ses.status AS submission_status,
        ses.id AS submission_id,
        CASE WHEN ses.id IS NOT NULL THEN 1 ELSE 0 END AS is_evaluated
      FROM course_assignments ca
      LEFT JOIN courses c ON ca.course_id = c.id
      LEFT JOIN evaluation_dispatches ed ON ed.assignment_id = ca.id AND (
        ed.student_id = ? OR (
          ed.student_id IS NULL
          AND ed.student_group IS NOT NULL
          AND LOWER(TRIM(REPLACE(REPLACE(ed.student_group, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(REPLACE(REPLACE(?, 'Section ', ''), 'section ', '')))
        )
      )
      LEFT JOIN instructors i ON ca.instructor_id = i.id
      LEFT JOIN lab_assistants la ON LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant' AND la.id = ca.staff_id
      LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      WHERE ca.department_id = ?
        AND ed.id IS NOT NULL
        AND (ca.is_student_published = 1 OR LOWER(TRIM(COALESCE(ca.status, ''))) = 'published')
        AND (? = '' OR ca.academic_year = ? OR ca.academic_year LIKE CONCAT('%', ?, '%'))
        AND (
          LOWER(TRIM(COALESCE(ca.program_type, ''))) IN ('', 'all', 'all programs')
          OR LOWER(TRIM(COALESCE(ca.program_type, ''))) = LOWER(TRIM(COALESCE(?, '')))
        )
        AND (
          LOWER(TRIM(COALESCE(ca.year_level, ''))) IN ('', 'all', 'all years')
          OR REGEXP_REPLACE(LOWER(TRIM(ca.year_level)), '[^0-9]', '') = REGEXP_REPLACE(LOWER(TRIM(?)), '[^0-9]', '')
        )
        AND LOWER(TRIM(REPLACE(REPLACE(ca.semester, 'Semester', ''), 'semester', ''))) = LOWER(TRIM(REPLACE(REPLACE(?, 'Semester', ''), 'semester', '')))
        AND (
          ca.section IS NULL
          OR LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section', ''), 'section', ''))) IN ('', 'all', 'all sections')
          OR LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section', ''), 'section', ''))) = LOWER(TRIM(REPLACE(REPLACE(?, 'Section', ''), 'section', '')))
        )
        AND (ed.evaluation_type IN ('student', 'lab_assistant_student') AND LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active', 'published', 'submitted'))
      ORDER BY ed.created_at DESC`,
      [student.id, studentSection, student.department_id, academicYear, academicYear, academicYear, student.program_type, student.year_level, semester, studentSection]
    );

    const normalized = evaluations.map(row => ({
      ...row,
      status: row.submission_id
        ? String(row.submission_status || 'completed').toLowerCase()
        : 'pending',
      total_score: row.total_score !== null ? Number(row.total_score) : 0,
      is_evaluated: Boolean(row.is_evaluated),
      responses: row.responses ? (typeof row.responses === 'string' ? JSON.parse(row.responses) : row.responses) : {},
    }));

    return res.status(200).json(normalized);
  } catch (error) {
    console.error('Pending Evaluations Error:', error);
    return res.status(200).json([]);
  }
});

app.get('/api/student/evaluations/available', authenticate, authorizeRoles('student'), async (req, res) => {
  try {
    const [studentRows] = await pool.query(
      'SELECT department_id, year_level, semester, section FROM students WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );

    if (!studentRows.length) {
      return sendResponse(res, 200, 'No student record found.', 'የተማሪ መዝገብ አልተገኘም።', []);
    }

    const student = studentRows[0];
    const [rows] = await pool.query(
      `SELECT
          ca.id AS assignment_id,
          c.code AS course_code,
          c.name AS course_name,
          CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')) AS instructor_name,
          DATE_FORMAT(DATE_ADD(COALESCE(ca.created_at, NOW()), INTERVAL 7 DAY), '%Y-%m-%d') AS deadline
        FROM course_assignments ca
        JOIN courses c ON ca.course_id = c.id
        LEFT JOIN instructors i ON ca.instructor_id = i.id
        WHERE ca.department_id = ?
          AND ca.is_student_published = 1
        ORDER BY c.code ASC`,
      [student.department_id]
    );

    return sendResponse(res, 200, 'Available student evaluations retrieved successfully.', 'ለተማሪዎች የሚገኙ ግምገማዎች ተመለሰ።', rows);
  } catch (error) {
    console.error('Available Student Evaluations Error:', error);
    return sendResponse(res, 500, 'Unable to load available student evaluations.', 'ለተማሪዎች የሚገኙ ግምገማዎችን ማግኘት አልቻለም።');
  }
});

app.post('/api/student/evaluations/submit', authenticate, authorizeRoles('student'), async (req, res) => {
  try {
    const { dispatch_id, score, strengths = '', improvements = '', responses = {} } = req.body;
    if (!dispatch_id) {
      return sendResponse(res, 400, 'Dispatch ID is required.', 'Dispatch ID ያስፈልጋል።');
    }
    const feedbackValidation = validateEvaluationFeedbackPair(strengths, improvements);
    if (!feedbackValidation.valid) return sendResponse(res, 400, feedbackValidation.errors[0], feedbackValidation.errors[0]);

    const hasResponses = Array.isArray(responses)
      ? responses.length > 0
      : Object.keys(responses || {}).length > 0;
    const finalScore = hasResponses
      ? Number(calculateLikertPercentage(responses).toFixed(2))
      : Number(score || 0);

    const [studentRows] = await pool.query("SELECT id, department_id, CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) AS student_name FROM students WHERE user_id = ? LIMIT 1", [req.user.id]);
    if (!studentRows.length) {
      return sendResponse(res, 404, 'Student record not found.', 'የተማሪ መረጃ አልተገኘም።');
    }

    const student = studentRows[0];
    const [dispatchRows] = await pool.query(
      `SELECT * FROM evaluation_dispatches 
       WHERE id = ? AND (
         (student_id = ? AND target_type IS NULL) OR 
         (department_id = ? AND target_type = 'lab_assistant')
       ) LIMIT 1`,
      [dispatch_id, student.id, student.department_id]
    );
    if (!dispatchRows.length) {
      return sendResponse(res, 404, 'Dispatch not found.', 'Dispatch አልተገኘም።');
    }

    const dispatch = dispatchRows[0];
    const responsePayload = JSON.stringify(
      responses && typeof responses === 'object' ? responses : {}
    );
    const [existingSubmission] = await pool.query(
      'SELECT id FROM student_evaluation_submissions WHERE dispatch_id = ? LIMIT 1',
      [dispatch.id]
    );
    const submissionWasUpdated = existingSubmission.length > 0;
    let result;
    if (submissionWasUpdated) {
      await pool.query(
        'UPDATE student_evaluation_submissions SET score = ?, strengths = ?, improvements = ?, responses = ?, status = ? WHERE dispatch_id = ?',
        [finalScore, strengths, improvements, responsePayload, 'submitted', dispatch.id]
      );
      result = { insertId: existingSubmission[0].id };
    } else {
      [result] = await pool.query(
        'INSERT INTO student_evaluation_submissions (dispatch_id, student_id, student_name, score, strengths, improvements, responses, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [dispatch.id, student.id, student.student_name || req.user.username, finalScore, strengths, improvements, responsePayload, 'submitted']
      );
    }

    await pool.query('UPDATE evaluation_dispatches SET status = ? WHERE id = ?', ['submitted', dispatch.id]);
    emitEvaluationUpdate({ type: 'student-submission', dispatchId: dispatch.id, instructorId: dispatch.instructor_id, studentId: student.id });

    try {
      await autoCloseStudentEvaluation(dispatch);
    } catch (autoCloseError) {
      console.error('Student evaluation auto-close failed:', autoCloseError);
    }

    try {
      await notifyDepartmentHead({
        departmentId: student.department_id,
        title: submissionWasUpdated ? 'Student evaluation updated' : 'Student evaluation submitted',
        message: `${student.student_name || 'A student'} ${submissionWasUpdated ? 'updated' : 'submitted'} an evaluation for ${dispatch.course_name || 'your course'}.`,
      });
    } catch (notificationError) {
      console.error('Student evaluation notification failed:', notificationError);
    }

    return sendResponse(res, 201, 'Student evaluation submitted.', 'የተማሪ ግምገማ ተላክቷል።', { id: result.insertId });
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, 'Unable to submit student evaluation.', 'የተማሪ ግምገማ ለማስገባት አልተቻለም።');
  }
});

app.post('/api/evaluations/submit-student', authenticate, authorizeRoles('student'), async (req, res) => {
  try {
    const { dispatch_id, score, strengths = '', improvements = '', responses = {} } = req.body;
    if (!dispatch_id) {
      return sendResponse(res, 400, 'Dispatch ID is required.', 'Dispatch ID ያስፈልጋል።');
    }
    const feedbackValidation = validateEvaluationFeedbackPair(strengths, improvements);
    if (!feedbackValidation.valid) return sendResponse(res, 400, feedbackValidation.errors[0], feedbackValidation.errors[0]);

    // Validate that responses are not empty
    const responseValues = Array.isArray(responses) ? responses : (responses && typeof responses === 'object' ? Object.values(responses) : []);
    if (responseValues.length === 0) {
      return sendResponse(res, 400, 'Please answer all criteria questions before submitting.', 'ሁሉንም ጥያቄዎች መልስ ከመስጠት በፊት እባክዎ ያስገቡ።');
    }

    const hasResponses = Array.isArray(responses)
      ? responses.length > 0
      : Object.keys(responses || {}).length > 0;
    const finalScore = hasResponses
      ? Number(calculateLikertPercentage(responses).toFixed(2))
      : Number(score || 0);

    const [studentRows] = await pool.query("SELECT id, department_id, CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) AS student_name FROM students WHERE user_id = ? LIMIT 1", [req.user.id]);
    if (!studentRows.length) {
      return sendResponse(res, 404, 'Student record not found.', 'የተማሪ መረጃ አልተገኘም።');
    }

    const student = studentRows[0];
    const [dispatchRows] = await pool.query('SELECT * FROM evaluation_dispatches WHERE id = ? AND student_id = ? LIMIT 1', [dispatch_id, student.id]);
    if (!dispatchRows.length) {
      return sendResponse(res, 404, 'Dispatch not found.', 'Dispatch አልተገኘም።');
    }

    const dispatch = dispatchRows[0];
    const responsePayload = JSON.stringify(
      responses && typeof responses === 'object' ? responses : {}
    );

    // Check if submission already exists for this dispatch
    const [existingSubmission] = await pool.query(
      'SELECT id FROM student_evaluation_submissions WHERE dispatch_id = ? LIMIT 1',
      [dispatch.id]
    );
    const submissionWasUpdated = existingSubmission.length > 0;

    let result;
    if (submissionWasUpdated) {
      // Update existing submission
      await pool.query(
        'UPDATE student_evaluation_submissions SET score = ?, strengths = ?, improvements = ?, responses = ?, status = ? WHERE dispatch_id = ?',
        [finalScore, strengths, improvements, responsePayload, 'submitted', dispatch.id]
      );
      result = { insertId: existingSubmission[0].id };
    } else {
      // Insert new submission
      [result] = await pool.query(
        'INSERT INTO student_evaluation_submissions (dispatch_id, student_id, student_name, score, strengths, improvements, responses, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [dispatch.id, student.id, student.student_name || req.user.username, finalScore, strengths, improvements, responsePayload, 'submitted']
      );
    }

    await pool.query('UPDATE evaluation_dispatches SET status = ? WHERE id = ?', ['submitted', dispatch.id]);
    emitEvaluationUpdate({ type: 'student-submission', dispatchId: dispatch.id, instructorId: dispatch.instructor_id, studentId: student.id });

    try {
      await autoCloseStudentEvaluation(dispatch);
    } catch (autoCloseError) {
      console.error('Student evaluation auto-close failed:', autoCloseError);
    }

    try {
      await notifyDepartmentHead({
        departmentId: student.department_id,
        title: submissionWasUpdated ? 'Student evaluation updated' : 'Student evaluation submitted',
        message: `${student.student_name || 'A student'} ${submissionWasUpdated ? 'updated' : 'submitted'} an evaluation for ${dispatch.course_name || 'your course'}.`,
      });
    } catch (notificationError) {
      console.error('Student evaluation notification failed:', notificationError);
    }

    return sendResponse(res, 201, 'Student evaluation submitted.', 'የተማሪ ግምገማ ተላክቷል።', { id: result.insertId });
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, 'Unable to submit student evaluation.', 'የተማሪ ግምገማ ለማስገባት አልተቻለም።');
  }
});

app.post('/api/evaluations/submit-peer', authenticate, authorizeRoles('instructor', 'lab_assistant', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'admin'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { peer_evaluation_id, score, strengths = '', suggestions = '', responses = {} } = req.body;
    if (!peer_evaluation_id) {
      return sendResponse(res, 400, 'Peer evaluation ID is required.', 'Peer evaluation ID ያስፈልጋል።');
    }

    // Validate that responses are not empty
    const responseValues = Array.isArray(responses) ? responses : (responses && typeof responses === 'object' ? Object.values(responses) : []);
    if (responseValues.length === 0) {
      return sendResponse(res, 400, 'Please answer all criteria questions before submitting.', 'ሁሉንም ጥያቄዎች መልስ ከመስጠት በፊት እባክዎ ያስገቡ።');
    }

    const [[evaluatorProfile]] = await connection.query(
      'SELECT id, department_id FROM instructors WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );
    const evaluatorInstructorId = Number(evaluatorProfile?.id || 0);
    const academicYear = String(req.body.academic_year || new Date().getFullYear());
    const semester = String(req.body.semester || 'Semester I');
    if (!evaluatorInstructorId || !evaluatorProfile?.department_id || !await isPeerPublicationActive(evaluatorProfile.department_id, academicYear, semester)) {
      return sendResponse(res, 403, 'Peer evaluation is not currently published.', 'የባልደረባ ግምገማ አሁን አልታተመም።');
    }

    const scores = Array.isArray(responses)
      ? responses
      : (responses && typeof responses === 'object')
        ? Object.values(responses)
        : [];

    const ratedScores = getRatedLikertValues(Object.fromEntries(scores.map((value, index) => [index, value])));
    const hasValidResponses = scores.every(isValidLikertResponse);
    if (!hasValidResponses || !ratedScores.length) {
      return sendResponse(res, 400, 'Please provide valid 1-5 ratings or NA.', 'እባክዎ ትክክለኛ 1-5 ደረጃ ወይም NA ያስገቡ።');
    }
    const finalScore = Number(calculateLikertPercentage(Object.fromEntries(scores.map((value, index) => [index, value]))).toFixed(2));

    const [peerRows] = await connection.query(
      `SELECT pe.*, target.id AS target_instructor_id,
          ed.academic_year AS dispatch_academic_year,
          ed.semester AS dispatch_semester
       FROM peer_evaluations pe
       INNER JOIN instructors target ON target.id = pe.evaluatee_id
       LEFT JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
       WHERE pe.id = ? AND pe.evaluator_id = ? LIMIT 1`,
      [peer_evaluation_id, evaluatorInstructorId]
    );
    if (!peerRows.length) {
      return sendResponse(res, 404, 'Peer evaluation assignment was not found for this evaluator.', 'የባልደረባ ግምገማ ለዚህ ገምጋሚ አልተገኘም።');
    }

    const peerEval = peerRows[0];
    const responsePayload = JSON.stringify(
      responses && typeof responses === 'object' ? responses : {}
    );

    // Check if submission already exists for this peer evaluation and evaluator
    await connection.beginTransaction();
    const [existingSubmission] = await connection.query(
      'SELECT id FROM peer_evaluation_submissions WHERE peer_evaluation_id = ? AND evaluator_id = ? LIMIT 1',
      [peerEval.id, req.user.id]
    );

    let result;
    if (existingSubmission.length > 0) {
      // Update existing submission
      await connection.query(
        'UPDATE peer_evaluation_submissions SET evaluatee_id = ?, score = ?, strengths = ?, suggestions = ?, responses = ?, status = ? WHERE peer_evaluation_id = ? AND evaluator_id = ?',
        [peerEval.evaluatee_id, finalScore, strengths, suggestions, responsePayload, 'submitted', peerEval.id, req.user.id]
      );
      result = { insertId: existingSubmission[0].id };
    } else {
      // Insert new submission
      [result] = await connection.query(
        'INSERT INTO peer_evaluation_submissions (peer_evaluation_id, evaluator_id, evaluatee_id, score, strengths, suggestions, responses, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [peerEval.id, req.user.id, peerEval.evaluatee_id, finalScore, strengths, suggestions, responsePayload, 'submitted']
      );
    }

    await connection.query('UPDATE peer_evaluations SET status = ? WHERE id = ?', ['submitted', peerEval.id]);
    await connection.query(
      `UPDATE peer_evaluation_publications p
       INNER JOIN evaluation_dispatches ed ON ed.department_id = p.department_id
         AND ed.academic_year = p.academic_year AND ed.semester = p.semester
       INNER JOIN peer_evaluations assigned ON assigned.dispatch_id = ed.id
       SET p.started_at = COALESCE(p.started_at, CURRENT_TIMESTAMP)
       WHERE assigned.id = ?`,
      [peerEval.id]
    );
    await calculateAndSaveInstructorResult(
      peerEval.evaluatee_id,
      peerEval.dispatch_academic_year || academicYear,
      peerEval.dispatch_semester || semester,
      connection
    );
    await connection.commit();
    emitEvaluationUpdate({
      type: 'peer-submission',
      peerEvaluationId: peerEval.id,
      instructorId: peerEval.evaluatee_id,
      evaluatorId: req.user.id,
    });

    try {
      const [[evaluatee]] = await pool.query(
        'SELECT user_id, department_id, CONCAT(COALESCE(first_name, \'\'), \' \', COALESCE(last_name, \'\')) AS instructor_name FROM instructors WHERE id = ? LIMIT 1',
        [peerEval.evaluatee_id]
      );
      if (evaluatee?.department_id) {
        const peerMessage = `${req.user.username || 'An instructor'} completed a peer evaluation for ${evaluatee.instructor_name || 'an instructor'}.`;
        const [headRows] = await pool.query(
          `SELECT i.user_id
           FROM instructors i
           INNER JOIN users u ON u.id = i.user_id
           WHERE i.department_id = ? AND LOWER(u.role) IN ('dept_head', 'department_head')
             AND LOWER(COALESCE(u.status, 'active')) = 'active'`,
          [evaluatee.department_id]
        );
        await createNotifications({
          userIds: [evaluatee.user_id, ...headRows.map((head) => head.user_id)],
          title: 'Peer evaluation completed',
          message: peerMessage,
          type: 'peer_evaluation_completed',
        });
      }
    } catch (notificationError) {
      console.error('Peer evaluation notification failed:', notificationError);
    }

    return sendResponse(res, 201, 'Peer evaluation submitted.', 'የባልደረባ ግምገባ ተላክቷል።', { id: result.insertId });
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Peer submission rollback failed:', rollbackError); }
    console.error('Peer evaluation submission failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to submit peer evaluation.', error: error.message });
  } finally {
    connection.release();
  }
});

// List evaluation dispatches (admin/dept_head/instructor)
app.get('/api/evaluations/dispatches', authenticate, authorizeRoles('admin', 'dept_head', 'instructor'), async (req, res) => {
  try {
    const { status = null, created_by = null } = req.query;
    const where = [];
    const params = [];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (created_by) {
      where.push('created_by = ?');
      params.push(created_by);
    }
    const query = `SELECT * FROM evaluation_dispatches ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
    const [rows] = await pool.query(query, params);
    return sendResponse(res, 200, 'Dispatches retrieved.', 'የማስተላለፊያ ዝርዝር ተመልሷል።', rows);
  } catch (error) {
    console.error('Failed to list dispatches:', error?.message || error);
    return sendResponse(res, 500, 'Unable to list dispatches.', 'የማስተላለፊያ ማውጫ አልተሳካም።', []);
  }
});

// List submissions (admin/dept_head/instructor)
app.get('/api/evaluations/submissions', authenticate, authorizeRoles('admin', 'dept_head', 'instructor'), async (req, res) => {
  try {
    const { dispatch_id = null, student_id = null } = req.query;
    const where = [];
    const params = [];
    if (dispatch_id) {
      where.push('dispatch_id = ?');
      params.push(dispatch_id);
    }
    if (student_id) {
      where.push('student_id = ?');
      params.push(student_id);
    }
    const query = `SELECT * FROM student_evaluation_submissions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
    const [rows] = await pool.query(query, params);
    const sanitizedRows = rows.map((row) => ({
      ...row,
      feedback: sanitizeEvaluationFeedback(row.feedback),
      strengths: sanitizeEvaluationFeedback(row.strengths),
      improvements: sanitizeEvaluationFeedback(row.improvements),
    }));
    return sendResponse(res, 200, 'Submissions retrieved.', 'የግምገማ ሰነዶች ተመልሰዋል።', sanitizedRows);
  } catch (error) {
    console.error('Failed to list submissions:', error?.message || error);
    return sendResponse(res, 500, 'Unable to list submissions.', 'የግምገማ ሰነዶችን ለማግኘት አልተቻለም።', []);
  }
});

app.put('/api/evaluations/:id', authenticate, async (req, res) => {
  try {
    const { score, feedback, status } = req.body;
    const [rows] = await pool.query('SELECT * FROM evaluations WHERE id = ? LIMIT 1', [req.params.id]);

    if (!rows.length) {
      return sendResponse(res, 404, 'Evaluation not found.', 'ግምገማ አልተገኘም።');
    }

    const evaluation = rows[0];
    if (Number(evaluation.evaluator_id) !== Number(req.user.id)) {
      return sendResponse(res, 403, 'You can only update your own evaluation.', 'የራስዎን ግምገማ ብቻ ማዘመን ይችላሉ።');
    }
    if (evaluation.editable_until && new Date(evaluation.editable_until).getTime() <= Date.now()) {
      return sendResponse(res, 403, 'This evaluation can no longer be edited because the 72-hour window has expired.', 'የ72 ሰዓት የማስተካከያ ጊዜ ስላለፈ ይህ ግምገማ ከአሁን በኋላ ሊስተካከል አይችልም።');
    }

    const updateFields = [];
    const values = [];

    if (score !== undefined) {
      updateFields.push('score = ?');
      values.push(score);
    }
    if (feedback !== undefined) {
      updateFields.push('feedback = ?');
      values.push(feedback);
    }
    if (status) {
      updateFields.push('status = ?');
      values.push(status);
    }

    if (!updateFields.length) {
      return sendResponse(res, 400, 'No update fields provided.', 'ምንም የማዘመኛ መስኮች አልተሰጡም።');
    }

    updateFields.push('is_updated = TRUE');
    values.push(req.params.id);
    await pool.query(`UPDATE evaluations SET ${updateFields.join(', ')} WHERE id = ?`, values);
    return sendResponse(res, 200, 'Evaluation updated successfully.', 'ግምገማ በተሳካ ሁኔታ ተዘምኗል።');
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, 'Unable to update evaluation.', 'ግምገማ ለመዘመን አልተቻለም።');
  }
});

app.get('/', (req, res) => {
  return sendResponse(res, 200, 'Welcome to the IEPS API.', 'እንኳን ወደ IEPS API በደህና መጡ።');
});

const startServer = async () => {
  if (process.env.SKIP_SCHEMA_INIT !== 'true') {
    try {
      await initializeSchema();
    } catch (error) {
      const details = Array.isArray(error.errors)
        ? error.errors.map((item) => `${item.code || 'ERROR'} ${item.address || ''}:${item.port || ''}`.trim()).join(', ')
        : error.message;
      console.error(`Database initialization failed; API will start without database access: ${details}`);
    }
  } else {
    console.log('Skipping schema initialization (SKIP_SCHEMA_INIT=true)');
  }

  const handleServerError = (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n❌ ERROR: API port ${PORT} is already in use.`);
      console.error(`   Stop the existing backend process or set a different PORT.`);
      console.error(`   To use a different port, run: PORT=5006 npm start\n`);
      io.close();
      process.exit(1);
    }
    console.error('API server error:', error);
    process.exit(1);
  };
  // Add form expiration middleware
  app.use(autoExpireFormsMiddleware);

  httpServer.once('error', handleServerError);
  httpServer.listen(PORT, () => {
    httpServer.removeListener('error', handleServerError);
    console.log(`\n✅ IEPS API listening on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);

    startTelegramBot();
    startCronService();

    // Initialize form expiration scheduler (runs every 30 minutes)
    initFormExpirationScheduler();
    console.log(`✅ Form expiration scheduler initialized (checks every 30 minutes)`);
  });
};

if (require.main === module) {
  startServer();
}

module.exports = app;
