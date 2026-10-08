const pool = require('../../../config/db');
const { ALLOWED_ROLES } = require('../config');

const normalizeRole = (role) => {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'department_head') return 'dept_head';
  if (value === 'labassistant' || value === 'lab-assistant') return 'lab_assistant';
  if (value === 'college dean') return 'college_dean';
  if (value === 'systemadmin' || value === 'system_admin') return 'system_admin';
  return value;
};

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('251') && digits.length >= 12) return `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith('9')) return `0${digits}`;
  return digits;
};

const findUserByPhone = async (phone) => {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const [rows] = await pool.query(`
    SELECT u.id, u.email, u.role, u.status, u.telegram_chat_id, u.language,
      COALESCE(NULLIF(s.phone_number, ''), NULLIF(i.phone_number, ''), NULLIF(la.phone_number, ''), NULLIF(u.phone_number, '')) AS phone_number,
      s.phone_number AS student_phone_number,
      i.phone_number AS instructor_phone_number,
      la.phone_number AS lab_assistant_phone_number,
      u.phone_number AS user_phone_number,
      COALESCE(s.student_id, i.employee_id, la.employee_id, u.email) AS profile_id,
      COALESCE(
        NULLIF(TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))), ''),
        NULLIF(TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))), ''),
        NULLIF(TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))), ''),
        u.email
      ) AS name
    FROM users u
    LEFT JOIN students s ON s.user_id = u.id
    LEFT JOIN instructors i ON i.user_id = u.id
    LEFT JOIN lab_assistants la ON la.user_id = u.id
    WHERE LOWER(COALESCE(u.status, 'active')) = 'active'
      AND COALESCE(NULLIF(s.phone_number, ''), NULLIF(i.phone_number, ''), NULLIF(la.phone_number, ''), NULLIF(u.phone_number, '')) IS NOT NULL
  `);

  const matchingUsers = rows.filter((row) => [
    row.student_phone_number,
    row.instructor_phone_number,
    row.lab_assistant_phone_number,
    row.user_phone_number,
  ].some((storedPhone) => normalizePhone(storedPhone) === normalizedPhone));
  if (matchingUsers.length > 1) return { ambiguous: true };
  if (!matchingUsers[0]) return null;

  const user = matchingUsers[0];
  const role = normalizeRole(user.role);
  return { ...user, role, allowed: ALLOWED_ROLES.has(role) };
};

const findUserByEmailOrId = async (identifier) => {
  const input = String(identifier || '').trim();
  if (!input) return null;

  const normalized = input.toLowerCase();
  const phoneDigits = normalizePhone(input);
  const normalizedPhoneSql = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(s.phone_number, i.phone_number, la.phone_number, ''), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')`;

  const [rows] = await pool.query(`
    SELECT
      u.id,
      u.email,
      u.role,
      u.status,
      u.telegram_chat_id,
      u.language,
      COALESCE(s.student_id, i.employee_id, la.employee_id) AS profile_id,
      COALESCE(s.phone_number, i.phone_number, la.phone_number) AS phone_number,
      COALESCE(
        NULLIF(TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))), ''),
        NULLIF(TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))), ''),
        NULLIF(TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))), ''),
        u.email
      ) AS name
    FROM users u
    LEFT JOIN students s ON s.user_id = u.id
    LEFT JOIN instructors i ON i.user_id = u.id
    LEFT JOIN lab_assistants la ON la.user_id = u.id
    WHERE LOWER(COALESCE(u.status, 'active')) = 'active'
      AND (
        LOWER(COALESCE(u.email, '')) = ?
        OR (? <> '' AND ${normalizedPhoneSql} = ?)
        OR LOWER(COALESCE(s.student_id, i.employee_id, la.employee_id, '')) = ?
      )
    ORDER BY CASE WHEN LOWER(COALESCE(u.email, '')) = ? THEN 0 ELSE 1 END, u.id
    LIMIT 2
  `, [normalized, phoneDigits, phoneDigits, normalized, normalized]);

  if (!rows[0]) return null;
  if (rows.length > 1 && !normalized.includes('@')) return { ambiguous: true };

  const user = rows[0];
  const role = normalizeRole(user.role);

  return {
    ...user,
    role,
    allowed: ALLOWED_ROLES.has(role),
  };
};

const findUserByTelegramChat = async (chatId) => {
  if (!chatId) return null;

  const [rows] = await pool.query(`
    SELECT u.id, u.email, u.role, u.telegram_chat_id, u.language,
      COALESCE(s.student_id, i.employee_id, la.employee_id) AS profile_id,
      COALESCE(
        NULLIF(TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))), ''),
        NULLIF(TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))), ''),
        NULLIF(TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))), ''),
        u.email
      ) AS name,
      COALESCE(s.department_id, i.department_id, la.department_id) AS department_id,
      d.name AS department_name
    FROM users u
    LEFT JOIN students s ON s.user_id = u.id
    LEFT JOIN instructors i ON i.user_id = u.id
    LEFT JOIN lab_assistants la ON la.user_id = u.id
    LEFT JOIN departments d ON d.id = COALESCE(s.department_id, i.department_id, la.department_id)
    WHERE u.telegram_chat_id = ?
      AND LOWER(COALESCE(u.status, 'active')) = 'active'
    LIMIT 1
  `, [chatId]);

  if (!rows[0]) return null;

  const role = normalizeRole(rows[0].role);
  return {
    ...rows[0],
    role,
    allowed: ALLOWED_ROLES.has(role),
  };
};

const linkTelegramChat = async (userId, chatId) => {
  if (!userId || !chatId) return false;

  const [result] = await pool.query(
    'UPDATE users SET telegram_chat_id = ? WHERE id = ? AND status = "active"',
    [chatId, userId]
  );

  return result.affectedRows > 0;
};

const linkTelegramChatIfAvailable = async (userId, chatId) => {
  if (!userId || !chatId) return false;
  const [result] = await pool.query(
    `UPDATE users SET telegram_chat_id = ?
     WHERE id = ? AND status = 'active'
       AND (telegram_chat_id IS NULL OR telegram_chat_id = ?)`,
    [chatId, userId, chatId]
  );
  if (result.affectedRows > 0) return true;

  const [rows] = await pool.query(
    'SELECT telegram_chat_id FROM users WHERE id = ? AND status = "active" LIMIT 1',
    [userId]
  );
  return rows[0]?.telegram_chat_id != null && String(rows[0].telegram_chat_id) === String(chatId);
};

const clearTelegramChat = async (userId) => {
  if (!userId) return false;
  const [result] = await pool.query(
    'UPDATE users SET telegram_chat_id = NULL WHERE id = ? AND status = "active"',
    [userId]
  );
  return result.affectedRows > 0;
};

const setUserLanguage = async (userId, language) => {
  const normalizedLanguage = String(language || '').toLowerCase();
  if (!userId || !['am', 'en'].includes(normalizedLanguage)) return false;

  const [result] = await pool.query(
    'UPDATE users SET language = ? WHERE id = ? AND status = "active"',
    [normalizedLanguage, userId]
  );
  if (result.affectedRows > 0) return true;

  const [rows] = await pool.query(
    'SELECT language FROM users WHERE id = ? AND status = "active" LIMIT 1',
    [userId]
  );
  return rows[0]?.language === normalizedLanguage;
};

const getRoleEvaluationStatus = async (user) => {
  const userId = Number(user?.id || 0);
  const role = normalizeRole(user?.role);
  if (!userId) throw new Error('Authenticated IPES user is required.');

  if (role === 'student') {
    const [rows] = await pool.query(`
      SELECT ca.id AS assignment_id, c.id AS course_id,
        COALESCE(c.name, 'Course') AS course_name, c.code AS course_code,
        CASE
          WHEN LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant'
            THEN TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, '')))
          ELSE TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, '')))
        END AS instructor_name,
        CASE WHEN EXISTS (
          SELECT 1
          FROM evaluation_dispatches ed
          INNER JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
          WHERE ed.assignment_id = ca.id
            AND (ed.student_id = s.id OR (
              ed.student_id IS NULL
              AND ed.student_group IS NOT NULL
              AND LOWER(TRIM(REPLACE(REPLACE(ed.student_group, 'Section ', ''), 'section ', ''))) = LOWER(TRIM(REPLACE(REPLACE(COALESCE(s.section, ''), 'Section ', ''), 'section ', '')))
            ))
            AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
            AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
        ) THEN 'Completed' ELSE 'Pending' END AS status
      FROM students s
      INNER JOIN course_assignments ca ON ca.department_id = s.department_id
        AND (ca.student_id IS NULL OR ca.student_id = s.id)
      INNER JOIN courses c ON c.id = ca.course_id
      LEFT JOIN instructors i ON i.id = ca.instructor_id
      LEFT JOIN lab_assistants la ON LOWER(COALESCE(ca.assigned_role, 'instructor')) = 'lab_assistant'
        AND la.id = COALESCE(ca.staff_id, ca.lab_assistant_id)
      WHERE s.user_id = ?
        AND (ca.is_student_published = 1 OR LOWER(TRIM(COALESCE(ca.status, ''))) = 'published')
        AND (YEAR(CURDATE()) = 0 OR ca.academic_year = CAST(YEAR(CURDATE()) AS CHAR)
          OR ca.academic_year LIKE CONCAT('%', YEAR(CURDATE()), '%'))
        AND (
          LOWER(TRIM(COALESCE(ca.program_type, ''))) IN ('', 'all', 'all programs')
          OR LOWER(TRIM(ca.program_type)) = LOWER(TRIM(COALESCE(s.program_type, '')))
        )
        AND (
          LOWER(TRIM(COALESCE(ca.year_level, ''))) IN ('', 'all', 'all years')
          OR REGEXP_REPLACE(LOWER(TRIM(ca.year_level)), '[^0-9]', '') = REGEXP_REPLACE(LOWER(TRIM(COALESCE(s.year_level, ''))), '[^0-9]', '')
        )
        AND (
          COALESCE(ca.semester, '') = ''
          OR LOWER(TRIM(REPLACE(REPLACE(ca.semester, 'Semester', ''), 'semester', ''))) = LOWER(TRIM(REPLACE(REPLACE(COALESCE(s.semester, ''), 'Semester', ''), 'semester', '')))
        )
        AND (
          ca.section IS NULL
          OR LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section', ''), 'section', ''))) IN ('', 'all', 'all sections')
          OR LOWER(TRIM(REPLACE(REPLACE(ca.section, 'Section', ''), 'section', ''))) = LOWER(TRIM(REPLACE(REPLACE(COALESCE(s.section, ''), 'Section', ''), 'section', '')))
        )
      ORDER BY status ASC, ca.id ASC
    `, [userId]);
    const completed = rows.filter((row) => row.status === 'Completed').length;
    return { role, total: rows.length, completed, pending: rows.length - completed, rows };
  }

  if (['instructor', 'lab_assistant', 'dept_head'].includes(role)) {
    const [rows] = await pool.query(`
      SELECT pe.id, pe.status, pe.evaluatee_id,
        TRIM(CONCAT(COALESCE(target.first_name, ''), ' ', COALESCE(target.last_name, ''))) AS target_name,
        CASE WHEN EXISTS (
          SELECT 1 FROM peer_evaluation_submissions pes
          WHERE pes.peer_evaluation_id = pe.id
            AND LOWER(COALESCE(pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
        ) OR LOWER(COALESCE(pe.status, 'pending')) IN ('submitted', 'completed', 'approved') THEN 'Completed' ELSE 'Pending' END AS completion_status
      FROM instructors evaluator
      INNER JOIN peer_evaluations pe ON pe.evaluator_id = evaluator.id
      INNER JOIN instructors target ON target.id = pe.evaluatee_id
      WHERE evaluator.user_id = ?
      ORDER BY completion_status ASC, target_name ASC
    `, [userId]);
    const completed = rows.filter((row) => row.completion_status === 'Completed').length;
    return { role, total: rows.length, completed, pending: rows.length - completed, rows };
  }

  if (role === 'college_dean' || role === 'dean') {
    const [[scope]] = await pool.query(`
      SELECT d.college_id
      FROM instructors i INNER JOIN departments d ON d.id = i.department_id
      WHERE i.user_id = ? LIMIT 1
    `, [userId]);
    const [[stats]] = await pool.query(`
      SELECT COUNT(DISTINCT ed.id) AS total,
        COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL THEN ed.id END) AS completed
      FROM evaluation_dispatches ed
      INNER JOIN departments d ON d.id = ed.department_id
      LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
        AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
      WHERE d.college_id = ?
        AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
    `, [scope?.college_id || 0]);
    const total = Number(stats?.total || 0);
    const completed = Number(stats?.completed || 0);
    return { role, total, completed, pending: Math.max(total - completed, 0), percentage: total ? Number((completed / total * 100).toFixed(1)) : 0 };
  }

  const [[stats]] = await pool.query(`
    SELECT COUNT(DISTINCT ed.id) AS total,
      COUNT(DISTINCT CASE WHEN ses.id IS NOT NULL THEN ed.id END) AS completed
    FROM evaluation_dispatches ed
    LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
      AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
    WHERE LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
  `);
  const total = Number(stats?.total || 0);
  const completed = Number(stats?.completed || 0);
  return { role, total, completed, pending: Math.max(total - completed, 0), percentage: total ? Number((completed / total * 100).toFixed(1)) : 0 };
};

const getPendingStudentEvaluationCount = async (userId) => {
  const [[row]] = await pool.query(`
    SELECT COUNT(DISTINCT ed.id) AS pending_count
    FROM students s
    INNER JOIN evaluation_dispatches ed ON ed.student_id = s.id
    WHERE s.user_id = ?
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
      AND LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active')
      AND NOT EXISTS (
        SELECT 1
        FROM student_evaluation_submissions ses
        WHERE ses.dispatch_id = ed.id
          AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
      )
  `, [userId]);

  return Number(row?.pending_count || 0);
};

const getSupportContacts = async () => {
  try {
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('contact_email', 'contact_phone')"
    );
    return rows.reduce((contacts, row) => ({ ...contacts, [row.setting_key]: row.setting_value }), {});
  } catch (error) {
    console.error('Unable to load Telegram help contacts:', error.message);
    return {};
  }
};

module.exports = {
  normalizeRole,
  normalizePhone,
  findUserByPhone,
  findUserByEmailOrId,
  findUserByTelegramChat,
  linkTelegramChat,
  linkTelegramChatIfAvailable,
  clearTelegramChat,
  setUserLanguage,
  getRoleEvaluationStatus,
  getPendingStudentEvaluationCount,
  getSupportContacts,
};
