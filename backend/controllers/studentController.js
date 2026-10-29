const bcrypt = require('bcryptjs');
const fs = require('fs');
const XLSX = require('xlsx');
const pool = require('../config/db');

const normalizeHeader = (value = '') => String(value)
  .trim()
  .replace(/^\uFEFF/, '')
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .toLowerCase()
  .replace(/[\s-]+/g, '_')
  .replace(/[^a-z0-9_]/g, '')
  .replace(/_+/g, '_');

const parseRows = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }).map((row) => Object.entries(row).reduce((result, [key, value]) => {
    result[normalizeHeader(key)] = value == null ? '' : String(value).trim();
    return result;
  }, {}));
};

const normalizeGenderValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'male' || normalized === 'm') return 'male';
  if (normalized === 'female' || normalized === 'f') return 'female';
  return '';
};

const getValue = (row, names) => names.map((name) => row[name]).find((value) => value != null && String(value).trim())?.toString().trim() || '';
const getDefaultPasswordHash = (password = '12345678') => bcrypt.hash(password, 12);

const resolveDepartmentId = async (connection, value) => {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  const numericId = Number(candidate);
  if (Number.isInteger(numericId) && numericId > 0) {
    const [byId] = await connection.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [numericId]);
    if (byId.length) return byId[0].id;
  }
  const [byName] = await connection.query('SELECT id FROM departments WHERE LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?) LIMIT 1', [candidate, candidate]);
  return byName[0]?.id || null;
};

const toStudent = (row = {}) => {
  const fullName = getValue(row, ['full_name', 'name']);
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: getValue(row, ['first_name', 'firstName', 'firstname']) || parts.shift() || '',
    lastName: getValue(row, ['last_name', 'lastName', 'lastname']) || parts.join(' '),
    gender: normalizeGenderValue(getValue(row, ['gender', 'sex'])),
    studentId: getValue(row, ['student_id', 'studentId', 'studentid', 'student_number']),
    department: getValue(row, ['department_id', 'departmentId', 'department']),
    email: getValue(row, ['email']),
    password: getValue(row, ['password']),
    semester: getValue(row, ['semester']),
    yearLevel: getValue(row, ['year_level', 'yearLevel', 'year']),
    section: getValue(row, ['section']),
    programType: getValue(row, ['program_type', 'program']),
    registrationDate: getValue(row, ['registration_date', 'registrationDate', 'registrationdate']),
  };
};

const missingFields = (student) => ['firstName', 'lastName', 'studentId', 'gender', 'department', 'programType', 'semester', 'yearLevel', 'section']
  .filter((field) => !student[field])
  .map((field) => ({ firstName: 'first_name', lastName: 'last_name', studentId: 'student_id', gender: 'gender', department: 'department_id', programType: 'program_type', semester: 'semester', yearLevel: 'year_level', section: 'section' }[field]));

const saveStudent = async (connection, student) => {
  const departmentId = await resolveDepartmentId(connection, student.department);
  if (!departmentId) throw new Error('Department was not found.');
  const passwordHash = await bcrypt.hash('12345678', 12);
  const [existing] = await connection.query(
    'SELECT u.id, s.registration_date FROM users u INNER JOIN students s ON s.user_id = u.id WHERE s.student_id = ? LIMIT 1',
    [student.studentId]
  );
  let userId;

  if (existing.length) {
    userId = existing[0].id;
    await connection.query(
      'UPDATE users SET email = ?, student_id = ?, password_hash = ?, role = ?, status = ?, is_first_login = 1, must_change_password = 1, gender = ? WHERE id = ?',
      [student.studentId, student.studentId, passwordHash, 'student', 'active', student.gender || 'male', userId]
    );
  } else {
    const [userResult] = await connection.query(
      'INSERT INTO users (email, password_hash, role, student_id, status, is_first_login, must_change_password, gender) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      [student.studentId, passwordHash, 'student', null, 'active', 1, student.gender || 'male']
    );
    userId = userResult.insertId;
  }

  await connection.query(`INSERT INTO students
    (user_id, student_id, first_name, last_name, department_id, semester, year_level, section, program_type, gender, registration_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, ?, CURRENT_DATE))
    ON DUPLICATE KEY UPDATE student_id = VALUES(student_id), first_name = VALUES(first_name), last_name = VALUES(last_name), department_id = VALUES(department_id), semester = VALUES(semester), year_level = VALUES(year_level), section = VALUES(section), program_type = VALUES(program_type), gender = VALUES(gender), registration_date = VALUES(registration_date)`, [userId, student.studentId, student.firstName, student.lastName, departmentId, student.semester, student.yearLevel, student.section, student.programType, student.gender, student.registrationDate || null, existing[0]?.registration_date || null]);

  await connection.query('UPDATE users SET student_id = ? WHERE id = ?', [student.studentId, userId]);

  return { userId, departmentId };
};

const registerStudent = async (req, res) => {
  const student = toStudent(req.body || {});
  const missing = ['studentId', 'firstName', 'lastName', 'gender', 'department', 'programType', 'semester', 'yearLevel', 'section']
    .filter((field) => !student[field])
    .map((field) => ({ studentId: 'student_id', firstName: 'first_name', lastName: 'last_name', gender: 'gender', department: 'department_id' }[field]));
  if (missing.length) return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const data = await saveStudent(connection, student);
    await connection.commit();
    return res.status(201).json({ success: true, message: 'Student registered successfully.', data });
  } catch (error) {
    await connection.rollback();
    console.error('Single student registration failed:', error);
    return res.status(500).json({ success: false, message: 'Student registration failed.', error: error.message });
  } finally {
    connection.release();
  }
};

const bulkRegisterStudents = async (req, res) => {
  let connection;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please choose a CSV or XLSX file.' });
    }

    const rows = parseRows(req.file.buffer || fs.readFileSync(req.file.path));
    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'The uploaded file contains no rows.' });
    }

    const failures = [];
    const validStudents = rows.map((row, index) => {
      const student = toStudent(row);
      const missing = missingFields(student);
      if (missing.length) failures.push({ row: index + 2, message: `Missing required fields: ${missing.join(', ')}` });
      return { student, missing };
    });

    if (failures.length) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file contains invalid rows.',
        failures,
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    for (const { student } of validStudents) {
      const departmentId = await resolveDepartmentId(connection, student.department);
      if (!departmentId) throw new Error(`Department was not found for student ${student.studentId}.`);
      const [[existingStudent]] = await connection.query(
        `SELECT s.user_id AS profile_user_id, s.registration_date,
          u.id AS linked_user_id, u.role AS linked_user_role, u.email AS linked_user_email
         FROM students s
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.student_id = ? LIMIT 1`,
        [student.studentId]
      );
      const email = String(student.email || existingStudent?.linked_user_email || `${student.studentId}@university.edu.et`).trim().toLowerCase();
      const [[emailUser]] = await connection.query(
        'SELECT id, role FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1',
        [email]
      );
      if (existingStudent?.linked_user_id && String(existingStudent.linked_user_role).toLowerCase() !== 'student') {
        throw new Error(`Student ${student.studentId} is linked to a non-student account.`);
      }
      if (existingStudent?.linked_user_id && emailUser && Number(existingStudent.linked_user_id) !== Number(emailUser.id)) {
        throw new Error(`Student ${student.studentId} email is already linked to another user.`);
      }
      if (emailUser && String(emailUser.role).toLowerCase() !== 'student') {
        throw new Error(`Email ${email} is already assigned to a non-student account.`);
      }
      if (emailUser && !existingStudent?.linked_user_id) {
        const [[otherStudent]] = await connection.query(
          'SELECT student_id FROM students WHERE user_id = ? AND student_id <> ? LIMIT 1',
          [emailUser.id, student.studentId]
        );
        if (otherStudent) throw new Error(`Email ${email} is already linked to another student.`);
      }

      let userId = existingStudent?.linked_user_id || emailUser?.id;
      const passwordHash = await getDefaultPasswordHash(student.password || '12345678');
      if (userId) {
        await connection.query(
          `UPDATE users
           SET email = ?, first_name = ?, last_name = ?, password_hash = ?, role = 'student',
             status = 'active', is_first_login = 1, must_change_password = 1, gender = ?
           WHERE id = ?`,
          [email, student.firstName, student.lastName, passwordHash, student.gender || 'male', userId]
        );
      } else {
        const [userResult] = await connection.query(
          `INSERT INTO users (email, first_name, last_name, password_hash, role, status, is_first_login, must_change_password, gender)
           VALUES (?, ?, ?, ?, 'student', 'active', 1, 1, ?)`,
          [email, student.firstName, student.lastName, passwordHash, student.gender || 'male']
        );
        userId = userResult.insertId;
      }

      await connection.query(
        `INSERT INTO students
          (user_id, student_id, first_name, last_name, department_id, semester, year_level, section, program_type, gender, registration_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, ?, CURRENT_DATE))
         ON DUPLICATE KEY UPDATE
           user_id = VALUES(user_id),
           first_name = VALUES(first_name),
           last_name = VALUES(last_name),
           department_id = VALUES(department_id),
           semester = VALUES(semester),
           year_level = VALUES(year_level),
           section = VALUES(section),
           program_type = VALUES(program_type),
           gender = VALUES(gender),
           registration_date = VALUES(registration_date)`,
        [
          userId,
          student.studentId,
          student.firstName,
          student.lastName,
          departmentId,
          student.semester,
          student.yearLevel,
          student.section,
          student.programType,
          student.gender,
          student.registrationDate || null,
          existingStudent?.registration_date || null,
        ]
      );
    }

    await connection.commit();
    return res.status(200).json({
      success: true,
      message: 'Bulk student registration completed.',
      createdCount: validStudents.length,
      failedCount: 0,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Bulk student registration failed:', error);
    return res.status(500).json({ success: false, message: 'Bulk student registration failed.', error: error.message });
  } finally {
    if (connection) connection.release();
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  }
};

module.exports = { bulkRegisterStudents, bulkUploadStudents: bulkRegisterStudents, registerStudent };
