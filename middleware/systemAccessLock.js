const jwt = require('jsonwebtoken');
const { getSystemAccessLock } = require('../services/securityControlService');
const { isSystemAdminRole } = require('../utils/systemAdminPolicy');

const isAuthenticatedSystemAdmin = (req) => {
  const authorization = String(req.headers?.authorization || '');
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return false;

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET || 'change-this-secret');
    return isSystemAdminRole(payload?.role || payload?.user_role);
  } catch (_error) {
    return false;
  }
};

const systemAccessLock = async (req, res, next) => {
  const path = String(req.path || '').replace(/\/+$/, '');
  if (!path.startsWith('/api/') || req.method === 'OPTIONS' || path === '/api/auth/login') {
    return next();
  }
  if (isAuthenticatedSystemAdmin(req)) return next();

  try {
    const settings = await getSystemAccessLock();
    if (!settings.isSystemLocked) return next();
    return res.status(503).json({
      success: false,
      code: 'SYSTEM_ACCESS_LOCKED',
      message: settings.lockReason,
    });
  } catch (error) {
    console.error('Unable to verify system access lock state:', error);
    return res.status(503).json({
      success: false,
      code: 'SYSTEM_ACCESS_STATUS_UNAVAILABLE',
      message: 'Unable to verify system access. Please try again later.',
    });
  }
};

module.exports = systemAccessLock;
