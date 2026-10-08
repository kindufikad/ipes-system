const net = require('node:net');
const crypto = require('node:crypto');
const pool = require('../config/db');

const CONTROL_KEYS = ['system_lock_enabled', 'maintenance_mode_enabled', 'security_blocked_ips'];
const API_KEYS_SETTING = 'security_api_keys';
const REVOKED_TOKENS_SETTING = 'security_revoked_token_hashes';
const SYSTEM_ACCESS_SETTING = 'system_access_control';
const DEFAULT_SYSTEM_LOCK_REASON = 'System temporarily locked by System Admin';
const CONTROL_CACHE_TTL_MS = 5000;
let controlCache = null;
let controlCacheExpiresAt = 0;
let revokedTokenCache = null;
let revokedTokenCacheExpiresAt = 0;
let systemAccessLockCache = null;
let systemAccessLockCacheExpiresAt = 0;

const parseList = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const withoutLocalDevelopmentIps = (ips) => (
  process.env.NODE_ENV === 'development'
    ? ips.filter((ip) => !isLocalDevelopmentIp(ip))
    : ips
);

const normalizeIpAddress = (value) => {
  const raw = String(value || '').trim().replace(/^\[|\]$/g, '');
  const ip = raw.toLowerCase().startsWith('::ffff:') ? raw.slice(7) : raw;
  const normalized = net.isIP(ip) ? ip.toLowerCase() : null;
  return normalized;
};

const isLocalDevelopmentIp = (value) => {
  const normalized = normalizeIpAddress(value);
  if (!normalized) return false;
  return LOOPBACK_IPS.has(normalized) || LOOPBACK_IPS.has(`::ffff:${normalized}`) || normalized === '127.0.0.1'
    || normalized === '::1';
};

const getClientIp = (req) => normalizeIpAddress(req.ip || req.socket?.remoteAddress || '');

const getSecurityControlSettings = async (forceRefresh = false) => {
  if (!forceRefresh && controlCache && Date.now() < controlCacheExpiresAt) return controlCache;
  const placeholders = CONTROL_KEYS.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (${placeholders})`,
    CONTROL_KEYS
  );
  const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  controlCache = {
    systemLockEnabled: String(settings.system_lock_enabled || '0') === '1',
    maintenanceModeEnabled: String(settings.maintenance_mode_enabled || '0') === '1',
    blockedIps: withoutLocalDevelopmentIps(parseList(settings.security_blocked_ips).map(normalizeIpAddress).filter(Boolean)),
  };
  controlCacheExpiresAt = Date.now() + CONTROL_CACHE_TTL_MS;
  return controlCache;
};

const updateSecurityControlSettings = async (patch = {}) => {
  const current = await getSecurityControlSettings();
  if (patch.systemLockEnabled !== undefined) {
    const accessLock = await getSystemAccessLock(true);
    if (Boolean(patch.systemLockEnabled) !== accessLock.isSystemLocked) {
      await updateSystemAccessLock({
        isSystemLocked: Boolean(patch.systemLockEnabled),
        lockReason: accessLock.lockReason,
      });
    }
  }
  const next = {
    systemLockEnabled: patch.systemLockEnabled ?? current.systemLockEnabled,
    maintenanceModeEnabled: patch.maintenanceModeEnabled ?? current.maintenanceModeEnabled,
    blockedIps: patch.blockedIps === undefined
      ? current.blockedIps
      : withoutLocalDevelopmentIps(patch.blockedIps.map(normalizeIpAddress).filter(Boolean)),
  };
  const values = [
    ['system_lock_enabled', next.systemLockEnabled ? '1' : '0'],
    ['maintenance_mode_enabled', next.maintenanceModeEnabled ? '1' : '0'],
    ['security_blocked_ips', JSON.stringify(next.blockedIps)],
  ];
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value) VALUES ${values.map(() => '(?, ?)').join(', ')}
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
    values.flat()
  );
  controlCache = next;
  controlCacheExpiresAt = Date.now() + CONTROL_CACHE_TTL_MS;
  return next;
};

const getSystemAccessLock = async (forceRefresh = false) => {
  if (!forceRefresh && systemAccessLockCache && Date.now() < systemAccessLockCacheExpiresAt) {
    return systemAccessLockCache;
  }
  const [[row]] = await pool.query(
    'SELECT is_system_locked, lock_reason FROM system_settings WHERE setting_key = ? LIMIT 1',
    [SYSTEM_ACCESS_SETTING]
  );
  systemAccessLockCache = {
    isSystemLocked: Number(row?.is_system_locked) === 1,
    lockReason: String(row?.lock_reason || DEFAULT_SYSTEM_LOCK_REASON),
  };
  systemAccessLockCacheExpiresAt = Date.now() + CONTROL_CACHE_TTL_MS;
  return systemAccessLockCache;
};

const updateSystemAccessLock = async ({ isSystemLocked, lockReason }) => {
  const next = {
    isSystemLocked: Boolean(isSystemLocked),
    lockReason: String(lockReason || DEFAULT_SYSTEM_LOCK_REASON).trim(),
  };
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value, is_system_locked, lock_reason)
     VALUES (?, NULL, ?, ?), ('system_lock_enabled', ?, 0, DEFAULT)
     ON DUPLICATE KEY UPDATE
       setting_value = IF(VALUES(setting_key) = 'system_lock_enabled', VALUES(setting_value), setting_value),
       is_system_locked = IF(VALUES(setting_key) = ?, VALUES(is_system_locked), is_system_locked),
       lock_reason = IF(VALUES(setting_key) = ?, VALUES(lock_reason), lock_reason),
       updated_at = CURRENT_TIMESTAMP`,
    [
      SYSTEM_ACCESS_SETTING,
      next.isSystemLocked ? 1 : 0,
      next.lockReason,
      next.isSystemLocked ? '1' : '0',
      SYSTEM_ACCESS_SETTING,
      SYSTEM_ACCESS_SETTING,
    ]
  );
  systemAccessLockCache = next;
  systemAccessLockCacheExpiresAt = Date.now() + CONTROL_CACHE_TTL_MS;
  if (controlCache) {
    controlCache = { ...controlCache, systemLockEnabled: next.isSystemLocked };
    controlCacheExpiresAt = Date.now() + CONTROL_CACHE_TTL_MS;
  }
  return next;
};

const isIpBlocked = async (ip) => {
  const normalizedIp = normalizeIpAddress(ip);
  if (!normalizedIp) return false;
  if (isLocalDevelopmentIp(normalizedIp)) return false;
  const settings = await getSecurityControlSettings();
  return settings.blockedIps.includes(normalizedIp);
};

const getStoredApiKeys = async () => {
  const [[row]] = await pool.query(
    'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
    [API_KEYS_SETTING]
  );
  return parseList(row?.setting_value);
};

const saveStoredApiKeys = async (apiKeys) => {
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
    [API_KEYS_SETTING, JSON.stringify(apiKeys)]
  );
};

const getRevokedTokenHashes = async () => {
  if (revokedTokenCache && Date.now() < revokedTokenCacheExpiresAt) return revokedTokenCache;
  const [[row]] = await pool.query(
    'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
    [REVOKED_TOKENS_SETTING]
  );
  const now = Date.now();
  revokedTokenCache = parseList(row?.setting_value).filter((entry) => (
    entry && typeof entry.hash === 'string' && Number(entry.expiresAt) > now
  ));
  revokedTokenCacheExpiresAt = Date.now() + CONTROL_CACHE_TTL_MS;
  return revokedTokenCache;
};

const saveRevokedTokenHashes = async (entries) => {
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
    [REVOKED_TOKENS_SETTING, JSON.stringify(entries)]
  );
  revokedTokenCache = entries;
  revokedTokenCacheExpiresAt = Date.now() + CONTROL_CACHE_TTL_MS;
};

const isTokenRevoked = async (token) => {
  if (typeof token !== 'string' || !token) return false;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const revokedTokens = await getRevokedTokenHashes();
  return revokedTokens.some((entry) => entry.hash === hash);
};

const revokeToken = async (token, expiresAt) => {
  if (typeof token !== 'string' || !token) return;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const revokedTokens = await getRevokedTokenHashes();
  if (revokedTokens.some((entry) => entry.hash === hash)) return;
  revokedTokens.push({ hash, expiresAt: Number(expiresAt) || Date.now() + 8 * 60 * 60 * 1000 });
  await saveRevokedTokenHashes(revokedTokens);
};

module.exports = {
  API_KEYS_SETTING,
  DEFAULT_SYSTEM_LOCK_REASON,
  getClientIp,
  getSecurityControlSettings,
  getSystemAccessLock,
  getStoredApiKeys,
  getRevokedTokenHashes,
  isIpBlocked,
  isLocalDevelopmentIp,
  isTokenRevoked,
  normalizeIpAddress,
  revokeToken,
  saveStoredApiKeys,
  saveRevokedTokenHashes,
  updateSystemAccessLock,
  updateSecurityControlSettings,
};
