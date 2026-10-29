const rateLimit = require('express-rate-limit');
const pool = require('../config/db');

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCKOUT_MINUTES = 15;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;

const normalizeIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const primaryForward = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]
      : '';

  const rawIp = String(primaryForward || req.socket?.remoteAddress || req.ip || '').trim();
  const ip = rawIp.replace(/^::ffff:/i, '');
  return ip || 'unknown';
};

const isLocalDevelopmentIp = (ip) => LOCALHOST_IPS.has(String(ip || '').trim()) && process.env.NODE_ENV === 'development';

const getRemainingRetrySeconds = (expiresAt) => {
  const expiresTimestamp = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresTimestamp)) return LOCKOUT_MINUTES * 60;
  return Math.max(1, Math.ceil((expiresTimestamp - Date.now()) / 1000));
};

const applyLockoutHeaders = (res, retryAfterSeconds = LOCKOUT_MINUTES * 60) => {
  res.setHeader('Retry-After', String(Math.max(1, retryAfterSeconds)));
  res.setHeader('X-RateLimit-Limit', String(MAX_FAILED_LOGINS));
  res.setHeader('X-RateLimit-Remaining', '0');
};

const sendTemporaryLockout = (res, expiresAt) => {
  const retryAfterSeconds = getRemainingRetrySeconds(expiresAt || new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000));
  applyLockoutHeaders(res, retryAfterSeconds);
  return res.status(429).json({
    success: false,
    code: 'IP_TEMPORARILY_LOCKED',
    message: 'Too many failed attempts. Your IP has been temporarily locked for 15 minutes.',
    retryAfterSeconds,
    retryAfterMinutes: Math.ceil(retryAfterSeconds / 60),
  });
};

const getActiveBlock = async (ip) => {
  if (!ip || ip === 'unknown') return null;
  if (isLocalDevelopmentIp(ip)) return null;

  try {
    const [rows] = await pool.query(
      `SELECT ip_address, reason, blocked_at, expires_at, is_permanent
       FROM blocked_ips
       WHERE ip_address = ?
         AND (is_permanent = 1 OR expires_at IS NULL OR expires_at > NOW())
       ORDER BY blocked_at DESC
       LIMIT 1`,
      [ip]
    );

    return rows[0] || null;
  } catch (error) {
    console.warn('Unable to check blocked IP record:', error?.message || error);
    return null;
  }
};

const createBlockedIpRecord = async ({ ip, reason = 'Too many failed attempts', expiresAt = null, isPermanent = false }) => {
  if (!ip || ip === 'unknown') return null;
  if (process.env.NODE_ENV === 'development' && isLocalDevelopmentIp(ip)) return null;

  const safeExpiresAt = expiresAt || new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS blocked_ips (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(64) NOT NULL,
        reason VARCHAR(255) NOT NULL,
        blocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NULL,
        is_permanent TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_blocked_ips_ip (ip_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    const [result] = await pool.query(
      `INSERT INTO blocked_ips (ip_address, reason, blocked_at, expires_at, is_permanent)
       VALUES (?, ?, NOW(), ?, ?)
       ON DUPLICATE KEY UPDATE
         reason = VALUES(reason),
         blocked_at = VALUES(blocked_at),
         expires_at = VALUES(expires_at),
         is_permanent = VALUES(is_permanent),
         updated_at = CURRENT_TIMESTAMP`,
      [ip, reason, safeExpiresAt, isPermanent ? 1 : 0]
    );

    return result;
  } catch (error) {
    console.warn('Unable to write temporary lockout record:', error?.message || error);
    return null;
  }
};

const securityMiddleware = async (req, res, next) => {
  const ip = normalizeIp(req);

  if (isLocalDevelopmentIp(ip)) {
    return next();
  }

  const activeBlock = await getActiveBlock(ip);
  if (activeBlock) {
    return sendTemporaryLockout(res, activeBlock.expires_at || new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000));
  }

  return next();
};

const loginRateLimiter = rateLimit({
  windowMs: LOCKOUT_WINDOW_MS,
  max: MAX_FAILED_LOGINS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => normalizeIp(req),
  skip: (req) => isLocalDevelopmentIp(normalizeIp(req)),
  handler: async (req, res) => {
    const ip = normalizeIp(req);
    if (!isLocalDevelopmentIp(ip)) {
      await createBlockedIpRecord({
        ip,
        reason: 'Too many failed login attempts',
        expiresAt: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
        isPermanent: false,
      });
    }

    const retrySeconds = LOCKOUT_MINUTES * 60;
    applyLockoutHeaders(res, retrySeconds);
    return res.status(429).json({
      success: false,
      code: 'IP_TEMPORARILY_LOCKED',
      message: 'Too many failed attempts. Your IP has been temporarily locked for 15 minutes.',
      retryAfterSeconds: retrySeconds,
      retryAfterMinutes: LOCKOUT_MINUTES,
    });
  },
});

module.exports = {
  LOCALHOST_IPS,
  MAX_FAILED_LOGINS,
  LOCKOUT_MINUTES,
  createBlockedIpRecord,
  getActiveBlock,
  isLocalDevelopmentIp,
  loginRateLimiter,
  normalizeIp,
  securityMiddleware,
  sendTemporaryLockout,
};
