const SYSTEM_ADMIN_ROLES = ['admin', 'systemadmin', 'system_admin'];

const SYSTEM_ADMIN_CONFLICT_MESSAGE = 'An active System Administrator already exists. Update the existing administrator profile or deactivate that account before creating another.';

const isSystemAdminRole = (role) => SYSTEM_ADMIN_ROLES.includes(String(role || '').trim().toLowerCase());

const getActiveSystemAdmin = async (connection, excludeUserId = null) => {
  const excludeClause = excludeUserId == null ? '' : ' AND id <> ?';
  const params = [...SYSTEM_ADMIN_ROLES];
  if (excludeUserId != null) params.push(excludeUserId);
  const [rows] = await connection.query(
    `SELECT id, email FROM users
     WHERE LOWER(role) IN (?, ?, ?)
       AND LOWER(COALESCE(status, 'active')) = 'active'${excludeClause}
     ORDER BY id ASC LIMIT 1`,
    params
  );
  return rows[0] || null;
};

const isActiveSystemAdminUniqueError = (error) => (
  error?.code === 'ER_DUP_ENTRY'
  && String(error?.sqlMessage || error?.message || '').includes('uq_users_single_active_system_admin')
);

module.exports = {
  SYSTEM_ADMIN_CONFLICT_MESSAGE,
  getActiveSystemAdmin,
  isActiveSystemAdminUniqueError,
  isSystemAdminRole,
};