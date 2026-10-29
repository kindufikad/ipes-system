const pool = require('./config/db');

(async () => {
  const [admins] = await pool.query(`SELECT id, email, role, status, active_system_admin_slot
    FROM users WHERE LOWER(role) IN ('admin', 'systemadmin', 'system_admin') ORDER BY id`);
  const [tables] = await pool.query("SHOW TABLES LIKE 'blocked_ips'");
  const [constraints] = await pool.query(`SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'uq_users_single_active_system_admin'`);
  console.log(JSON.stringify({ admins, blockedIpsTables: tables, constraints }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => pool.end());
