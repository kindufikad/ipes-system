const AUTO_LOCK_DEADLINE_SETTING_KEY = 'auto_lock_deadline_enabled';
const EVALUATION_PERIOD_EXPIRED_MESSAGE = 'Evaluation Period Has Expired';

const normalizeDeadline = (deadline) => {
  if (deadline == null) return null;
  return typeof deadline === 'string' ? deadline.trim() || null : deadline;
};

const resolveDepartmentEvaluationDeadline = (settings, dispatch, globalAutoLockEnabled = true) => ({
  deadlineAt: normalizeDeadline(settings?.deadline_at) || normalizeDeadline(dispatch?.deadline),
  autoLock: globalAutoLockEnabled && (settings ? Number(settings.auto_lock) !== 0 : true),
  updatedAt: settings?.updated_at || null,
});

const getAutoLockDeadlineEnabled = async (pool) => {
  try {
    const [[setting]] = await pool.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
      [AUTO_LOCK_DEADLINE_SETTING_KEY]
    );
    if (setting?.setting_value == null) return false;
    return ['1', 'true', 'yes', 'enabled'].includes(String(setting.setting_value).trim().toLowerCase());
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_TABLE_ERROR', 'ER_BAD_FIELD_ERROR'].includes(error?.code)) return false;
    throw error;
  }
};

const ensureEvaluationDeadlineSettingsTable = async (pool) => {
  await pool.query(`CREATE TABLE IF NOT EXISTS evaluation_deadline_settings (
    department_id INT UNSIGNED PRIMARY KEY,
    deadline_at DATETIME NULL,
    auto_lock TINYINT(1) NOT NULL DEFAULT 1,
    updated_by INT UNSIGNED NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};

const getDepartmentEvaluationDeadline = async (pool, departmentId, { ensureTable = true } = {}) => {
  const id = Number(departmentId);
  if (!Number.isInteger(id) || id <= 0) {
    return { deadlineAt: null, autoLock: true, updatedAt: null };
  }

  if (ensureTable) await ensureEvaluationDeadlineSettingsTable(pool);
  let settings = null;
  try {
    [[settings]] = await pool.query(
      `SELECT department_id, NULLIF(TRIM(CAST(deadline_at AS CHAR)), '') AS deadline_at,
          auto_lock, updated_at
       FROM evaluation_deadline_settings WHERE department_id = ? LIMIT 1`,
      [id]
    );
  } catch (error) {
    if (ensureTable || !['ER_NO_SUCH_TABLE', 'ER_BAD_TABLE_ERROR'].includes(error?.code)) throw error;
  }
  let dispatch = null;
  if (!settings?.deadline_at) {
    [[dispatch]] = await pool.query(`
      SELECT NULLIF(TRIM(CAST(deadline AS CHAR)), '') AS deadline FROM evaluation_dispatches
      WHERE department_id = ? AND NULLIF(TRIM(CAST(deadline AS CHAR)), '') IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
    [id]);
  }

  const autoLockEnabled = await getAutoLockDeadlineEnabled(pool);
  const deadline = resolveDepartmentEvaluationDeadline(settings, dispatch, autoLockEnabled);

  if (deadline.autoLock && isEvaluationDeadlineExpired(deadline.deadlineAt)) {
    await pool.query(
      `UPDATE evaluation_dispatches SET status = 'closed'
       WHERE department_id = ?
         AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'active', 'published')`,
      [id]
    );
    await pool.query(
      `UPDATE peer_evaluations pe
       INNER JOIN evaluation_dispatches ed ON ed.id = pe.dispatch_id
       SET pe.status = 'closed'
       WHERE ed.department_id = ?
         AND LOWER(COALESCE(pe.status, 'pending')) IN ('pending', 'active')`,
      [id]
    );
    await pool.query(
      `UPDATE peer_evaluations pe
       INNER JOIN instructors i ON i.id = pe.evaluator_id
       SET pe.status = 'closed'
       WHERE i.department_id = ? AND pe.dispatch_id IS NULL
         AND LOWER(COALESCE(pe.status, 'pending')) IN ('pending', 'active')`,
      [id]
    );
    await pool.query(
      'UPDATE evaluation_forms SET is_published = 0 WHERE department_id = ? AND is_published = 1',
      [id]
    );
    await pool.query(
      "UPDATE peer_evaluation_publications SET status = 'closed' WHERE department_id = ? AND LOWER(COALESCE(status, '')) = 'published'",
      [id]
    );
    await pool.query(
      `UPDATE evaluations SET status = 'CLOSED'
       WHERE department_id = ?
         AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'active', 'in_progress', 'draft')`,
      [id]
    );
  }

  return deadline;
};

const isEvaluationDeadlineExpired = (deadlineAt, now = Date.now()) => {
  if (!deadlineAt) return false;
  const timestamp = new Date(deadlineAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= now;
};

const lockExpiredEvaluationForms = async (pool) => {
  if (!await getAutoLockDeadlineEnabled(pool)) return 0;
  await ensureEvaluationDeadlineSettingsTable(pool);

  const [rows] = await pool.query(`
    SELECT department_id FROM evaluation_deadline_settings
    WHERE deadline_at IS NOT NULL AND deadline_at <= CURRENT_TIMESTAMP AND auto_lock = 1
    UNION
    SELECT department_id FROM evaluation_dispatches
    WHERE deadline IS NOT NULL AND deadline <= CURRENT_TIMESTAMP
      AND LOWER(COALESCE(status, 'pending')) IN ('pending', 'active', 'published')
  `);
  let lockedDepartments = 0;

  for (const row of rows) {
    const deadline = await getDepartmentEvaluationDeadline(pool, row.department_id);
    if (deadline.autoLock && isEvaluationDeadlineExpired(deadline.deadlineAt)) lockedDepartments += 1;
  }

  return lockedDepartments;
};

module.exports = {
  getDepartmentEvaluationDeadline,
  getAutoLockDeadlineEnabled,
  lockExpiredEvaluationForms,
  AUTO_LOCK_DEADLINE_SETTING_KEY,
  EVALUATION_PERIOD_EXPIRED_MESSAGE,
  ensureEvaluationDeadlineSettingsTable,
  isEvaluationDeadlineExpired,
  resolveDepartmentEvaluationDeadline,
};