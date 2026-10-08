const express = require('express');
const { getLatestTemplate, createTemplate, updateTemplate } = require('../controllers/evaluationTemplatesController');
const { authenticate, authorizeRoles } = require('../helpers/authMiddleware') || {};
const router = express.Router();

// Note: index.js already exposes template endpoints; these routes provide a modular alternative.
router.get('/template/latest', authenticate, authorizeRoles('dept_head', 'admin'), getLatestTemplate);
router.post('/template', authenticate, authorizeRoles('dept_head', 'admin'), createTemplate);
router.put('/template/:id', authenticate, authorizeRoles('dept_head', 'admin'), updateTemplate);

module.exports = router;
