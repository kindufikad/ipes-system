const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const defaultPassword = '12345678';
const departmentId = Number(process.env.SEED_DEPARTMENT_ID || 0);

const accounts = [
  {
    key: 'student',
    email: process.env.SEED_STUDENT_EMAIL || 'student@ipes.edu.et',
    password: defaultPassword,
    role: 'student',
    studentId: process.env.SEED_STUDENT_ID || 'MAU0000001',
    firstName: 'Test',
    lastName: 'Student',
  },
  {
    key: 'instructor',
    email: process.env.SEED_INSTRUCTOR_EMAIL || 'instructor@ipes.edu.et',
    password: defaultPassword,
    role: 'instructor',
    employeeId: process.env.SEED_INSTRUCTOR_EMPLOYEE_ID || 'MAU001',
    firstName: 'Test',
    lastName: 'Instructor',
  },
  {
    key: 'dept_head',
    email: process.env.SEED_DEPT_HEAD_EMAIL || 'depthead@ipes.edu.et',
    password: defaultPassword,
    role: 'dept_head',
    employeeId: process.env.SEED_DEPT_HEAD_EMPLOYEE_ID || 'MAU002',
    firstName: 'Test',
    lastName: 'Department Head',
  },
  {
    key: 'college_dean',
    email: process.env.SEED_DEAN_EMAIL || 'dean@ipes.edu.et',
    password: defaultPassword,
    role: 'college_dean',
    employeeId: process.env.SEED_DEAN_EMPLOYEE_ID || 'MAU003',
    firstName: 'Test',
    lastName: 'Dean',
  },
];

const upsertUser = async (connection, account, hash) => {
  const [[existing]] = await connection.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [account.email]);
  let userId;
  if (existing) {
    userId = existing.id;
    await connection.query(
      'UPDATE users SET password_hash = ?, role = ?, status = \'active\', is_first_login = 1, must_change_password = 1 WHERE id = ?',
      [hash, account.role, userId]
    );
  } else {
    const [result] = await connection.query(
      'INSERT INTO users (email, password_hash, role, status, is_first_login, must_change_password) VALUES (?, ?, ?, \'active\', 1, 1)',
      [account.email, hash, account.role]
    );
    userId = result.insertId;
  }
  return userId;
};

const seedProfile = async (connection, account, userId, resolvedDepartmentId) => {
  if (account.role === 'student') {
    await connection.query(
      `INSERT INTO students
        (user_id, student_id, first_name, last_name, department_id, semester, year_level, section, program_type, registration_date)
       VALUES (?, ?, ?, ?, ?, 'Semester I', '1', 'A', 'Regular', CURRENT_DATE)
       ON DUPLICATE KEY UPDATE
         student_id = VALUES(student_id), first_name = VALUES(first_name), last_name = VALUES(last_name), department_id = VALUES(department_id)`,
      [userId, account.studentId, account.firstName, account.lastName, resolvedDepartmentId]
    );
    return;
  }

  await connection.query(
    `INSERT INTO instructors (user_id, employee_id, first_name, last_name, department_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       employee_id = VALUES(employee_id), first_name = VALUES(first_name), last_name = VALUES(last_name), department_id = VALUES(department_id)`,
    [userId, account.employeeId, account.firstName, account.lastName, resolvedDepartmentId]
  );
};

const main = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let resolvedDepartmentId = departmentId;
    if (!resolvedDepartmentId) {
      const [[department]] = await connection.query('SELECT id FROM departments ORDER BY id ASC LIMIT 1');
      resolvedDepartmentId = Number(department?.id || 0);
    }
    if (!resolvedDepartmentId) throw new Error('No department exists. Set SEED_DEPARTMENT_ID or create a department first.');

    for (const account of accounts) {
      if (account.role !== 'student' && !account.employeeId) throw new Error(`${account.key} employee ID is required.`);
      const hash = await bcrypt.hash(account.password, 10);
      const userId = await upsertUser(connection, account, hash);
      await seedProfile(connection, account, userId, resolvedDepartmentId);
      console.log(`Seeded ${account.role}: ${account.email}`);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error('User seeding failed:', error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
};

main();
