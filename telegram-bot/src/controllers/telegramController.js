const { findUserByEmailOrId } = require('../services/userAuthService');

const verifyTelegramUser = async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier || !String(identifier).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email or Employee/Student ID is required.',
      });
    }

    const user = await findUserByEmailOrId(identifier);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No active account matched the provided email or ID.',
      });
    }

    if (!user.allowed) {
      return res.status(403).json({
        success: false,
        message: 'This role is not permitted to use the IPES Telegram bot.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile_id: user.profile_id,
      },
      message: 'User verified successfully.',
    });
  } catch (error) {
    console.error('Telegram verification controller error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while verifying Telegram user.',
    });
  }
};

module.exports = {
  verifyTelegramUser,
};
