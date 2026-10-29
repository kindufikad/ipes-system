const express = require('express');
const { login, me, registerInstructor, registerLabAssistant, changePassword, logout, forgotPassword, resetPassword } = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

router.get('/me', authenticateToken, me);
router.post('/login', login);
router.post('/register-instructor', authenticateToken, authorizeRoles('admin', 'systemadmin', 'dept_head'), registerInstructor);
router.post('/register-lab-assistant', authenticateToken, authorizeRoles('admin', 'systemadmin'), registerLabAssistant);
router.post('/change-password', authenticateToken, changePassword);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
