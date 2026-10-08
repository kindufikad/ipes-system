const pool = require('../config/db');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IGNORED_PATHS = new Set(['/api/admin/security-logs', '/api/admin/database-health', '/api/notifications', '/api/auth/me']);

const getClientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || req.ip || 'unknown';
};

const getSafeValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).replace(/[\r\n]+/g, ' ').trim();
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

const getUserDisplay = async (req) => {
  const userId = Number(req.user?.id || req.user?.user_id || 0);
  const identifier = getSafeValue(req.body?.identifier || req.body?.email || req.body?.username);
  try {
    const [[user]] = await pool.query(
      `SELECT u.id, u.email, u.role,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), NULLIF(TRIM(CONCAT_WS(' ', i.first_name, i.last_name)), ''), u.email, CONCAT('User #', u.id)) AS display_name
       FROM users u
       LEFT JOIN instructors i ON i.user_id = u.id
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN lab_assistants la ON la.user_id = u.id
       WHERE ${userId ? 'u.id = ?' : '(u.email = ? OR s.student_id = ? OR i.employee_id = ? OR la.employee_id = ?)'} LIMIT 1`,
      userId ? [userId] : [identifier, identifier, identifier, identifier]
    );
    return {
      id: user?.id || userId || null,
      email: user?.email || req.user?.email || identifier || null,
      role: user?.role || req.user?.role || 'Guest',
      name: user?.display_name || (identifier ? `Account ${identifier}` : 'Unauthenticated user'),
    };
  } catch {
    return {
      id: userId || null,
      email: req.user?.email || identifier || null,
      role: req.user?.role || (identifier ? 'Guest' : 'System'),
      name: req.user?.name || req.user?.email || identifier || 'Unauthenticated user',
    };
  }
};

const getEntityName = async (req) => {
  const path = req.originalUrl.split('?')[0];
  const body = req.body || {};
  if (!path.includes('assign') || !body.course_id) return null;
  try {
    const [[entity]] = await pool.query(
      `SELECT c.code, c.name AS course_name,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', i.first_name, i.last_name)), ''), CONCAT('Instructor #', i.id)) AS instructor_name
       FROM courses c
       LEFT JOIN instructors i ON i.id = ?
       WHERE c.id = ? LIMIT 1`,
      [body.instructor_id || 0, body.course_id]
    );
    return entity || null;
  } catch {
    return null;
  }
};

const describeAction = async (req) => {
  const path = req.originalUrl.split('?')[0];
  const method = req.method.toUpperCase();
  const body = req.body || {};
  const entity = await getEntityName(req);
  const course = entity ? `${entity.code || entity.course_name || `Course #${body.course_id}`}` : body.course_id ? `Course #${getSafeValue(body.course_id)}` : null;
  const section = getSafeValue(body.section || body.student_group);

  if (path.includes('assign')) return {
    title: 'Course assignment changed',
    description: `${getSafeValue(entity?.instructor_name) || 'An instructor'} ${method === 'DELETE' ? 'unassigned' : 'was assigned'} ${course || 'a course'}${section ? ` to Section ${section}` : ''}.`,
    target: entity ? `${entity.course_name || entity.code} / ${entity.instructor_name}` : course,
  };
  if (path.includes('submit-student') || path.includes('student/evaluations/submit')) return { title: 'Student evaluation submitted', description: 'A student submitted an instructor evaluation.', target: getSafeValue(body.instructor_id || body.target_user_id) };
  if (path.includes('submit-peer') || path.includes('peer-evaluations')) return { title: 'Peer evaluation changed', description: 'A peer evaluation was submitted or updated.', target: getSafeValue(body.evaluatee_id || body.target_user_id) };
  if (path.includes('dept-head/evaluations') || path.includes('dept-head-evaluations')) return { title: 'Department Head evaluation changed', description: 'A Department Head evaluation was submitted or updated.', target: getSafeValue(body.evaluatee_id || body.target_user_id) };
  if (path.includes('calculate-publish') || path.includes('publish-instructor-scores')) return { title: 'Final results published', description: 'Final evaluation results were calculated and published.', target: getSafeValue(body.department_id) };
  if (path.includes('system-lock')) {
    const enabled = body.isSystemLocked ?? body.is_system_locked ?? body.enabled;
    return { title: 'Global system lock changed', description: `The global system lock was ${enabled ? 'enabled' : 'disabled'}.`, target: 'Global system' };
  }
  if (path.includes('password') || path.includes('change-password')) return { title: 'Password changed', description: 'A user password was changed or reset.', target: getSafeValue(req.params?.id) };
  if (path.includes('register') || path.includes('/users')) return { title: 'User account changed', description: `A user account was ${method === 'POST' ? 'created' : method === 'DELETE' ? 'removed' : 'updated'}.`, target: getSafeValue(req.params?.id || body.email || body.identifier) };
  if (path.includes('/login')) return { title: 'Login attempt', description: 'A user attempted to sign in.', target: getSafeValue(body.identifier || body.email || body.username) };
  return { title: `${method} ${path.replace(/^\/api\//, '')}`, description: `A user performed ${method} on ${path}.`, target: getSafeValue(req.params?.id || body.id || body.target_id) || path };
};

const getAuditCategory = (path, statusCode) => {
  if (statusCode >= 400) return 'security_alert';
  if (path.includes('/login') || path.includes('/logout') || path.includes('password')) return 'authentication';
  if (path.includes('assign')) return 'course_assignment';
  if (path.includes('system-lock') || path.includes('settings') || path.includes('backup')) return 'system_settings';
  return 'data_modification';
};

const auditRequest = (req, res, next) => {
  const path = req.originalUrl.split('?')[0];
  const isLogin = path.endsWith('/login');
  const isAuditExport = path === '/api/admin/security-logs/export';
  const isIgnored = req.method === 'GET' && [...IGNORED_PATHS].some((ignoredPath) => path === ignoredPath || path.startsWith(`${ignoredPath}/`));
  const shouldLog = path.startsWith('/api/') && (!isIgnored || isAuditExport) && (isLogin || isAuditExport || Boolean(req.user) || MUTATING_METHODS.has(req.method));
  if (shouldLog) {
    res.once('finish', async () => {
      try {
        const [actor, action] = await Promise.all([getUserDisplay(req), describeAction(req)]);
        const statusCode = Number(res.statusCode || 0);
        await pool.query(
          `INSERT INTO audit_logs
            (action_title, description, performed_by, ip_address, actor_user_id, actor_email, actor_role, category, target_details, route_path, http_method, status_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [action.title, `${action.description} Result: ${statusCode}.`, actor.name, getClientIp(req), actor.id, actor.email, actor.role, getAuditCategory(path, statusCode), action.target || path, path, req.method.toUpperCase(), statusCode]
        );
      } catch (error) {
        console.error('Global audit log write failed:', error?.message || error);
      }
    });
  }
  next();
};

module.exports = { auditRequest };
