const pool = require('../config/db');

/**
 * Middleware to auto-expire evaluation forms that have passed the 72-hour window
 * Called at server startup and can be invoked periodically
 */
const autoExpireFormsMiddleware = async (req, res, next) => {
  try {
    const [result] = await pool.query(
      `UPDATE evaluation_forms
       SET is_published = 0, updated_at = CURRENT_TIMESTAMP
       WHERE is_published = 1 AND expires_at < NOW()`
    );

    if (result.affectedRows > 0) {
      console.log(`✓ Auto-expired ${result.affectedRows} evaluation forms`);
    }
  } catch (error) {
    console.error('Form auto-expiration error:', error);
  }

  next();
};

/**
 * Initialize periodic form expiration check
 * Runs every 30 minutes to check and expire forms
 */
const initFormExpirationScheduler = () => {
  setInterval(async () => {
    try {
      const [result] = await pool.query(
        `UPDATE evaluation_forms
         SET is_published = 0, updated_at = CURRENT_TIMESTAMP
         WHERE is_published = 1 AND expires_at < NOW()`
      );

      if (result.affectedRows > 0) {
        console.log(`[${new Date().toISOString()}] Auto-expired ${result.affectedRows} evaluation forms`);
      }
    } catch (error) {
      console.error('Scheduled form expiration error:', error);
    }
  }, 30 * 60 * 1000); // Run every 30 minutes
};

module.exports = {
  autoExpireFormsMiddleware,
  initFormExpirationScheduler,
};
