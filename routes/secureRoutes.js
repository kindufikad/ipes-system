const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { SYSTEM_ADMIN_CONFLICT_MESSAGE, getActiveSystemAdmin, isActiveSystemAdminUniqueError, isSystemAdminRole } = require('../utils/systemAdminPolicy');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ADMIN_DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || 'admin@123';
const USER_DEFAULT_PASSWORD = process.env.USER_DEFAULT_PASSWORD || process.env.DEFAULT_PASSWORD || '12345678';

const getDefaultPasswordForRole = (role) => {
  if (String(role || '').toLowerCase() === 'admin') return ADMIN_DEFAULT_PASSWORD;
  return USER_DEFAULT_PASSWORD;
};

router.use(authenticateToken);
router.use(authorizeRoles('admin', 'dept_head', 'department_head'));

const NAME_REGEX = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const STUDENT_ID_REGEX = /^mau\d{7}$/i;
const EMPLOYEE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateRegistrationPayload = ({ first_name, last_name, full_name, role, student_id, employee_id, email }) => {
  const errors = {};
  const normalizedRole = String(role || '').trim().toLowerCase();
  const nameParts = String(full_name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = String(first_name || nameParts[0] || '').trim();
  const lastName = String(last_name || nameParts.slice(1).join(' ') || '').trim();

  if (!firstName || !NAME_REGEX.test(firstName)) {
    errors.first_name = 'First name is required and may contain only letters, spaces, hyphens, and apostrophes.';
  }

  if (!lastName || !NAME_REGEX.test(lastName)) {
    errors.last_name = 'Last name is required and may contain only letters, spaces, hyphens, and apostrophes.';
  }

  if (normalizedRole === 'student') {
    const studentId = String(student_id || '').trim();
    if (!STUDENT_ID_REGEX.test(studentId)) {
      errors.student_id = "Student ID must start with 'mau' followed by exactly 7 digits (e.g. mau1600756).";
    }
  }

  if (['instructor', 'dept_head', 'lab_assistant'].includes(normalizedRole)) {
    const employeeId = String(employee_id || '').trim();
    if (!employeeId || !EMPLOYEE_ID_REGEX.test(employeeId)) {
      errors.employee_id = 'Employee ID is required and must contain at least 3 valid characters.';
    }
  }

  if (!['admin', 'systemadmin'].includes(normalizedRole)) {
    const emailValue = String(email || '').trim();
    if (!emailValue || !EMAIL_REGEX.test(emailValue)) {
      errors.email = 'Please provide a valid email address.';
    }
  }

  return errors;
};

const resolveDepartmentId = async (value) => {
  if (value == null) return null;
  const candidate = String(value).trim();
  if (!candidate) return null;

  const numericId = Number(candidate);
  if (Number.isFinite(numericId) && Number.isInteger(numericId) && numericId > 0) {
    const [rows] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [numericId]);
    if (rows.length) return rows[0].id;
  }

  const lowerCandidate = candidate.toLowerCase();
  const [rows] = await pool.query(
    'SELECT id FROM departments WHERE LOWER(name) = ? OR LOWER(code) = ? LIMIT 1',
    [lowerCandidate, lowerCandidate]
  );

  return rows.length ? rows[0].id : null;
};

const findExistingDepartmentHead = async (department, excludeUserId = null) => {
  if (!department || !String(department).trim()) return null;

  const resolvedDepartmentId = await resolveDepartmentId(department);
  if (!resolvedDepartmentId) {
    return null;
  }

  const query = `SELECT u.id FROM users u
    INNER JOIN instructors i ON u.id = i.user_id
    WHERE i.department_id = ? AND u.role = ? AND u.status != ?${excludeUserId ? ' AND u.id != ?' : ''} LIMIT 1`;
  const params = [resolvedDepartmentId, 'dept_head', 'inactive'];
  if (excludeUserId) params.push(excludeUserId);
  const [rows] = await pool.query(query, params);
  if (rows.length) return rows[0];

  // Fallback: if a dept_head user exists without an instructor row, check legacy department text field
  const legacyQuery = `SELECT id FROM users WHERE department = ? AND role = ? AND status != ?${excludeUserId ? ' AND id != ?' : ''} LIMIT 1`;
  const legacyParams = [String(department).trim(), 'dept_head', 'inactive'];
  if (excludeUserId) legacyParams.push(excludeUserId);
  const [legacyRows] = await pool.query(legacyQuery, legacyParams);
  return legacyRows.length ? legacyRows[0] : null;
};

router.get('/users', async (req, res) => {
  try {
    const { role, year_level, year, section, department, department_id, program_type } = req.query;

    const whereClauses = [];
    const params = [];

    const normalizedRole = String(role || '').trim().toLowerCase();
    if (normalizedRole) {
      whereClauses.push('u.role = ?');
      params.push(normalizedRole === 'depthead' ? 'dept_head' : normalizedRole);
    }

    if (['dept_head', 'department_head'].includes(String(req.user.role || '').toLowerCase())) {
      const currentDepartmentId = await resolveDepartmentId(req.user.department_id || req.user.departmentId || req.user.department);
      if (!currentDepartmentId) {
        return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
      }
      whereClauses.push('(i.department_id = ? OR s.department_id = ? OR la.department_id = ?)');
      params.push(currentDepartmentId, currentDepartmentId, currentDepartmentId);
    } else if (department_id) {
      const departmentId = Number(department_id);
      if (!Number.isInteger(departmentId) || departmentId <= 0) {
        return res.status(400).json({ message: 'department_id must be a positive integer.' });
      }
      whereClauses.push('(i.department_id = ? OR s.department_id = ? OR la.department_id = ?)');
      params.push(departmentId, departmentId, departmentId);
    } else if (department) {
      whereClauses.push('(d.name = ? OR d.code = ?)');
      const departmentValue = String(department).trim();
      params.push(departmentValue, departmentValue);
    }

    const resolvedYear = year_level || year;
    if (resolvedYear) {
      const yearNumber = String(resolvedYear).match(/\d+/)?.[0] || '';
      if (yearNumber) {
        whereClauses.push("REGEXP_REPLACE(LOWER(COALESCE(s.year_level, '')), '[^0-9]', '') = ?");
        params.push(yearNumber);
      }
    }

    if (section) {
      const normalizedSection = String(section).trim().replace(/^section\s*/i, '').toLowerCase();
      if (normalizedSection) {
        whereClauses.push("LOWER(TRIM(REPLACE(REPLACE(COALESCE(s.section, ''), 'Section ', ''), 'section ', ''))) = ?");
        params.push(normalizedSection);
      }
    }

    if (program_type) {
      whereClauses.push('LOWER(TRIM(COALESCE(s.program_type, \'\'))) = ?');
      params.push(String(program_type).trim().toLowerCase());
    }

    const query = `SELECT u.id,
      COALESCE(u.email, s.student_id, '') AS username,
      u.email,
      s.student_id,
      u.role,
      u.status,
      '' AS department,
      COALESCE(d.name, '-') AS department_name,
      '' AS college,
      '' AS academic_year,
      COALESCE(s.semester, '') AS semester,
      COALESCE(s.year_level, '') AS year,
      COALESCE(s.section, '') AS section,
      '' AS specialization,
      '' AS learning_level,
      COALESCE(s.student_id, '') AS student_student_id,
      COALESCE(i.employee_id, la.employee_id, '-') AS employee_id,
      COALESCE(s.program_type, '') AS program_type,
      COALESCE(u.created_at, '') AS registration_date,
      COALESCE(i.phone_number, la.phone_number, s.phone_number, '') AS phone_number,
      COALESCE(
        CASE WHEN i.first_name IS NOT NULL THEN TRIM(CONCAT_WS(' ', i.first_name, i.last_name)) END,
        CASE WHEN la.first_name IS NOT NULL THEN TRIM(CONCAT_WS(' ', la.first_name, la.last_name)) END,
        CASE WHEN s.first_name IS NOT NULL THEN TRIM(CONCAT_WS(' ', s.first_name, s.last_name)) END,
        u.email,
        s.student_id
      ) AS full_name,
      COALESCE(i.first_name, la.first_name, s.first_name, '') AS first_name,
      COALESCE(i.last_name, la.last_name, s.last_name, '') AS last_name,
      COALESCE(i.department_id, la.department_id, s.department_id) AS department_id
      FROM users u
      LEFT JOIN instructors i ON u.id = i.user_id
      LEFT JOIN lab_assistants la ON u.id = la.user_id
      LEFT JOIN students s ON u.id = s.user_id
      LEFT JOIN departments d ON d.id = COALESCE(i.department_id, la.department_id, s.department_id)
      ${whereClauses.length ? ' WHERE ' + whereClauses.join(' AND ') : ''}
      ORDER BY u.id DESC`;
    const [rows] = await pool.query(query, params);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const {
      full_name,
      email,
      username,
      password,
      role = 'student',
      department,
      department_id,
      department_name,
      phone_number,
      college,
      academic_year,
      semester,
      year,
      section,
      specialization,
      learning_level,
      student_id,
      employee_id,
      program_type,
      gender,
    } = req.body;

    const errors = {};
    if (!full_name || !String(full_name).trim()) errors.full_name = 'full_name is required';
    if (!username || !String(username).trim()) errors.username = 'username is required';
    if (role === 'student' && (!section || !String(section).trim())) errors.section = 'section is required for students';
    if (role === 'student' && (!year || !String(year).trim())) errors.year = 'year is required for students';

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    const passwordValue = typeof password === 'string' && password.trim() ? password.trim() : getDefaultPasswordForRole(role);
    const hashedPassword = await bcrypt.hash(String(passwordValue).trim(), 10);
    const userFields = {
      username: String(username).trim(),
      password_hash: hashedPassword,
      role,
      is_first_login: 1,
      gender: typeof gender === 'string' && gender.trim() ? gender.trim() : null,
    };
    if (isSystemAdminRole(role)) {
      const nameParts = String(full_name).trim().split(/\s+/).filter(Boolean);
      userFields.first_name = nameParts.shift() || '';
      userFields.last_name = nameParts.join(' ');
    }
    const profileFields = {
      full_name: String(full_name).trim(),
      email: typeof email === 'string' && email.trim() ? email.trim() : null,
      department: typeof department === 'string' && department.trim() ? department.trim() : null,
      department_name: typeof department_name === 'string' && department_name.trim() ? department_name.trim() : null,
      phone_number: typeof phone_number === 'string' && phone_number.trim() ? phone_number.trim() : null,
      college: typeof college === 'string' && college.trim() ? college.trim() : null,
      academic_year: typeof academic_year === 'string' && academic_year.trim() ? academic_year.trim() : null,
      semester: typeof semester === 'string' && semester.trim() ? semester.trim() : null,
      year: typeof year === 'string' && year.trim() ? year.trim() : null,
      section: typeof section === 'string' && section.trim() ? section.trim() : null,
      specialization: typeof specialization === 'string' && specialization.trim() ? specialization.trim() : null,
      learning_level: typeof learning_level === 'string' && learning_level.trim() ? learning_level.trim() : null,
      student_id: typeof student_id === 'string' && student_id.trim() ? student_id.trim() : null,
      employee_id: typeof employee_id === 'string' && employee_id.trim() ? employee_id.trim() : null,
      program_type: typeof program_type === 'string' && program_type.trim() ? program_type.trim() : null,
      gender: typeof gender === 'string' && gender.trim() ? gender.trim() : null,
    };

    const resolvedDepartmentId = await resolveDepartmentId(department_id ?? department ?? department_name);
    const [[departmentRow]] = resolvedDepartmentId
      ? await pool.query('SELECT college_id FROM departments WHERE id = ? LIMIT 1', [resolvedDepartmentId])
      : [[]];
    userFields.college_id = departmentRow?.college_id || null;
    if (role === 'dept_head') {
      if (!resolvedDepartmentId) {
        return res.status(400).json({ message: 'Please select a valid department before assigning a Department Head.' });
      }

      const existing = await findExistingDepartmentHead(resolvedDepartmentId);
      if (existing) {
        return res.status(409).json({ message: 'Department Head already exists for this department. Please update or reassign the existing Department Head.' });
      }
    }

    // Use transaction to create user and role-specific records
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (isSystemAdminRole(role)) {
        const activeAdmin = await getActiveSystemAdmin(conn);
        if (activeAdmin) {
          await conn.rollback();
          return res.status(409).json({ success: false, message: SYSTEM_ADMIN_CONFLICT_MESSAGE });
        }
      }

      const columns = Object.keys(userFields);
      const values = columns.map((column) => userFields[column]);
      const placeholders = columns.map(() => '?').join(', ');
      const [result] = await conn.query(`INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders})`, values);
      const newUserId = result.insertId;

      if (role === 'student') {
        // insert into students table
        const studentInsert = `INSERT INTO students (user_id, student_id, first_name, last_name, department_id, semester, year_level, section, program_type, gender, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)`;
        const studentValues = [
          newUserId,
          profileFields.student_id || null,
          profileFields.full_name || null,
          null,
          resolvedDepartmentId || null,
          profileFields.semester || null,
          profileFields.year || null,
          profileFields.section || null,
          profileFields.program_type || null,
          profileFields.gender || null,
        ];
        await conn.query(studentInsert, studentValues);
      } else if (role === 'lab_assistant') {
        // Lab assistants use instructors table as single source of truth
        const instructorInsert = `INSERT INTO instructors (user_id, employee_id, first_name, last_name, department_id, gender) VALUES (?, ?, ?, ?, ?, ?)`;
        const instructorValues = [
          newUserId,
          profileFields.employee_id || null,
          profileFields.full_name.trim().split(/\s+/)[0] || null,
          profileFields.full_name.trim().split(/\s+/).slice(1).join(' ') || profileFields.full_name,
          resolvedDepartmentId || null,
          profileFields.gender || null,
        ];
        await conn.query(instructorInsert, instructorValues);
      } else if (role === 'instructor' || role === 'dept_head') {
        const instructorInsert = `INSERT INTO instructors (user_id, employee_id, first_name, last_name, department_id, gender) VALUES (?, ?, ?, ?, ?, ?)`;
        const instructorValues = [
          newUserId,
          profileFields.employee_id || null,
          profileFields.full_name || null,
          null,
          resolvedDepartmentId || null,
          profileFields.gender || null,
        ];
        await conn.query(instructorInsert, instructorValues);
      }

      await conn.commit();
      res.status(201).json({ id: newUserId, message: 'User created successfully' });
    } catch (sqlErr) {
      try { await conn.rollback(); } catch (e) {}
      if (isActiveSystemAdminUniqueError(sqlErr)) {
        return res.status(409).json({ success: false, message: SYSTEM_ADMIN_CONFLICT_MESSAGE });
      }
      console.error('Secure user creation transaction failed:', sqlErr);
      return res.status(500).json({ message: 'Failed to create user', error: sqlErr.message });
    } finally {
      conn.release();
    }
  } catch (error) {
    if (isActiveSystemAdminUniqueError(error)) {
      return res.status(409).json({ success: false, message: SYSTEM_ADMIN_CONFLICT_MESSAGE });
    }
    console.error('Secure user creation failed:', error);
    res.status(500).json({ message: 'Failed to create user', error: error.message, code: error.code, sql: error.sql });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const {
      full_name,
      email,
      username,
      password,
      role,
      department,
      department_name,
      phone_number,
      college,
      academic_year,
      semester,
      year,
      section,
      specialization,
      learning_level,
      student_id,
      employee_id,
      program_type,
      gender,
      status,
    } = req.body;

    const [existingUserRows] = await pool.query('SELECT role, status, department FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!existingUserRows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentUser = existingUserRows[0];
    const newRole = typeof role === 'string' && role.trim() ? role.trim() : currentUser.role;
    const normalizedDepartment = typeof department === 'string' && department.trim() ? department.trim() : currentUser.department;
    const nextStatus = typeof status === 'string' && status.trim() ? status.trim() : currentUser.status;

    if (isSystemAdminRole(newRole) && String(nextStatus || '').toLowerCase() === 'active') {
      const activeAdmin = await getActiveSystemAdmin(pool, userId);
      if (activeAdmin) return res.status(409).json({ success: false, message: SYSTEM_ADMIN_CONFLICT_MESSAGE });
    }

    const errors = {};
    if (username !== undefined && !username?.trim()) errors.username = 'username is required';
    if (newRole === 'student' && (section === undefined || !String(section).trim())) errors.section = 'section is required for students';
    if (newRole === 'student' && (year === undefined || !String(year).trim())) errors.year = 'year is required for students';

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    if (newRole === 'dept_head') {
      const resolvedDepartmentId = await resolveDepartmentId(department !== undefined ? department : currentUser.department);
      if (!resolvedDepartmentId) {
        return res.status(400).json({ message: 'Please select a valid department before assigning a Department Head.' });
      }

      const existing = await findExistingDepartmentHead(resolvedDepartmentId, userId);
      if (existing) {
        return res.status(409).json({ message: 'Department Head already exists for this department. Please update or reassign the existing Department Head.' });
      }
    }

    const userFields = {
      full_name: typeof full_name === 'string' && full_name.trim() ? full_name.trim() : undefined,
      email: typeof email === 'string' && email.trim() ? email.trim() : undefined,
      username: typeof username === 'string' && username.trim() ? username.trim() : undefined,
      password_hash: typeof password === 'string' && password.trim() ? await bcrypt.hash(password.trim(), 10) : undefined,
      role: typeof role === 'string' && role.trim() ? role.trim() : undefined,
      department: normalizedDepartment,
      department_name: typeof department_name === 'string' && department_name.trim() ? department_name.trim() : undefined,
      phone_number: typeof phone_number === 'string' && phone_number.trim() ? phone_number.trim() : undefined,
      college: typeof college === 'string' && college.trim() ? college.trim() : undefined,
      academic_year: typeof academic_year === 'string' && academic_year.trim() ? academic_year.trim() : undefined,
      semester: typeof semester === 'string' && semester.trim() ? semester.trim() : undefined,
      year: typeof year === 'string' && year.trim() ? year.trim() : undefined,
      section: typeof section === 'string' && section.trim() ? section.trim() : undefined,
      specialization: typeof specialization === 'string' && specialization.trim() ? specialization.trim() : undefined,
      learning_level: typeof learning_level === 'string' && learning_level.trim() ? learning_level.trim() : undefined,
      student_id: typeof student_id === 'string' && student_id.trim() ? student_id.trim() : undefined,
      employee_id: typeof employee_id === 'string' && employee_id.trim() ? employee_id.trim() : undefined,
      gender: typeof gender === 'string' && gender.trim() ? gender.trim() : undefined,
      status: typeof status === 'string' && status.trim() ? status.trim() : undefined,
    };

    const updateEntries = Object.entries(userFields).filter(([, value]) => value !== undefined);
    if (!updateEntries.length) {
      return res.status(400).json({ message: 'No valid fields provided to update' });
    }

    const updateClause = updateEntries.map(([key]) => `${key} = ?`).join(', ');
    const updateValues = updateEntries.map(([, value]) => value);
    updateValues.push(userId);

    const [result] = await pool.query(`UPDATE users SET ${updateClause} WHERE id = ?`, updateValues);
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ id: userId, message: 'User updated successfully' });
  } catch (error) {
    if (isActiveSystemAdminUniqueError(error)) {
      return res.status(409).json({ success: false, message: SYSTEM_ADMIN_CONFLICT_MESSAGE });
    }
    console.error('Secure user update failed:', error);
    res.status(500).json({ message: 'Failed to update user', error: error.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Secure user delete failed:', error);
    res.status(500).json({ message: 'Failed to delete user', error: error.message });
  }
});

router.get('/courses', async (req, res) => {
  try {
    const { department_id } = req.query;
    const whereClauses = [];
    const params = [];

    if (['dept_head', 'department_head'].includes(String(req.user.role || '').toLowerCase())) {
      const currentDepartmentId = await resolveDepartmentId(req.user.department_id || req.user.departmentId || req.user.department);
      if (!currentDepartmentId) {
        return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
      }
      whereClauses.push('c.department_id = ?');
      params.push(currentDepartmentId);
    } else if (department_id) {
      whereClauses.push('c.department_id = ?');
      params.push(department_id);
    }

    const [departmentColumns] = await pool.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'departments'
         AND COLUMN_NAME IN ('name', 'department_name')
       ORDER BY FIELD(COLUMN_NAME, 'name', 'department_name')
       LIMIT 1`
    );

    const departmentNameColumn = departmentColumns.length
      ? (departmentColumns[0].COLUMN_NAME === 'department_name' ? 'd.department_name' : 'd.name')
      : "'N/A'";

    const query = `
      SELECT
        c.id,
        c.code,
        c.name,
        c.department_id,
        c.year_level,
        c.semester,
        c.credit_hours,
        ${departmentNameColumn} AS department_name
      FROM courses c
      LEFT JOIN departments d ON c.department_id = d.id
      ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
      ORDER BY c.id DESC
    `;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching courses:', error.message);
    res.status(500).json({ message: 'Failed to fetch courses', error: error.message });
  }
});

router.post('/courses/bulk-upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Please choose a CSV file.' });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) : [];
    if (!rows.length) return res.status(400).json({ message: 'The CSV file contains no rows.' });

    const normalizeRow = (row) => Object.entries(row).reduce((result, [key, value]) => {
      const normalizedKey = String(key).trim().toLowerCase().replace(/\s+/g, '_');
      result[normalizedKey] = String(value ?? '').trim();
      return result;
    }, {});
    const normalizedRows = rows.map(normalizeRow);
    const requiredFields = ['course_name', 'course_code', 'credit_hours', 'year_level', 'semester'];
    const missingHeaders = requiredFields.filter((field) => !Object.prototype.hasOwnProperty.call(normalizedRows[0], field));
    if (missingHeaders.length) return res.status(400).json({ message: `Missing required CSV headers: ${missingHeaders.join(', ')}` });

    let departmentId = req.body.department_id || req.body.departmentId || null;
    if (req.user.role === 'dept_head') {
      departmentId = await resolveDepartmentId(req.user.department_id || req.user.departmentId || req.user.department);
      if (!departmentId) return res.status(403).json({ message: 'Your department is not defined. Contact an administrator.' });
    } else if (departmentId) {
      departmentId = await resolveDepartmentId(departmentId);
    }
    if (!departmentId) return res.status(400).json({ message: 'A valid department is required.' });

    const seenCodes = new Set();
    const coursesToCreate = [];
    for (const [index, row] of normalizedRows.entries()) {
      const missingFields = requiredFields.filter((field) => !row[field]);
      const creditHours = Number(row.credit_hours);
      if (missingFields.length) return res.status(400).json({ message: `Row ${index + 2} is missing: ${missingFields.join(', ')}` });
      if (!Number.isInteger(creditHours) || creditHours <= 0) return res.status(400).json({ message: `Row ${index + 2} has invalid credit_hours.` });
      const code = row.course_code.toLowerCase();
      if (seenCodes.has(code)) return res.status(400).json({ message: `Duplicate course_code in row ${index + 2}: ${row.course_code}` });
      seenCodes.add(code);
      coursesToCreate.push({ name: row.course_name, code: row.course_code, creditHours, yearLevel: row.year_level, semester: row.semester });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const course of coursesToCreate) {
        const [existing] = await connection.query('SELECT id FROM courses WHERE department_id = ? AND LOWER(code) = LOWER(?) LIMIT 1', [departmentId, course.code]);
        if (existing.length) throw new Error(`Course code already exists: ${course.code}`);
      }
      const createdCourses = [];
      for (const course of coursesToCreate) {
        const [result] = await connection.query(
          'INSERT INTO courses (code, name, department_id, year_level, semester, credit_hours) VALUES (?, ?, ?, ?, ?, ?)',
          [course.code, course.name, departmentId, course.yearLevel, course.semester, course.creditHours]
        );
        createdCourses.push({ id: result.insertId, code: course.code, name: course.name, department_id: departmentId, year_level: course.yearLevel, semester: course.semester, credit_hours: course.creditHours });
      }
      await connection.commit();
      return res.status(201).json({ created: createdCourses.length, courses: createdCourses, message: 'Courses uploaded successfully.' });
    } catch (error) {
      await connection.rollback();
      return res.status(400).json({ message: error.message });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Bulk course upload failed:', error);
    return res.status(500).json({ message: 'Unable to upload courses.', error: error.message });
  }
});

router.post('/courses', async (req, res) => {
  try {
    const courseCode = req.body.course_code || req.body.code;
    const courseName = req.body.course_name || req.body.name;
    const departmentId = req.body.department_id ?? req.body.departmentId ?? null;
    const yearLevel = req.body.year_level || null;
    const semester = req.body.semester || null;
    const creditHours = req.body.credit_hours ?? req.body.creditHours ?? null;

    if (!courseCode || !courseName) {
      return res.status(400).json({ message: 'course_code and course_name are required' });
    }

    if (creditHours !== null && (!Number.isInteger(Number(creditHours)) || Number(creditHours) <= 0)) {
      return res.status(400).json({ message: 'credit_hours must be a positive whole number' });
    }

    if (req.user.role === 'dept_head') {
      const currentDepartmentId = await resolveDepartmentId(req.user.department_id || req.user.departmentId || req.user.department);
      if (!currentDepartmentId || Number(departmentId) !== Number(currentDepartmentId)) {
        return res.status(403).json({ message: 'You can only create courses for your department.' });
      }
    }

    const [result] = await pool.query(
      'INSERT INTO courses (code, name, department_id, year_level, semester, credit_hours) VALUES (?, ?, ?, ?, ?, ?)',
      [courseCode, courseName, departmentId, yearLevel, semester, creditHours || 3]
    );

    res.status(201).json({
      id: result.insertId,
      code: courseCode,
      name: courseName,
      department_id: departmentId,
      year_level: yearLevel,
      semester,
      credit_hours: creditHours || 3,
      message: 'Course created successfully',
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create course', error: error.message });
  }
});

router.put('/courses/:id', async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const courseCode = req.body.course_code || req.body.code;
    const courseName = req.body.course_name || req.body.name;
    const departmentId = req.body.department_id ?? req.body.departmentId;
    const yearLevel = req.body.year_level ?? req.body.yearLevel;
    const semester = req.body.semester;
    const creditHours = req.body.credit_hours ?? req.body.creditHours;

    if (!Number.isInteger(courseId) || courseId <= 0 || !courseCode || !courseName) {
      return res.status(400).json({ message: 'A valid course id, code, and name are required.' });
    }
    if (creditHours !== undefined && (!Number.isInteger(Number(creditHours)) || Number(creditHours) <= 0)) {
      return res.status(400).json({ message: 'credit_hours must be a positive whole number' });
    }

    const [courseRows] = await pool.query('SELECT department_id FROM courses WHERE id = ? LIMIT 1', [courseId]);
    if (!courseRows.length) return res.status(404).json({ message: 'Course not found.' });
    if (req.user.role === 'dept_head') {
      const currentDepartmentId = await resolveDepartmentId(req.user.department_id || req.user.departmentId || req.user.department);
      if (!currentDepartmentId || Number(courseRows[0].department_id) !== Number(currentDepartmentId) || Number(departmentId) !== Number(currentDepartmentId)) {
        return res.status(403).json({ message: 'You can only manage courses for your department.' });
      }
    }

    await pool.query(
      'UPDATE courses SET code = ?, name = ?, department_id = ?, year_level = ?, semester = ?, credit_hours = ? WHERE id = ?',
      [courseCode, courseName, departmentId, yearLevel || null, semester || null, creditHours || 3, courseId]
    );
    return res.json({ id: courseId, code: courseCode, name: courseName, department_id: departmentId, year_level: yearLevel, semester, credit_hours: creditHours || 3 });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update course', error: error.message });
  }
});

router.delete('/courses/:id', async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const [courseRows] = await pool.query('SELECT department_id FROM courses WHERE id = ? LIMIT 1', [courseId]);
    if (!courseRows.length) return res.status(404).json({ message: 'Course not found.' });
    if (req.user.role === 'dept_head') {
      const currentDepartmentId = await resolveDepartmentId(req.user.department_id || req.user.departmentId || req.user.department);
      if (!currentDepartmentId || Number(courseRows[0].department_id) !== Number(currentDepartmentId)) {
        return res.status(403).json({ message: 'You can only manage courses for your department.' });
      }
    }
    await pool.query('DELETE FROM courses WHERE id = ?', [courseId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete course', error: error.message });
  }
});

router.get('/evaluations', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM evaluations ORDER BY id DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch evaluations', error: error.message });
  }
});

router.post('/evaluations', async (req, res) => {
  try {
    const { instructor_id, instructor_name, course_code, course_name, average_score = 0, completed = 0, pending = 0, status = 'pending' } = req.body;
    const [result] = await pool.query(
      'INSERT INTO evaluations (instructor_id, instructor_name, course_code, course_name, average_score, completed, pending, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [instructor_id, instructor_name, course_code, course_name, average_score, completed, pending, status]
    );

    res.status(201).json({ id: result.insertId, message: 'Evaluation created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create evaluation', error: error.message });
  }
});

router.get('/submissions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM evaluation_submissions ORDER BY id DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch submissions', error: error.message });
  }
});

router.post('/submissions', async (req, res) => {
  try {
    const { submitter_role, submitter_name, instructor_name, course_code, course_name, score = 0, feedback = '', responses = {} } = req.body;
    const [result] = await pool.query(
      'INSERT INTO evaluation_submissions (submitter_role, submitter_name, instructor_name, course_code, course_name, score, feedback, responses) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [submitter_role, submitter_name, instructor_name, course_code, course_name, score, feedback, JSON.stringify(responses)]
    );

    res.status(201).json({ id: result.insertId, message: 'Submission saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save submission', error: error.message });
  }
});

// Dept Head Evaluations - Submit or update evaluation
router.post('/dept-head/evaluations', async (req, res) => {
  try {
    const { evaluator_id, instructor_id, department_id, criteria_scores = {}, total_score = 0 } = req.body;

    if (!evaluator_id || !instructor_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'evaluator_id and instructor_id are required' 
      });
    }

    // Upsert: Try to update existing evaluation, or insert if not exists
    const [existingRows] = await pool.query(
      'SELECT id FROM dept_head_evaluations WHERE evaluator_id = ? AND instructor_id = ? LIMIT 1',
      [evaluator_id, instructor_id]
    );

    let result;
    if (existingRows.length > 0) {
      // Update existing evaluation
      [result] = await pool.query(
        `UPDATE dept_head_evaluations 
         SET criteria_scores = ?, total_score = ?, status = ?, updated_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(criteria_scores), total_score, 'Submitted', existingRows[0].id]
      );
    } else {
      // Insert new evaluation
      [result] = await pool.query(
        `INSERT INTO dept_head_evaluations 
         (evaluator_id, instructor_id, department_id, criteria_scores, total_score, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [evaluator_id, instructor_id, department_id, JSON.stringify(criteria_scores), total_score, 'Submitted']
      );
    }

    res.status(201).json({ 
      success: true,
      message: 'Evaluation submitted successfully',
      data: {
        id: existingRows.length > 0 ? existingRows[0].id : result.insertId,
        total_score,
        status: 'Submitted'
      }
    });
  } catch (error) {
    console.error('Dept head evaluation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to submit evaluation', 
      error: error.message 
    });
  }
});

// Dept Head Evaluations - Get all evaluations for a department
router.get('/dept-head/evaluations', async (req, res) => {
  try {
    const departmentId = req.query.department_id || req.user.department_id;
    
    if (!departmentId) {
      return res.status(400).json({ 
        success: false, 
        message: 'department_id is required' 
      });
    }

    const [rows] = await pool.query(
      `SELECT dhe.*, i.first_name, i.last_name, i.employee_id
       FROM dept_head_evaluations dhe
       LEFT JOIN instructors i ON dhe.instructor_id = i.id
       WHERE dhe.department_id = ?
       ORDER BY dhe.updated_at DESC`,
      [departmentId]
    );

    res.status(200).json({ 
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Fetch dept head evaluations error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch evaluations', 
      error: error.message 
    });
  }
});

// Dept Head Evaluations - Get single evaluation
router.get('/dept-head/evaluations/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT dhe.*, i.first_name, i.last_name, i.employee_id
       FROM dept_head_evaluations dhe
       LEFT JOIN instructors i ON dhe.instructor_id = i.id
       WHERE dhe.id = ?
       LIMIT 1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Evaluation not found' 
      });
    }

    res.status(200).json({ 
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Fetch single evaluation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch evaluation', 
      error: error.message 
    });
  }
});

module.exports = router;
