const jwt = require('jsonwebtoken');
const { getClientIp, getSecurityControlSettings, isIpBlocked, isLocalDevelopmentIp } = require('../services/securityControlService');

const isPrivilegedAdministrator = (req) => {
  const authorization = String(req.headers?.authorization || '');
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return false;
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET || 'change-this-secret');
    return ['admin', 'systemadmin', 'system_admin'].includes(String(payload?.role || '').toLowerCase());
  } catch (_error) {
    return false;
  }
};

const securityGate = async (req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  try {
    const clientIp = getClientIp(req);
    if (isLocalDevelopmentIp(clientIp)) {
      return next();
    }
    if (await isIpBlocked(clientIp)) {
      return res.status(403).json({ success: false, code: 'IP_BLOCKED', message: 'This IP address is blocked by the security administrator.' });
    }
    const controls = await getSecurityControlSettings();
    if (controls.maintenanceModeEnabled && !isPrivilegedAdministrator(req)) {
      return res.status(503).json({ success: false, code: 'MAINTENANCE_MODE', message: 'The system is temporarily unavailable for scheduled maintenance.' });
    }
    return next();
  } catch (error) {
    console.error('Security gate check failed:', error?.message || error);
    return next();
  }
};

module.exports = securityGate;
