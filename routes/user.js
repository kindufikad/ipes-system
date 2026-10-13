const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { me } = require('../controllers/authController');
const { normalizeProfilePhone } = require('../utils/phoneNumber');

const router = express.Router();
const uploadDirectory = path.join(__dirname, '..', 'uploads', 'profiles');
const legacyUploadDirectory = path.join(__dirname, '..', 'uploads', 'profile');
fs.mkdirSync(uploadDirectory, { recursive: true });
fs.mkdirSync(legacyUploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() || '.jpg';
    callback(null, `user-${req.user.id}-${Date.now()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype.startsWith('image/')) return callback(null, true);
    return callback(new Error('Only image files are allowed.'));
  },
});

const PROFILE_TABLE_BY_ROLE = {
  student: 'students',
  instructor: 'instructors',
  dept_head: 'instructors',
  department_head: 'instructors',
  dean: 'instructors',
  college_dean: 'instructors',
  academic_director: 'instructors',
  academic_directorate: 'instructors',
  academic_vice_president: 'instructors',
  directorate: 'instructors',
  lab_assistant: 'lab_assistants',
};

const getProfileTarget = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const table = PROFILE_TABLE_BY_ROLE[normalizedRole] || 'users';
  return { table, userIdColumn: table === 'users' ? 'id' : 'user_id' };
};

const updateProfileFields = async (role, userId, fields, values) => {
  const { table, userIdColumn } = getProfileTarget(role);
  const [result] = await pool.query(
    `UPDATE ${table} SET ${fields.join(', ')} WHERE ${userIdColumn} = ?`,
    [...values, userId]
  );
  if (result.affectedRows > 0) return true;

  const [rows] = await pool.query(
    `SELECT 1 FROM ${table} WHERE ${userIdColumn} = ? LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
};

const acceptProfilePhoto = (req, res, next) => {
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'profile_picture', maxCount: 1 },
  ])(req, res, (error) => {
    if (error) {
      return res.status(400).json({ success: false, message: error.message || 'Unable to process profile photo.' });
    }
    req.file = req.files?.profile_picture?.[0] || req.files?.photo?.[0] || null;
    return next();
  });
};

const updateProfile = async (req, res) => {
  const rawPhone = req.body.phone_number ?? req.body.phone;
  let phone;
  if (rawPhone !== undefined) {
    try {
      phone = normalizeProfilePhone(rawPhone);
    } catch (error) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, message: error.message });
    }
  }
  const profilePicture = req.file ? `/uploads/profiles/${req.file.filename}` : undefined;
  const fields = [];
  const values = [];

  if (phone !== undefined) {
    fields.push('phone_number = ?');
    values.push(phone);
  }
  if (profilePicture) {
    fields.push('profile_picture = ?');
    values.push(profilePicture);
  }
  if (fields.length === 0) {
    return res.status(400).json({ success: false, message: 'Provide a phone number or profile photo to update.' });
  }

  try {
    const profileExists = await updateProfileFields(req.user.role, req.user.id, fields, values);
    if (!profileExists) {
      return res.status(404).json({ success: false, message: 'User profile was not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        phone: phone === undefined ? undefined : phone,
        phone_number: phone === undefined ? undefined : phone,
        profile_picture: profilePicture,
        profile_photo: profilePicture,
      },
    });
  } catch (error) {
    console.error('Unable to update user profile:', error);
    return res.status(500).json({ success: false, message: 'Unable to update profile.' });
  }
};

const handleProfilePhotoUpdate = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'A profile photo is required.' });
  }

  const profilePicture = `/uploads/profiles/${req.file.filename}`;
  const isSystemAdmin = ['admin', 'systemadmin', 'system_admin'].includes(String(req.user.role || '').trim().toLowerCase());
  let connection;
  let transactionStarted = false;

  try {
    if (isSystemAdmin) {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;
      await connection.query(
        `INSERT INTO system_admin_profiles (user_id, profile_picture)
         VALUES (?, ?) ON DUPLICATE KEY UPDATE profile_picture = VALUES(profile_picture), updated_at = CURRENT_TIMESTAMP`,
        [req.user.id, profilePicture]
      );
      const [result] = await connection.query(
        "UPDATE users SET profile_picture = ? WHERE id = ? AND LOWER(role) IN ('admin', 'systemadmin', 'system_admin')",
        [profilePicture, req.user.id]
      );
      if (!result.affectedRows) {
        await connection.rollback();
        transactionStarted = false;
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ success: false, message: 'User profile was not found.' });
      }
      await connection.query(
        `INSERT INTO audit_logs
          (action_title, description, performed_by, ip_address, actor_user_id, actor_email, actor_role, category, target_details, route_path, http_method, status_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'System Admin Profile Picture Updated',
          'Admin profile picture updated',
          req.user.email || String(req.user.id),
          req.ip || null,
          req.user.id,
          req.user.email || null,
          'admin',
          'profile',
          JSON.stringify({ user_id: req.user.id, profile_picture: profilePicture }),
          req.originalUrl || '/api/users/profile-picture',
          req.method || 'POST',
          200,
        ]
      );
      await connection.commit();
      transactionStarted = false;
    } else {
      const profileExists = await updateProfileFields(req.user.role, req.user.id, ['profile_picture = ?'], [profilePicture]);
      if (!profileExists) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ success: false, message: 'User profile was not found.' });
      }
    }
    return res.status(200).json({
      success: true,
      message: 'Profile photo updated successfully.',
      user: { profile_picture: profilePicture, profile_photo: profilePicture },
      profile_picture: profilePicture,
      profile_photo: profilePicture,
    });
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {});
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('Unable to update user profile photo:', error);
    return res.status(500).json({ success: false, message: 'Unable to update profile photo.' });
  } finally {
    connection?.release();
  }
};

router.post('/profile-photo', authenticateToken, acceptProfilePhoto, handleProfilePhotoUpdate);
router.put('/profile-photo', authenticateToken, acceptProfilePhoto, handleProfilePhotoUpdate);
router.post('/profile-picture', authenticateToken, acceptProfilePhoto, handleProfilePhotoUpdate);
router.put('/profile', authenticateToken, acceptProfilePhoto, updateProfile);
router.get('/', authenticateToken, me);
router.post('/', authenticateToken, acceptProfilePhoto, handleProfilePhotoUpdate);

module.exports = router;