const express = require('express');
const pool = require('../config/db');
const {
  submitDepartmentHeadEvaluation,
  submitStudentEvaluation,
  getActiveEvaluationForms,
  publishEvaluationForm,
  autoExpireForms,
  getPerformanceWithStudentEvaluations,
  getInstructorEvaluationDetails,
  getAcademicDirectorateCandidates,
  getVicePresidentAcademicDirectorateEvaluations,
  evaluateAcademicDirectorate,
} = require('../controllers/evaluationController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { getConsolidatedStudentScore } = require('../controllers/studentEvalController');
const { getDirectoratePerformance } = require('../controllers/directoratePerformanceController');
const { getDepartmentEvaluationDeadline } = require('../services/evaluationDeadlineService');

const router = express.Router();

router.get('/academic-directorate-list', authenticateToken, authorizeRoles('academic_vice_president'), getAcademicDirectorateCandidates);
router.get('/academic-directorate-evaluations', authenticateToken, authorizeRoles('academic_vice_president'), getVicePresidentAcademicDirectorateEvaluations);
router.post('/evaluate-academic-directorate', authenticateToken, authorizeRoles('academic_vice_president'), evaluateAcademicDirectorate);
router.get('/directorate-performance', authenticateToken, authorizeRoles('academic_directorate', 'academic_director', 'directorate', 'academic_vice_president'), getDirectoratePerformance);

/**
 * Department Head Evaluation Submission
 * POST /api/evaluations/submit
 * Supports both Instructor and Lab Assistant targets
 */
router.post(
  '/submit',
  authenticateToken,
  authorizeRoles('dept_head', 'admin'),
  submitDepartmentHeadEvaluation
);

/**
 * Student Course Evaluation Submission
 * POST /api/evaluations/submit-student
 * Routes to BOTH Instructor and Lab Assistant if assigned
 */
router.post(
  '/submit-student',
  authenticateToken,
  authorizeRoles('student'),
  submitStudentEvaluation
);

/**
 * Get Active Evaluation Forms
 * GET /api/evaluations/active-forms
 * Returns only non-expired forms
 */
router.get(
  '/active-forms',
  authenticateToken,
  getActiveEvaluationForms
);

router.get('/active-deadline', authenticateToken, authorizeRoles('student', 'instructor', 'lab_assistant', 'dept_head', 'dean', 'college_dean', 'academic_director', 'academic_directorate', 'directorate', 'academic_vice_president', 'admin'), async (req, res) => {
  const departmentId = Number(req.user?.department_id || req.user?.departmentId || req.user?.department || 0);
  try {
    return res.json(await getDepartmentEvaluationDeadline(pool, departmentId));
  } catch (error) {
    console.error('Active evaluation deadline fetch failed:', error);
    return res.status(500).json({ message: 'Unable to load active evaluation deadline.' });
  }
});

/**
 * Publish Evaluation Form (3-day expiration)
 * POST /api/evaluations/publish-form
 * Sets expires_at to NOW + 72 hours
 */
router.post(
  '/publish-form',
  authenticateToken,
  authorizeRoles('dept_head', 'dean', 'academic_director', 'admin'),
  publishEvaluationForm
);

/**
 * Auto-Expire Forms (Cron Job)
 * GET /api/evaluations/auto-expire
 * Called by scheduled task or middleware to mark expired forms as inactive
 */
router.get(
  '/auto-expire',
  authenticateToken,
  authorizeRoles('admin'),
  async (req, res) => {
    const result = await autoExpireForms();
    res.json(result);
  }
);

/**
 * Get Performance with Student Evaluations
 * GET /api/evaluations/performance
 * Returns combined student and department head evaluation scores
 */
router.get(
  '/performance',
  authenticateToken,
  getPerformanceWithStudentEvaluations
);

router.get(
  '/instructor-details/:instructorId',
  authenticateToken,
  authorizeRoles('dept_head'),
  getInstructorEvaluationDetails
);

/**
 * Get one student-evaluation aggregate across all instructor assignments in a term
 * GET /api/evaluations/consolidated-student-score/:instructorId
 */
router.get(
  '/consolidated-student-score/:instructorId',
  authenticateToken,
  authorizeRoles('instructor', 'dept_head', 'college_dean', 'dean', 'academic_director', 'directorate', 'admin'),
  getConsolidatedStudentScore
);

module.exports = router;
