const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { getAdminDashboardStats, getDepartmentAnalytics, getSecurityLogs, exportSecurityLogs, getDatabaseHealth, getSystemHealth, triggerBackup, updateBackupRetention, updateSystemLock, cleanupSecurityLogs, createCollege, getColleges, getDepartmentsByCollege, getCollegesWithDepartments, getManagementRoleOccupant, assignRoleWithHierarchy, resetManagementRole, resetUserPassword, updateUserByAdmin, toggleUserArchive, deleteUserByAdmin, getRoleCandidates, getLandingContentAdmin, updateLandingContent, deleteLandingContent, getLandingPageSettingsAdmin, createLandingPageSetting, updateLandingPageSettings, deleteLandingPageSetting, getContactSettings, updateContactSetting, updateAdminProfile } = require('../controllers/adminController');
const { getDatabaseHealth: getSystemAdminDatabaseHealth, getSystemHealth: getSystemAdminSystemHealth } = require('../controllers/systemAdminController');
const { changePassword } = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { sendBotBroadcast } = require('../controllers/broadcastController');
const socSecurityController = require('../controllers/securityController');

const router = express.Router();
const uploadDirectory = path.join(__dirname, '..', 'uploads', 'landing');
fs.mkdirSync(uploadDirectory, { recursive: true });
const landingUpload = multer({
	storage: multer.diskStorage({
		destination: (_req, _file, callback) => callback(null, uploadDirectory),
		filename: (_req, file, callback) => callback(null, `landing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname).toLowerCase()}`),
	}),
	limits: { fileSize: 10 * 1024 * 1024 },
	fileFilter: (_req, file, callback) => callback(null, file.mimetype.startsWith('image/')),
});

router.get('/dashboard-stats', authenticateToken, authorizeRoles('admin', 'systemadmin'), getAdminDashboardStats);
router.get('/department-analytics', authenticateToken, authorizeRoles('admin', 'systemadmin'), getDepartmentAnalytics);
router.get('/security-logs/export', authenticateToken, authorizeRoles('admin', 'systemadmin'), exportSecurityLogs);
router.get('/security-logs', authenticateToken, authorizeRoles('admin', 'systemadmin'), getSecurityLogs);
router.delete('/security-logs', authenticateToken, authorizeRoles('admin', 'systemadmin'), cleanupSecurityLogs);
router.get('/security/controls', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.getSecurityControls);
router.post('/toggle-system-lock', authenticateToken, authorizeRoles('admin', 'systemadmin', 'system_admin'), socSecurityController.toggleSystemAccessLock);
router.get('/security/sessions', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.getActiveSessions);
router.delete('/security/sessions/:sessionId', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.revokeActiveSession);
router.get('/security/failed-logins', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.getFailedLoginActivity);
router.put('/security/blocked-ips', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.updateBlockedIp);
router.delete('/security/blocked-ips', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.deleteBlockedIp);
router.get('/security/api-keys', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.getSecurityApiKeys);
router.post('/security/api-keys', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.createSecurityApiKey);
router.put('/security/api-keys/:keyId/rotate', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.rotateSecurityApiKey);
router.delete('/security/api-keys/:keyId', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.revokeSecurityApiKey);
router.put('/maintenance-mode', authenticateToken, authorizeRoles('admin', 'systemadmin'), socSecurityController.updateMaintenanceMode);
router.get('/database-health', authenticateToken, authorizeRoles('admin', 'systemadmin'), getSystemAdminDatabaseHealth);
router.get('/system-health', authenticateToken, authorizeRoles('admin', 'systemadmin'), getSystemAdminSystemHealth);
router.post('/trigger-backup', authenticateToken, authorizeRoles('admin', 'systemadmin'), triggerBackup);
router.put('/backup-retention', authenticateToken, authorizeRoles('admin', 'systemadmin'), updateBackupRetention);
router.put('/system-lock', authenticateToken, authorizeRoles('admin', 'systemadmin'), updateSystemLock);
router.put('/profile', authenticateToken, authorizeRoles('admin', 'systemadmin'), updateAdminProfile);
router.put('/change-password', authenticateToken, authorizeRoles('admin', 'systemadmin'), changePassword);
router.get('/colleges', authenticateToken, authorizeRoles('admin', 'systemadmin'), getColleges);
router.get('/colleges-with-departments', authenticateToken, authorizeRoles('admin', 'systemadmin'), getCollegesWithDepartments);
router.get('/departments', authenticateToken, authorizeRoles('admin', 'systemadmin'), getDepartmentsByCollege);
router.post('/colleges', authenticateToken, authorizeRoles('admin', 'systemadmin'), createCollege);
router.get('/management-role-occupant', authenticateToken, authorizeRoles('admin', 'systemadmin'), getManagementRoleOccupant);
router.put('/users/:id/management-role', authenticateToken, authorizeRoles('admin', 'systemadmin'), assignRoleWithHierarchy);
router.put('/users/:id/management-role/reset', authenticateToken, authorizeRoles('admin', 'systemadmin'), resetManagementRole);
router.put('/users/:id/password/reset', authenticateToken, authorizeRoles('admin', 'systemadmin'), resetUserPassword);
router.put('/users/:id', authenticateToken, authorizeRoles('admin', 'systemadmin'), updateUserByAdmin);
router.put('/users/:id/toggle-archive', authenticateToken, authorizeRoles('admin', 'systemadmin'), toggleUserArchive);
router.delete('/users/:id', authenticateToken, authorizeRoles('admin', 'systemadmin'), deleteUserByAdmin);
router.get('/role-candidates', authenticateToken, authorizeRoles('admin', 'systemadmin'), getRoleCandidates);
router.get('/landing-content', authenticateToken, authorizeRoles('admin', 'systemadmin'), getLandingContentAdmin);
router.post('/landing-content/:key', authenticateToken, authorizeRoles('admin', 'systemadmin'), landingUpload.array('files', 10), updateLandingContent);
router.delete('/landing-content/:key', authenticateToken, authorizeRoles('admin', 'systemadmin'), deleteLandingContent);
router.get('/landing-page-settings', authenticateToken, authorizeRoles('admin', 'systemadmin'), getLandingPageSettingsAdmin);
router.post('/landing-page-settings', authenticateToken, authorizeRoles('admin', 'systemadmin'), landingUpload.array('files', 10), createLandingPageSetting);
router.put('/landing-page-settings', authenticateToken, authorizeRoles('admin', 'systemadmin'), updateLandingPageSettings);
router.delete('/landing-page-settings', authenticateToken, authorizeRoles('admin', 'systemadmin'), deleteLandingPageSetting);
router.get('/contact-settings', authenticateToken, authorizeRoles('admin', 'systemadmin'), getContactSettings);
router.put('/contact-settings/:key', authenticateToken, authorizeRoles('admin', 'systemadmin'), updateContactSetting);
router.post('/send-bot-broadcast', authenticateToken, authorizeRoles('admin', 'systemadmin'), sendBotBroadcast);

module.exports = router;