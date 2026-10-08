const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { createEmailTransporter, verifyEmailTransporter } = require('../services/emailService');
const { getSecurityControlSettings, getSystemAccessLock } = require('../services/securityControlService');
const { isSystemAdminRole } = require('../utils/systemAdminPolicy');

const passwordRecoveryEmailMessage = 'Unable to send the verification code. Email service is not configured.';
const isDatabaseConnectionError = (error) => ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST'].includes(error?.code);
const databaseUnavailableMessage = 'Database connection failed. Please ensure MySQL service is running.';

const forgotPassword = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
  }

  let user;
  let emailTransport;
  let otpStored = false;

  try {
    const [[matchedUser]] = await pool.query('SELECT id FROM users WHERE LOWER(email) = ? AND status = \'active\' LIMIT 1', [email]);
    user = matchedUser;
  } catch (error) {
    console.error('Forgot password user lookup failed:', { code: error?.code, message: error?.message });
    return res.status(500).json({ success: false, message: 'Unable to start password recovery. Please try again later.' });
  }

  if (!user) return res.status(404).json({ success: false, message: 'No active account was found for that email.' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  try {
    const codeHash = await bcrypt.hash(code, 10);
    await pool.query('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
    await pool.query(
      'INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))',
      [user.id, codeHash]
    );
    otpStored = true;
  } catch (error) {
    console.error('Forgot password OTP database operation failed:', { code: error?.code, message: error?.message });
    return res.status(500).json({ success: false, message: 'Unable to create a verification code. Please try again later.' });
  }

  try {
    emailTransport = createEmailTransporter();
    await verifyEmailTransporter(emailTransport.transporter);
    const delivery = await emailTransport.transporter.sendMail({
      from: emailTransport.config.from,
      to: email,
      subject: 'IPES password recovery code',
      text: `Your IPES password recovery code is ${code}. It expires in 15 minutes.`,
    });
    if (!delivery?.messageId) throw new Error('SMTP accepted no message identifier for the password recovery email.');
    return res.json({ success: true, message: 'A 6-digit code has been sent to your email.' });
  } catch (error) {
    console.error('Password recovery email delivery failed:', { code: error?.code, message: error?.message });
    if (otpStored) {
      try {
        await pool.query('DELETE FROM password_resets WHERE user_id = ?', [user.id]);
      } catch (cleanupError) {
        console.error('Unable to clean up undelivered password reset OTP:', { code: cleanupError?.code, message: cleanupError?.message });
      }
    }
    const message = error?.code === 'EMAIL_CONFIG_MISSING'
      ? passwordRecoveryEmailMessage
      : 'Unable to deliver the verification code. Please check the email service configuration and try again.';
    return res.status(500).json({ success: false, message });
  } finally {
    if (emailTransport?.transporter) emailTransport.transporter.close();
  }
};

const resetPassword = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || req.body?.verificationCode || '').trim();
  const newPassword = String(req.body?.newPassword || req.body?.new_password || '').trim();
  if (!email || !/^\d{6}$/.test(code) || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'Email, a valid 6-digit code, and a password of at least 8 characters are required.' });
  }

  try {
    const [[reset]] = await pool.query(
      `SELECT pr.id, pr.code_hash, u.id AS user_id
       FROM password_resets pr INNER JOIN users u ON u.id = pr.user_id
       WHERE LOWER(u.email) = ? AND u.status = 'active' AND pr.expires_at > NOW()
       ORDER BY pr.created_at DESC LIMIT 1`,
      [email]
    );
    if (!reset || !(await bcrypt.compare(code, reset.code_hash))) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = ?, is_first_login = 0, must_change_password = 0 WHERE id = ?', [passwordHash, reset.user_id]);
    await pool.query('DELETE FROM password_resets WHERE user_id = ?', [reset.user_id]);
    return res.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    console.error('Password reset failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to reset password.' });
  }
};

const login = async (req, res) => {
  try {
    const identifier = String(req.body?.identifier ?? req.body?.email ?? req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '').trim();

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/Student ID and password are required.',
      });
    }

    let rows;
    try {
      [rows] = await pool.query(
        `SELECT u.id AS user_id,
          u.email,
          u.password_hash AS password,
          u.role,
          u.status,
          u.is_first_login,
          u.must_change_password,
          COALESCE(i.gender, la.gender, s.gender) AS gender,
          COALESCE(i.phone_number, la.phone_number, s.phone_number) AS phone_number,
          COALESCE(i.profile_picture, la.profile_picture, s.profile_picture) AS profile_picture,
          COALESCE(NULLIF(u.first_name, ''), i.first_name, la.first_name, s.first_name, '') AS first_name,
          COALESCE(NULLIF(u.last_name, ''), i.last_name, la.last_name, s.last_name, '') AS last_name,
          COALESCE(i.department_id, la.department_id, s.department_id) AS department_id,
          d.code AS department_code,
          d.name AS department_name,
          s.student_id,
          COALESCE(i.employee_id, la.employee_id) AS employee_id,
           COALESCE(NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), NULLIF(CONCAT_WS(' ', i.first_name, i.last_name), ''), NULLIF(CONCAT_WS(' ', la.first_name, la.last_name), ''), NULLIF(CONCAT_WS(' ', s.first_name, s.last_name), ''), u.email) AS full_name
         FROM users u
         LEFT JOIN instructors i ON i.user_id = u.id
          LEFT JOIN lab_assistants la ON la.user_id = u.id
         LEFT JOIN students s ON s.user_id = u.id
          LEFT JOIN departments d ON d.id = COALESCE(i.department_id, la.department_id, s.department_id)
        WHERE (u.email = ? OR s.student_id = ? OR i.employee_id = ? OR la.employee_id = ?)
           AND u.status = 'active'
         LIMIT 1`,
        [identifier, identifier, identifier, identifier]
      );
    } catch (err) {
      console.error('EXACT LOGIN SQL ERROR:', err.message, err.sql);
      console.error(err.stack);
      if (isDatabaseConnectionError(err)) {
        return res.status(503).json({ success: false, message: databaseUnavailableMessage });
      }
      return res.status(500).json({ success: false, message: 'Unable to complete login.' });
    }

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect email',
      });
    }

    const user = rows[0];
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
    const passwordMatches = Boolean(user.password) && await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password',
      });
    }

    let systemAccessLock;
    try {
      systemAccessLock = await getSystemAccessLock(true);
    } catch (settingsError) {
      console.error('System access lock setting lookup failed:', settingsError);
      return res.status(503).json({
        success: false,
        code: 'SYSTEM_ACCESS_STATUS_UNAVAILABLE',
        message: 'Unable to verify system access. Please try again later.',
      });
    }
    if (systemAccessLock.isSystemLocked && !isSystemAdminRole(user.role)) {
      return res.status(503).json({
        success: false,
        code: 'SYSTEM_ACCESS_LOCKED',
        message: systemAccessLock.lockReason,
      });
    }

    let securityControls;
    try {
      securityControls = await getSecurityControlSettings(true);
    } catch (settingsError) {
      console.warn('System lock setting lookup failed; continuing login:', settingsError.message);
    }
    const isSystemAdmin = isSystemAdminRole(user.role);
    if (securityControls?.maintenanceModeEnabled && !isSystemAdmin) {
      return res.status(503).json({
        success: false,
        code: 'MAINTENANCE_MODE',
        message: 'The system is temporarily unavailable for scheduled maintenance.',
      });
    }
    if (securityControls?.systemLockEnabled && !isSystemAdmin) {
      return res.status(423).json({
        success: false,
        code: 'SYSTEM_LOCKED',
        message: 'The system is temporarily locked by the administrator. Please try again later.',
      });
    }

    const token = jwt.sign(
      {
        id: user.user_id,
        email: user.email,
        student_id: user.student_id || null,
        role: user.role,
        phone: user.phone_number,
        phone_number: user.phone_number,
        department_id: user.department_id,
        department_code: user.department_code,
        department_name: user.department_name,
      },
      process.env.JWT_SECRET || 'change-this-secret',
      { expiresIn: '8h' }
    );

    if (req.session) {
      req.session.user = {
        id: user.user_id,
        email: user.email,
        name: fullName,
        student_id: user.student_id,
        role: user.role,
      };
      req.session.token = token;
      req.session.security = {
        ipAddress: req.ip || req.socket?.remoteAddress || 'Unknown',
        userAgent: String(req.headers?.['user-agent'] || '').slice(0, 500),
        location: 'Unavailable',
        lastActivity: new Date().toISOString(),
      };
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: {
          id: user.user_id,
          email: user.email,
          role: user.role,
          isFirstLogin: Boolean(user.is_first_login || user.must_change_password),
          mustChangePassword: Boolean(user.must_change_password),
          name: fullName,
          first_name: user.first_name,
          last_name: user.last_name,
          gender: user.gender,
          phone_number: user.phone_number,
          profile_picture: user.profile_picture,
          department_id: user.department_id,
          student_id: user.student_id || null,
          username: user.email || user.student_id || null,
        },
      },
    });
  } catch (error) {
    console.error('DETAILED LOGIN ERROR:', error);
    if (isDatabaseConnectionError(error)) {
      return res.status(503).json({ success: false, message: databaseUnavailableMessage });
    }
    return res.status(500).json({
      success: false,
      message: 'Unable to complete login.',
    });
  }
};

const me = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'User not found or unauthenticated.' });
    }

    const [rows] = await pool.query(
      `SELECT
        u.id,
        u.email,
        u.role,
        u.status,
        u.is_first_login,
        u.must_change_password,
        u.created_at,
        COALESCE(NULLIF(u.first_name, ''), i.first_name, la.first_name, s.first_name, '') AS first_name,
        COALESCE(NULLIF(u.last_name, ''), i.last_name, la.last_name, s.last_name, '') AS last_name,
        COALESCE(i.gender, la.gender, s.gender) AS gender,
        COALESCE(i.phone_number, la.phone_number, s.phone_number) AS phone_number,
        COALESCE(i.profile_picture, la.profile_picture, s.profile_picture) AS profile_picture,
        COALESCE(i.department_id, la.department_id, s.department_id) AS department_id,
        d.name AS department_name,
        c.name AS college_name,
        s.student_id AS student_id
      FROM users u
      LEFT JOIN instructors i ON u.id = i.user_id
      LEFT JOIN lab_assistants la ON u.id = la.user_id
      LEFT JOIN students s ON u.id = s.user_id
      LEFT JOIN departments d ON d.id = COALESCE(i.department_id, la.department_id, s.department_id)
      LEFT JOIN colleges c ON c.id = d.college_id
      WHERE u.id = ? LIMIT 1`,
      [req.user.id]
    );

    if (!rows || !rows.length) {
      return res.status(401).json({ success: false, message: 'User not found or unauthenticated.' });
    }

    const user = rows[0];
    const displayIdentifier = user.email || user.student_id || `user-${user.id}`;

    return res.status(200).json({
      success: true,
      message: { en: 'User profile loaded.', am: 'የተጠቃሚ መገለጫ ተጭኗል።' },
      data: {
        id: user.id,
        username: displayIdentifier,
        email: user.email,
        role: user.role,
        status: user.status,
        isFirstLogin: Boolean(user.is_first_login || user.must_change_password),
        mustChangePassword: Boolean(user.must_change_password),
        gender: user.gender,
        created_at: user.created_at,
        department_id: user.department_id,
        department_name: user.department_name,
        college_name: user.college_name,
        first_name: user.first_name,
        last_name: user.last_name,
        student_id: user.student_id,
        phone_number: user.phone_number,
        profile_picture: user.profile_picture,
      },
    });
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    const errorMessage = error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_TABLE_ERROR'
      ? 'User profile is temporarily unavailable.'
      : 'Unable to load profile.';
    return res.status(error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT' ? 503 : 500).json({
      success: false,
      message: errorMessage,
    });
  }
};

const normalizeGenderValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'male';
  if (normalized === 'male' || normalized === 'm') return 'male';
  if (normalized === 'female' || normalized === 'f') return 'female';
  return 'male';
};

const buildValidationErrors = (fieldErrors) => fieldErrors.map(({ field, message }) => ({
  type: 'field',
  value: undefined,
  msg: message,
  path: field,
  location: 'body',
}));

const getDepartmentIdFromPayload = async (payload) => {
  const rawDepartment = payload?.department_id ?? payload?.departmentId ?? payload?.department ?? payload?.department_name ?? payload?.departmentName ?? payload?.departmentValue ?? '';
  if (rawDepartment === null || rawDepartment === undefined || rawDepartment === '') return null;

  const normalized = String(rawDepartment).trim();
  const numericDepartmentId = Number(normalized);
  if (Number.isInteger(numericDepartmentId) && numericDepartmentId > 0) return numericDepartmentId;

  const [rows] = await pool.query(
    `SELECT id FROM departments WHERE LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?) LIMIT 1`,
    [normalized, normalized]
  );

  return rows?.[0]?.id ?? null;
};

const normalizeInstructorPayload = (body = {}) => {
  const firstName = String(body?.first_name ?? body?.firstName ?? '').trim();
  const lastName = String(body?.last_name ?? body?.lastName ?? '').trim();
  const fullName = String(body?.full_name ?? [firstName, lastName].filter(Boolean).join(' ')).trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = typeof body?.password === 'string' ? body.password : '';
  const employeeId = String(body?.employee_id ?? body?.employeeId ?? body?.employeeID ?? '').trim();
  const gender = normalizeGenderValue(body?.gender ?? body?.sex ?? 'male');
  const departmentId = body?.department_id ?? body?.departmentId ?? body?.department ?? body?.department_name ?? body?.departmentName ?? '';

  return {
    firstName,
    lastName,
    fullName,
    email,
    password,
    employee_id: employeeId,
    employeeId,
    gender,
    department_id: departmentId,
    departmentId,
    departmentValue: departmentId,
  };
};

const buildDefaultInstructorPassword = (employeeId = '') => {
  const resolvedEmployeeId = String(employeeId || '').trim();
  return resolvedEmployeeId ? `${resolvedEmployeeId}@123` : '12345678';
};

const formatValidationMessage = (validationErrors = []) => validationErrors
  .map((entry) => `${entry.field || 'field'}: ${entry.message || 'Invalid value'}`)
  .join(', ');

const registerInstructor = async (req, res) => {
  const payload = normalizeInstructorPayload(req.body);
  const fallbackPassword = buildDefaultInstructorPassword(payload.employeeId || payload.employee_id);
  payload.password = typeof req.body?.password === 'string' && req.body.password.trim()
    ? req.body.password.trim()
    : fallbackPassword;
  payload.gender = normalizeGenderValue(payload.gender || req.body?.sex || 'male');
  const validationErrors = [];
  if (!payload.fullName) validationErrors.push({ field: 'full_name', message: 'Full name is required.' });
  if (!payload.firstName) validationErrors.push({ field: 'first_name', message: 'First name is required.' });
  if (!payload.lastName) validationErrors.push({ field: 'last_name', message: 'Last name is required.' });
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) validationErrors.push({ field: 'email', message: 'A valid email is required.' });
  if (!payload.password || payload.password.length < 8) validationErrors.push({ field: 'password', message: 'Password must be at least 8 characters.' });
  if (!payload.employeeId) validationErrors.push({ field: 'employee_id', message: 'Employee ID is required.' });
  if (!['male', 'female'].includes(payload.gender)) validationErrors.push({ field: 'gender', message: 'Gender is required.' });

  let departmentId = null;
  if (!validationErrors.some((error) => error.field === 'department_id')) {
    try {
      departmentId = await getDepartmentIdFromPayload(payload);
      if (!Number.isInteger(departmentId) || departmentId <= 0) {
        validationErrors.push({ field: 'department_id', message: 'A valid department is required.' });
      } else {
        const [[department]] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [departmentId]);
        if (!department) {
          validationErrors.push({ field: 'department_id', message: 'The selected department does not exist.' });
        }
      }
    } catch (error) {
      console.error('Unable to resolve department id for instructor registration:', error);
      validationErrors.push({ field: 'department_id', message: 'Unable to validate the selected department.' });
    }
  }

  if (validationErrors.length) {
    return res.status(400).json({
      success: false,
      message: formatValidationMessage(validationErrors),
      errors: buildValidationErrors(validationErrors),
    });
  }

  const nameParts = payload.fullName.split(/\s+/);
  const firstName = nameParts.shift();
  const lastName = nameParts.join(' ') || firstName;
  let connection;

  try {
    const passwordHash = await bcrypt.hash('12345678', 12);
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [[department]] = await connection.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [departmentId]);
    if (!department) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        errors: buildValidationErrors([{ field: 'department_id', message: 'The selected department does not exist.' }]),
      });
    }

    const [[existingEmail]] = await connection.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [payload.email]);
    if (existingEmail) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Email already exists.' });
    }
    const [[existingEmployee]] = await connection.query('SELECT id FROM instructors WHERE employee_id = ? LIMIT 1', [payload.employeeId]);
    if (existingEmployee) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Employee ID already exists.' });
    }

    const [userResult] = await connection.query(
      `INSERT INTO users (email, password_hash, role, status, is_first_login, must_change_password, gender)
         VALUES (?, ?, 'instructor', 'active', 1, 1, ?)`,
      [payload.email, passwordHash, payload.gender]
    );
    const [profileResult] = await connection.query(
      `INSERT INTO instructors (user_id, employee_id, first_name, last_name, department_id, gender)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userResult.insertId, payload.employeeId, firstName, lastName, departmentId, payload.gender]
    );
    await connection.commit();

    return res.status(201).json({
      success: true,
      message: 'Instructor registered successfully.',
      data: { id: userResult.insertId, instructor_id: profileResult.insertId, email: payload.email, employee_id: payload.employeeId },
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) { console.error('Instructor registration rollback failed:', rollbackError); }
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      const duplicateField = String(error.sqlMessage || '').toLowerCase().includes('employee') ? 'Employee ID' : 'Email';
      return res.status(409).json({ success: false, message: `${duplicateField} already exists.` });
    }
    console.error('Instructor registration failed:', { code: error?.code, message: error?.message });
    return res.status(500).json({ success: false, message: 'Unable to register instructor. Please try again later.' });
  } finally {
    if (connection) connection.release();
  }
};

const registerLabAssistant = async (req, res) => {
  const fullName = String(req.body?.full_name || [req.body?.first_name, req.body?.last_name].filter(Boolean).join(' ')).trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const employeeId = String(req.body?.employee_id || '').trim();
  const departmentId = Number(req.body?.department_id);
  const gender = normalizeGenderValue(req.body?.gender ?? req.body?.sex ?? 'male');

  const errors = {};
  if (!fullName) errors.full_name = 'Full name is required.';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'A valid email is required.';
  if (!Number.isInteger(departmentId) || departmentId <= 0) errors.department_id = 'A valid department is required.';
  if (!employeeId) errors.employee_id = 'Employee ID is required.';
  if (!gender || !['male', 'female'].includes(gender)) errors.gender = 'Gender is required.';
  if (Object.keys(errors).length) return res.status(400).json({ success: false, message: 'Validation failed.', errors });

  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts.shift();
  const lastName = nameParts.join(' ') || firstName;
  let connection;

  try {
    const passwordHash = await bcrypt.hash('12345678', 12);
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [[department]] = await connection.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [departmentId]);
    if (!department) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'The selected department does not exist.' });
    }

    const [[existingEmail]] = await connection.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);
    if (existingEmail) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Email already exists.' });
    }

    const [[existingEmployee]] = await connection.query('SELECT id FROM lab_assistants WHERE employee_id = ? LIMIT 1', [employeeId]);
    if (existingEmployee) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Employee ID already exists.' });
    }

    const [userResult] = await connection.query(
      `INSERT INTO users (email, password_hash, role, status, is_first_login, must_change_password, gender)
       VALUES (?, ?, 'lab_assistant', 'active', 1, 1, ?)`,
      [email, passwordHash, gender]
    );
    const [profileResult] = await connection.query(
      `INSERT INTO lab_assistants (user_id, employee_id, first_name, last_name, email, department_id, gender, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [userResult.insertId, employeeId, firstName, lastName, email, departmentId, gender]
    );
    await connection.commit();

    return res.status(201).json({
      success: true,
      message: 'Lab assistant registered successfully.',
      data: { id: userResult.insertId, lab_assistant_id: profileResult.insertId, email, employee_id: employeeId },
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackError) { console.error('Lab assistant registration rollback failed:', rollbackError); }
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      const duplicateField = String(error.sqlMessage || '').toLowerCase().includes('employee') ? 'Employee ID' : 'Email';
      return res.status(409).json({ success: false, message: `${duplicateField} already exists.` });
    }
    console.error('Lab assistant registration failed:', { code: error?.code, message: error?.message });
    return res.status(500).json({ success: false, message: 'Unable to register lab assistant. Please try again later.' });
  } finally {
    if (connection) connection.release();
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    const currentPassword = typeof req.body?.currentPassword === 'string'
      ? req.body.currentPassword.trim()
      : '';
    const newPassword = typeof req.body?.newPassword === 'string'
      ? req.body.newPassword.trim()
      : '';
    const confirmPassword = typeof req.body?.confirmPassword === 'string'
      ? req.body.confirmPassword.trim()
      : '';

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ success: false, message: 'Authentication failed. Please log in again.' });
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Current password, new password, and confirm password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirm password do not match.' });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from the current password.' });
    }

    const [[user]] = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.role, s.student_id
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = ?, is_first_login = 0, must_change_password = 0 WHERE id = ?', [passwordHash, userId]);

    const identifier = user.email || user.student_id || `user-${user.id}`;
    const role = req.user.role || user.role;
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        student_id: user.student_id || null,
        role,
        isFirstLogin: false,
          mustChangePassword: false,
      },
      process.env.JWT_SECRET || 'change-this-secret',
      { expiresIn: '8h' }
    );

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
      data: {
        token,
        user: {
          id: user.id,
          username: identifier,
          email: user.email,
          student_id: user.student_id || null,
          role,
          isFirstLogin: false,
          mustChangePassword: false,
        },
      },
    });
  } catch (error) {
    console.error('Change password failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to change password.' });
  }
};

const logout = (req, res) => {
  try {
    if (req.session && typeof req.session.destroy === 'function') {
      req.session.destroy((err) => {
        if (err) {
          console.error('Logout session destroy error:', err);
        }
      });
    }

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.clearCookie('connect.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout Error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Logout failed.' });
  }
};

module.exports = {
  login,
  me,
  registerInstructor,
  registerLabAssistant,
  changePassword,
  logout,
  forgotPassword,
  resetPassword,
};
