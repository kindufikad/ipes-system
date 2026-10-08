const pool = require('../config/db');
const {
  isLocalDevelopmentIp,
  normalizeIpAddress,
  getSecurityControlSettings,
  updateSecurityControlSettings,
} = require('../services/securityControlService');

const LOCALHOST_BLOCKLIST = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

const normalizeRole = (value = '') => {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'system_admin' || role === 'systemadmin') return 'systemadmin';
  if (role === 'admin') return 'admin';
  return role;
};

const enforceAdminAccess = (req, res) => {
  const currentRole = normalizeRole(req.user?.role || req.user?.user_role || '');
  const allowed = currentRole === 'admin' || currentRole === 'systemadmin';
  if (!allowed) {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'Only System Administrators are allowed to manage IP blocklists.',
    });
  }
  return null;
};

const clearLocalDevelopmentBlockedIps = async () => {
  if (process.env.NODE_ENV !== 'development') return false;
  await pool.query(`CREATE TABLE IF NOT EXISTS blocked_ips (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(64) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    blocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NULL,
    is_permanent TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_blocked_ips_ip (ip_address)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(
    `DELETE FROM blocked_ips WHERE ip_address IN (?, ?, ?)`,
    LOCALHOST_BLOCKLIST
  );
  const settings = await getSecurityControlSettings();
  await updateSecurityControlSettings({
    blockedIps: settings.blockedIps.filter((ip) => !isLocalDevelopmentIp(ip)),
  });
  return true;
};

const removeBlockedIp = async (ipAddress) => {
  await pool.query(`DELETE FROM blocked_ips WHERE ip_address = ?`, [ipAddress]);
  const settings = await getSecurityControlSettings();
  const blockedIps = settings.blockedIps.filter((ip) => ip !== ipAddress);
  await updateSecurityControlSettings({ blockedIps });
  return blockedIps;
};

const getRequestedIp = (req) => {
  const rawIp = String(req.body?.ipAddress || req.params?.ipAddress || '').trim();
  return normalizeIpAddress(rawIp);
};

const deleteBlockedIp = async (req, res) => {
  const forbidden = enforceAdminAccess(req, res);
  if (forbidden) return forbidden;

  const ipAddress = getRequestedIp(req);
  if (!ipAddress) {
    return res.status(400).json({ success: false, message: 'Enter a valid IPv4 or IPv6 address.' });
  }

  try {
    const blockedIps = await removeBlockedIp(ipAddress);
    return res.status(200).json({
      success: true,
      data: {
        ipAddress,
        blocked: false,
        blockedIps,
        message: `IP ${ipAddress} was removed from the blocklist.`,
      },
    });
  } catch (error) {
    console.error('Unable to unblock IP address:', error);
    return res.status(500).json({ success: false, message: 'Unable to update blocked IP address.' });
  }
};

const updateBlockedIp = async (req, res) => {
  const forbidden = enforceAdminAccess(req, res);
  if (forbidden) return forbidden;

  const rawIp = String(req.body?.ipAddress || '').trim();
  const blocked = req.body?.blocked === true;

  if (!rawIp) {
    return res.status(400).json({ success: false, message: 'An IP address is required.' });
  }

  const normalizedIp = normalizeIpAddress(rawIp);
  if (!normalizedIp) {
    return res.status(400).json({ success: false, message: 'Enter a valid IPv4 or IPv6 address.' });
  }

  if (blocked && process.env.NODE_ENV === 'development' && isLocalDevelopmentIp(normalizedIp)) {
    return res.status(400).json({
      success: false,
      message: 'Local development addresses cannot be blocked in development mode.',
    });
  }

  try {
    if (!blocked) {
      const blockedIps = await removeBlockedIp(normalizedIp);
      return res.status(200).json({
        success: true,
        data: {
          ipAddress: normalizedIp,
          blocked: false,
          blockedIps,
          message: `IP ${normalizedIp} was removed from the blocklist.`,
        },
      });
    }

    const settings = await getSecurityControlSettings();
    const sanitizedBlockedIps = settings.blockedIps.filter((ip) => !isLocalDevelopmentIp(ip));
    const blockedIps = [...new Set([...sanitizedBlockedIps, normalizedIp])];
    await updateSecurityControlSettings({ blockedIps });

    return res.json({
      success: true,
      data: { ipAddress: normalizedIp, blocked: true, blockedIps },
    });
  } catch (error) {
    console.error('Unable to update blocked IPs:', error);
    return res.status(500).json({ success: false, message: 'Unable to update blocked IP address.' });
  }
};

module.exports = {
  clearLocalDevelopmentBlockedIps,
  deleteBlockedIp,
  enforceAdminAccess,
  normalizeRole,
  updateBlockedIp,
};
