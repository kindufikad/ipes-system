const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const {
  getSecurityControlSettings,
  getSystemAccessLock,
  getStoredApiKeys,
  isLocalDevelopmentIp,
  normalizeIpAddress,
  revokeToken,
  saveStoredApiKeys,
  updateSecurityControlSettings,
  updateSystemAccessLock,
} = require('../services/securityControlService');
const { isSystemAdminRole } = require('../utils/systemAdminPolicy');

const KEY_SCOPES = new Set(['read:audit', 'read:health', 'write:users', 'write:evaluations']);

const getRequestSessionStore = (req) => req.app?.get('sessionStore');

const describeDevice = (userAgent = '') => {
  const value = String(userAgent);
  const browser = value.includes('Edg/') ? 'Edge'
    : value.includes('Firefox/') ? 'Firefox'
      : value.includes('Chrome/') ? 'Chrome'
        : value.includes('Safari/') ? 'Safari'
          : 'Unknown browser';
  const os = value.includes('Windows') ? 'Windows'
    : value.includes('Mac OS') ? 'macOS'
      : value.includes('Android') ? 'Android'
        : value.includes('iPhone') || value.includes('iPad') ? 'iOS'
          : value.includes('Linux') ? 'Linux'
            : 'Unknown device';
  return `${browser} · ${os}`;
};

const getActiveSessions = async (req, res) => {
  const store = getRequestSessionStore(req);
  if (typeof store?.all !== 'function') {
    return res.status(503).json({ success: false, message: 'Active session storage is unavailable.' });
  }
  try {
    store.all((error, sessions) => {
      if (error) return res.status(500).json({ success: false, message: 'Unable to retrieve active sessions.' });
      const rows = Array.isArray(sessions) ? sessions.map((session, index) => [String(index), session]) : Object.entries(sessions || {});
      const now = Date.now();
      const activeSessions = rows.flatMap(([sessionId, session]) => {
        if (!session?.user) return [];
        const expiresAt = session.cookie?.expires ? new Date(session.cookie.expires).getTime() : null;
        if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt <= now) return [];
        const user = session.user;
        const userAgent = session.security?.userAgent || '';
        return [{
          id: sessionId,
          userId: user.id || null,
          userName: user.name || user.email || `User ${user.id || ''}`.trim(),
          email: user.email || '',
          role: user.role || 'unknown',
          ipAddress: session.security?.ipAddress || 'Unknown',
          device: describeDevice(userAgent),
          location: session.security?.location || 'Unavailable',
          lastActivity: session.security?.lastActivity || session.cookie?.expires || null,
          expiresAt: session.cookie?.expires || null,
          current: sessionId === req.sessionID,
        }];
      });
      return res.json({ success: true, data: activeSessions });
    });
  } catch (error) {
    console.error('Unable to retrieve active sessions:', error);
    return res.status(500).json({ success: false, message: 'Unable to retrieve active sessions.' });
  }
};

const revokeActiveSession = async (req, res) => {
  const store = getRequestSessionStore(req);
  const sessionId = String(req.params.sessionId || '').trim();
  if (!sessionId || sessionId.length > 256 || typeof store?.get !== 'function' || typeof store?.destroy !== 'function') {
    return res.status(400).json({ success: false, message: 'A valid active session is required.' });
  }
  try {
    store.get(sessionId, async (error, session) => {
      if (error) return res.status(500).json({ success: false, message: 'Unable to retrieve the selected session.' });
      if (!session?.user) return res.status(404).json({ success: false, message: 'The selected session is no longer active.' });
      if (String(session.user.id) === String(req.user?.id)) {
        return res.status(409).json({ success: false, message: 'Use sign out to end your current administrator session.' });
      }
      try {
        if (session.token) {
          const decoded = jwt.decode(session.token);
          const expiresAt = Number(decoded?.exp || 0) * 1000;
          await revokeToken(session.token, expiresAt);
        }
        store.destroy(sessionId, (destroyError) => {
          if (destroyError) return res.status(500).json({ success: false, message: 'Unable to revoke the selected session.' });
          return res.json({ success: true, message: 'Session revoked.' });
        });
      } catch (revokeError) {
        console.error('Unable to revoke session:', revokeError);
        return res.status(500).json({ success: false, message: 'Unable to revoke the selected session.' });
      }
    });
  } catch (error) {
    console.error('Unable to revoke session:', error);
    return res.status(500).json({ success: false, message: 'Unable to revoke the selected session.' });
  }
};

const getFailedLoginActivity = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ip_address, COUNT(*) AS attempts, MAX(created_at) AS last_attempt
      FROM audit_logs
      WHERE (LOWER(action_title) LIKE '%login%' OR LOWER(route_path) LIKE '%/login%')
        AND status_code IN (401, 403, 423, 429)
        AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY ip_address
      ORDER BY attempts DESC, last_attempt DESC
      LIMIT 50
    `);
    const attempts = rows.map((row) => ({
      ipAddress: row.ip_address || 'unknown',
      attempts: Number(row.attempts || 0),
      lastAttempt: row.last_attempt,
    }));
    return res.json({
      success: true,
      data: {
        totalAttempts: attempts.reduce((total, row) => total + row.attempts, 0),
        uniqueIps: attempts.length,
        attempts,
        blockedIps: (await getSecurityControlSettings()).blockedIps,
      },
    });
  } catch (error) {
    console.error('Unable to retrieve failed login activity:', error);
    return res.status(500).json({ success: false, message: 'Unable to retrieve failed login activity.' });
  }
};

const getSecurityControls = async (_req, res) => {
  try {
    const [settings, accessLock] = await Promise.all([
      getSecurityControlSettings(true),
      getSystemAccessLock(true),
    ]);
    return res.json({ success: true, data: { ...settings, ...accessLock } });
  } catch (error) {
    console.error('Unable to retrieve security controls:', error);
    return res.status(500).json({ success: false, message: 'Unable to retrieve security controls.' });
  }
};

const toggleSystemAccessLock = async (req, res) => {
  if (!isSystemAdminRole(req.user?.role || req.user?.user_role)) {
    return res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      message: 'Only a System Administrator can change system access lock settings.',
    });
  }

  const isSystemLocked = req.body?.isSystemLocked ?? req.body?.is_system_locked;
  const lockReason = String(req.body?.lockReason ?? req.body?.lock_reason ?? '').trim();
  if (typeof isSystemLocked !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isSystemLocked must be a boolean.' });
  }
  if (!lockReason || lockReason.length > 500) {
    return res.status(400).json({ success: false, message: 'Lock notification message must contain 1 to 500 characters.' });
  }

  try {
    const settings = await updateSystemAccessLock({ isSystemLocked, lockReason });
    return res.json({
      success: true,
      data: settings,
      message: isSystemLocked ? 'System access locked.' : 'System access unlocked.',
    });
  } catch (error) {
    console.error('Unable to update system access lock:', error);
    return res.status(500).json({ success: false, message: 'Unable to update system access lock.' });
  }
};

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

const removeBlockedIpRecord = async (ipAddress) => {
  const normalizedIp = normalizeIpAddress(ipAddress) || String(ipAddress || '').trim().replace(/^::ffff:/i, '');
  if (!normalizedIp) {
    throw new Error('Invalid IP address');
  }

  await pool.query('DELETE FROM blocked_ips WHERE ip_address = ?', [normalizedIp]);
  const settings = await getSecurityControlSettings();
  const blockedIps = settings.blockedIps.filter((ip) => ip !== normalizedIp && !isLocalDevelopmentIp(ip));
  await updateSecurityControlSettings({ blockedIps });
  return blockedIps;
};

const deleteBlockedIp = async (req, res) => {
  const forbidden = enforceAdminAccess(req, res);
  if (forbidden) return forbidden;

  const ipAddress = normalizeIpAddress(req.body?.ipAddress || req.params?.ipAddress || '')
    || String(req.body?.ipAddress || req.params?.ipAddress || '').trim().replace(/^::ffff:/i, '');

  if (!ipAddress) {
    return res.status(400).json({ success: false, message: 'Enter a valid IPv4 or IPv6 address.' });
  }

  try {
    const blockedIps = await removeBlockedIpRecord(ipAddress);
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

  const ipAddress = normalizeIpAddress(req.body?.ipAddress || '')
    || String(req.body?.ipAddress || '').trim().replace(/^::ffff:/i, '');
  const blocked = req.body?.blocked === true;

  if (!ipAddress) {
    return res.status(400).json({ success: false, message: 'Enter a valid IPv4 or IPv6 address.' });
  }

  if (process.env.NODE_ENV === 'development' && isLocalDevelopmentIp(ipAddress)) {
    const settings = await getSecurityControlSettings();
    const blockedIps = settings.blockedIps.filter((ip) => !isLocalDevelopmentIp(ip));
    return res.status(200).json({
      success: true,
      data: {
        ipAddress,
        blocked: false,
        blockedIps,
        message: 'Local development addresses are excluded from the blocklist in development mode.',
      },
    });
  }

  try {
    if (!blocked) {
      const blockedIps = await removeBlockedIpRecord(ipAddress);
      return res.status(200).json({
        success: true,
        data: {
          ipAddress,
          blocked: false,
          blockedIps,
          message: `IP ${ipAddress} was removed from the blocklist.`,
        },
      });
    }

    const settings = await getSecurityControlSettings();
    const blockedIps = [...new Set([...settings.blockedIps.filter((ip) => !isLocalDevelopmentIp(ip)), ipAddress])];
    await updateSecurityControlSettings({ blockedIps });

    return res.json({
      success: true,
      data: { ipAddress, blocked: true, blockedIps },
    });
  } catch (error) {
    console.error('Unable to update blocked IPs:', error);
    return res.status(500).json({ success: false, message: 'Unable to update blocked IP address.' });
  }
};

const updateMaintenanceMode = async (req, res) => {
  const enabled = req.body?.enabled === true;
  try {
    await updateSecurityControlSettings({ maintenanceModeEnabled: enabled });
    return res.json({ success: true, enabled, message: enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.' });
  } catch (error) {
    console.error('Unable to update maintenance mode:', error);
    return res.status(500).json({ success: false, message: 'Unable to update maintenance mode.' });
  }
};

const sanitizeApiKey = ({ tokenHash, ...entry }) => entry;

const makeApiKey = ({ name, scopes, expiresAt, createdBy }) => {
  const secret = `ipes_live_${crypto.randomBytes(32).toString('hex')}`;
  return {
    secret,
    record: {
      id: crypto.randomUUID(),
      name,
      prefix: `${secret.slice(0, 14)}…${secret.slice(-4)}`,
      tokenHash: crypto.createHash('sha256').update(secret).digest('hex'),
      scopes,
      expiresAt,
      createdAt: new Date().toISOString(),
      createdBy,
      revokedAt: null,
    },
  };
};

const normalizeApiKeyInput = (body = {}) => {
  const name = String(body.name || '').trim().slice(0, 100);
  const scopes = Array.isArray(body.scopes) ? [...new Set(body.scopes.map(String))] : [];
  const expiresInDays = Number(body.expiresInDays || 90);
  if (!name || !scopes.length || scopes.some((scope) => !KEY_SCOPES.has(scope))) return { error: 'A key name and at least one permitted scope are required.' };
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) return { error: 'Expiration must be between 1 and 365 days.' };
  return { name, scopes, expiresAt: new Date(Date.now() + expiresInDays * 86400000).toISOString() };
};

const getSecurityApiKeys = async (_req, res) => {
  try {
    const apiKeys = await getStoredApiKeys();
    return res.json({ success: true, data: apiKeys.map(sanitizeApiKey) });
  } catch (error) {
    console.error('Unable to retrieve API keys:', error);
    return res.status(500).json({ success: false, message: 'Unable to retrieve API keys.' });
  }
};

const createSecurityApiKey = async (req, res) => {
  const normalized = normalizeApiKeyInput(req.body);
  if (normalized.error) return res.status(400).json({ success: false, message: normalized.error });
  try {
    const { secret, record } = makeApiKey({ ...normalized, createdBy: req.user?.id || null });
    const apiKeys = await getStoredApiKeys();
    await saveStoredApiKeys([...apiKeys, record]);
    return res.status(201).json({ success: true, data: { ...sanitizeApiKey(record), secret } });
  } catch (error) {
    console.error('Unable to create API key:', error);
    return res.status(500).json({ success: false, message: 'Unable to create API key.' });
  }
};

const rotateSecurityApiKey = async (req, res) => {
  const normalized = normalizeApiKeyInput(req.body);
  if (normalized.error) return res.status(400).json({ success: false, message: normalized.error });
  try {
    const apiKeys = await getStoredApiKeys();
    const index = apiKeys.findIndex((entry) => entry.id === req.params.keyId && !entry.revokedAt);
    if (index < 0) return res.status(404).json({ success: false, message: 'Active API key not found.' });
    const current = apiKeys[index];
    const { secret, record } = makeApiKey({ ...normalized, createdBy: req.user?.id || null });
    apiKeys[index] = { ...current, revokedAt: new Date().toISOString() };
    apiKeys.push(record);
    await saveStoredApiKeys(apiKeys);
    return res.status(201).json({ success: true, data: { ...sanitizeApiKey(record), secret } });
  } catch (error) {
    console.error('Unable to rotate API key:', error);
    return res.status(500).json({ success: false, message: 'Unable to rotate API key.' });
  }
};

const revokeSecurityApiKey = async (req, res) => {
  try {
    const apiKeys = await getStoredApiKeys();
    const index = apiKeys.findIndex((entry) => entry.id === req.params.keyId && !entry.revokedAt);
    if (index < 0) return res.status(404).json({ success: false, message: 'Active API key not found.' });
    apiKeys[index] = { ...apiKeys[index], revokedAt: new Date().toISOString() };
    await saveStoredApiKeys(apiKeys);
    return res.json({ success: true, message: 'API key revoked.' });
  } catch (error) {
    console.error('Unable to revoke API key:', error);
    return res.status(500).json({ success: false, message: 'Unable to revoke API key.' });
  }
};

module.exports = {
  createSecurityApiKey,
  getActiveSessions,
  getFailedLoginActivity,
  getSecurityControls,
  getSecurityApiKeys,
  deleteBlockedIp,
  revokeActiveSession,
  revokeSecurityApiKey,
  rotateSecurityApiKey,
  updateBlockedIp,
  updateMaintenanceMode,
  toggleSystemAccessLock,
};
