const express = require('express');
const { getSystemStats, getContactInfo, getLandingContent } = require('../controllers/publicController');

const router = express.Router();

router.get('/system-stats', getSystemStats);
router.get('/contact-info', getContactInfo);
router.get('/landing-content', getLandingContent);

module.exports = router;