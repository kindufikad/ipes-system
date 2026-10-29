const express = require('express');
const { verifyTelegramUser } = require('../controllers/telegramController');
const { sendTelegramNotification } = require('../services/notificationService');
const { authenticateToken, authorizeRoles } = require('../../../middleware/auth');

const router = express.Router();

router.post('/verify', verifyTelegramUser);

router.post('/broadcast', authenticateToken, authorizeRoles('admin', 'systemadmin', 'system_admin'), async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        success: false,
        message: 'userId and message are required.',
      });
    }

    const result = await sendTelegramNotification(Number(userId), message);

    return res.status(result.success ? 200 : 400).json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Telegram broadcast error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to send Telegram notification.',
    });
  }
});

module.exports = router;
