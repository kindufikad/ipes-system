const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { createBlockedIpRecord, isLocalDevelopmentIp } = require('../middleware/securityMiddleware');

const normalizeIp = (req) => {
  const forwarded = Array.isArray(req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'][0]
    : String(req.headers['x-forwarded-for'] || '');

  const rawIp = (forwarded || req.socket?.remoteAddress || req.ip || '').trim();
  return rawIp.replace(/^::ffff:/i, '') || 'unknown';
};

router.get('/logs', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
    const offset = (page - 1) * limit;
    const severity = String(req.query.severity || '').trim().toUpperCase();
    const search = String(req.query.search || '').trim();

    const clauses = [];
    const values = [];

    if (severity && severity !== 'ALL') {
      clauses.push('severity = ?');
      values.push(severity);
    }

    if (search) {
      clauses.push('(user LIKE ? OR action LIKE ? OR ip_address LIKE ? OR route LIKE ? OR details LIKE ?)');
      const term = `%${search}%`;
      values.push(term, term, term, term, term);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT * FROM security_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM security_logs ${where}`,
      values
    );

    return res.json({
      success: true,
      logs: rows,
      page,
      limit,
      total: Number(countRow?.total || 0),
    });
  } catch (error) {
    console.error('Failed to fetch security logs:', error);
    return res.status(500).json({ success: false, message: 'Unable to fetch security logs.' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.session_id, s.user_id, u.email, u.role,
             CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS user_name,
             s.ip_address AS ipAddress, s.user_agent AS device,
             s.created_at AS loginTime, s.last_activity AS lastActivity,
             'Unknown' AS location
      FROM sessions s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.is_active = 1
      ORDER BY s.last_activity DESC
    `);

    return res.json({ success: true, sessions: rows });
  } catch (error) {
    console.error('Failed to fetch active sessions:', error);
    return res.status(500).json({ success: false, message: 'Unable to fetch active sessions.' });
  }
});

router.delete('/sessions/:sessionId/revoke', async (req, res) => {
  try {
    const { sessionId } = req.params;

    await pool.query(
      `UPDATE sessions SET is_active = 0, revoked_at = NOW() WHERE session_id = ?`,
      [sessionId]
    );

    return res.json({ success: true, message: 'Session revoked successfully.' });
  } catch (error) {
    console.error('Failed to revoke session:', error);
    return res.status(500).json({ success: false, message: 'Unable to revoke session.' });
  }
});

router.get('/failed-logins', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, ip_address, failure_count AS attempts, last_failure_at AS lastAttempt
      FROM failed_login_attempts
      WHERE last_failure_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY last_failure_at DESC
    `);

    const [blockedRows] = await pool.query(`
      SELECT ip_address
      FROM blocked_ips
      WHERE (is_permanent = 1 OR expires_at IS NULL OR expires_at > NOW())
    `);

    return res.json({
      success: true,
      totalAttempts: rows.reduce((sum, item) => sum + Number(item.attempts || 0), 0),
      uniqueIps: new Set(rows.map((item) => item.ip_address)).size,
      attempts: rows,
      blockedIps: blockedRows.map((item) => item.ip_address),
    });
  } catch (error) {
    console.error('Failed to fetch failed-login data:', error);
    return res.status(500).json({ success: false, message: 'Unable to fetch failed-login activity.' });
  }
});

router.post('/ips/block', async (req, res) => {
  try {
    const ipAddress = String(req.body?.ipAddress || '').trim();
    const reason = String(req.body?.reason || 'Administrative block').trim();
    const expiresAt = req.body?.expiresAt || null;
    const isPermanent = Boolean(req.body?.isPermanent);

    if (!ipAddress) {
      return res.status(400).json({ success: false, message: 'An IP address is required.' });
    }

    const normalized = ipAddress.replace(/^::ffff:/i, '');
    if (isLocalDevelopmentIp(normalized)) {
      return res.status(400).json({
        success: false,
        message: 'Local development addresses are not blockable in development mode.',
      });
    }

    await createBlockedIpRecord({
      ip: normalized,
      reason,
      expiresAt: expiresAt || null,
      isPermanent,
    });

    return res.json({ success: true, message: `IP ${normalized} has been blocked.` });
  } catch (error) {
    console.error('Failed to block IP:', error);
    return res.status(500).json({ success: false, message: 'Unable to block IP.' });
  }
});

router.delete('/ips/:ip', async (req, res) => {
  try {
    const ipAddress = String(req.params.ip || '').trim();
    if (!ipAddress) {
      return res.status(400).json({ success: false, message: 'An IP address is required.' });
    }

    await pool.query(`DELETE FROM blocked_ips WHERE ip_address = ?`, [ipAddress.replace(/^::ffff:/i, '')]);
    return res.json({ success: true, message: `IP ${ipAddress} was unblocked.` });
  } catch (error) {
    console.error('Failed to unblock IP:', error);
    return res.status(500).json({ success: false, message: 'Unable to unblock IP.' });
  }
});

module.exports = router;
