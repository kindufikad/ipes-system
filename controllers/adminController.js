const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { getSystemHealthSnapshot, triggerDatabaseBackup } = require('../middleware/systemHealth');
const { SYSTEM_ADMIN_CONFLICT_MESSAGE, getActiveSystemAdmin, isActiveSystemAdminUniqueError, isSystemAdminRole } = require('../utils/systemAdminPolicy');
const { getInstitutionalEvaluationMetrics } = require('./aiInsightsController');
const { ASSET_KEYS, getLandingPageSettings, saveLandingPageSettings } = require('../services/landingPageSettings');
const { updateSecurityControlSettings } = require('../services/securityControlService');
const DEFAULT_USER_PASSWORD = '12345678';

const landingSettingKeys = new Set(['home_hero_images', 'about_page_image', 'system_logo', 'university_logo']);
const contactSettingKeys = new Set(['contact_email', 'contact_phone', 'contact_office_hours']);

const updateAdminProfile = async (req, res) => {
  const adminId = Number(req.user?.id);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const firstName = String(req.body?.firstName ?? req.body?.first_name ?? '').trim();
  const lastName = String(req.body?.lastName ?? req.body?.last_name ?? '').trim();
  if (!Number.isInteger(adminId) || adminId <= 0) return res.status(401).json({ success: false, message: 'Authentication is required.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || !firstName || !lastName || firstName.length > 128 || lastName.length > 128) {
    return res.status(400).json({ success: false, message: 'A valid email, first name, and last name are required.' });
  }

  try {
    const [[admin]] = await pool.query(
      `SELECT id FROM users WHERE id = ? AND LOWER(role) IN ('admin', 'systemadmin', 'system_admin')
       AND LOWER(COALESCE(status, 'active')) = 'active' LIMIT 1`,
      [adminId]
    );
    if (!admin) return res.status(404).json({ success: false, message: 'Active System Administrator account not found.' });

    const [[existing]] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [email, adminId]);
    if (existing) return res.status(409).json({ success: false, message: 'Email is already in use by another account.' });

    await pool.query(
      `UPDATE users SET email = ?, first_name = ?, last_name = ? WHERE id = ?`,
      [email, firstName, lastName, adminId]
    );
    return res.status(200).json({
      success: true,
      message: 'Admin details updated successfully.',
      user: { id: adminId, email, first_name: firstName, last_name: lastName, name: `${firstName} ${lastName}`.trim(), role: req.user.role },
    });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Email is already in use by another account.' });
    console.error('Unable to update System Admin profile:', error);
    return res.status(500).json({ success: false, message: 'Failed to update profile details.' });
  }
};

const normalizeCollegeDepartmentRows = (rows = []) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];

  return normalizedRows.map((college) => {
    const collegeId = college.college_id ?? college.id ?? null;
    const collegeName = college.college_name ?? college.name ?? 'Unassigned College';
    const collegeCode = college.college_code ?? college.code ?? '';
    const collegeStatus = String(college.college_status ?? college.status ?? 'active').trim() || 'active';

    let departments = [];
    const rawDepartments = college.departments;
    if (Array.isArray(rawDepartments)) {
      departments = rawDepartments;
    } else if (typeof rawDepartments === 'string') {
      try {
        departments = JSON.parse(rawDepartments);
      } catch (_error) {
        departments = [];
      }
    }

    return {
      id: collegeId,
      college_id: collegeId,
      name: collegeName,
      college_name: collegeName,
      code: collegeCode,
      college_code: collegeCode,
      status: collegeStatus,
      college_status: collegeStatus,
      departments: Array.isArray(departments) ? departments.map((department) => ({
        ...department,
        id: department.dept_id ?? department.id ?? null,
        dept_id: department.dept_id ?? department.id ?? null,
        name: department.dept_name ?? department.name ?? department.department_name ?? 'Department',
        department_name: department.dept_name ?? department.name ?? department.department_name ?? 'Department',
        code: department.dept_code ?? department.code ?? department.department_code ?? '',
        department_code: department.dept_code ?? department.code ?? department.department_code ?? '',
        status: String(department.dept_status ?? department.status ?? 'active').trim() || 'active',
        dept_status: String(department.dept_status ?? department.status ?? 'active').trim() || 'active',
      })) : [],
    };
  });
};

const getContactSettings = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT setting_key, setting_value, updated_at
      FROM system_settings
      WHERE setting_key IN ('contact_email', 'contact_phone', 'contact_office_hours', 'office_hours')
    `);
    const values = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
    return res.json({ success: true, data: {
      contact_email: values.contact_email || '',
      contact_phone: values.contact_phone || '',
      contact_office_hours: values.contact_office_hours || values.office_hours || '',
    } });
  } catch (error) {
    console.error('Unable to retrieve contact settings:', error);
    return res.status(500).json({ success: false, message: 'Unable to retrieve contact settings.' });
  }
};

const updateContactSetting = async (req, res) => {
  const settingKey = String(req.params.key || '').trim();
  if (!contactSettingKeys.has(settingKey)) {
    return res.status(400).json({ success: false, message: 'Unsupported contact setting.' });
  }
  const settingValue = String(req.body?.value || '').trim();
  if (!settingValue) {
    return res.status(400).json({ success: false, message: 'Contact setting value cannot be empty.' });
  }
  if (settingKey === 'contact_email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settingValue)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid contact email.' });
  }
  try {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [settingKey, settingValue]
    );
    return res.json({ success: true, data: { setting_key: settingKey, setting_value: settingValue } });
  } catch (error) {
    console.error('Unable to update contact setting:', error);
    return res.status(500).json({ success: false, message: 'Unable to save contact setting.' });
  }
};

const getLandingContentAdmin = async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT setting_key, setting_value, updated_at
      FROM system_settings
      WHERE setting_key IN ('home_hero_images', 'about_page_image', 'system_logo', 'university_logo')
    `);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Unable to retrieve landing content settings:', error);
    return res.status(500).json({ success: false, message: 'Unable to retrieve landing page settings.' });
  }
};

const updateLandingContent = async (req, res) => {
  const settingKey = String(req.params.key || '').trim();
  if (!landingSettingKeys.has(settingKey)) {
    return res.status(400).json({ success: false, message: 'Unsupported landing page setting.' });
  }

  const uploadedPaths = (req.files || (req.file ? [req.file] : [])).map((file) => `/uploads/landing/${file.filename}`);
  let settingValue = uploadedPaths[0] || null;
  if (settingKey === 'home_hero_images' && uploadedPaths.length) {
    const [[existing]] = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = ?', [settingKey]);
    let existingImages = [];
    try {
      existingImages = JSON.parse(existing?.setting_value || '[]');
    } catch (_error) {
      existingImages = [];
    }
    settingValue = JSON.stringify([...existingImages, ...uploadedPaths]);
  } else if (!uploadedPaths.length && settingKey === 'home_hero_images') {
    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    if (images.some((image) => typeof image !== 'string' || !image.startsWith('/uploads/landing/'))) {
      return res.status(400).json({ success: false, message: 'Hero images must be managed upload URLs.' });
    }
    settingValue = JSON.stringify(images);
  }
  if (!settingValue) {
    return res.status(400).json({ success: false, message: 'An image file or valid image list is required.' });
  }

  try {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [settingKey, settingValue]
    );
    return res.json({ success: true, data: { setting_key: settingKey, setting_value: settingValue } });
  } catch (error) {
    uploadedPaths.forEach((uploadedPath) => fs.unlink(path.join(__dirname, '..', uploadedPath.replace(/^\//, '')), () => {}));
    console.error('Unable to update landing content setting:', error);
    return res.status(500).json({ success: false, message: 'Unable to save landing page image.' });
  }
};

const deleteLandingContent = async (req, res) => {
  const settingKey = String(req.params.key || '').trim();
  if (!landingSettingKeys.has(settingKey)) {
    return res.status(400).json({ success: false, message: 'Unsupported landing page setting.' });
  }
  try {
    const [rows] = await pool.query('SELECT setting_value FROM system_settings WHERE setting_key = ?', [settingKey]);
    await pool.query('DELETE FROM system_settings WHERE setting_key = ?', [settingKey]);
    const value = rows[0]?.setting_value;
    const files = settingKey === 'home_hero_images' ? JSON.parse(value || '[]') : [value];
    files.filter((file) => typeof file === 'string' && file.startsWith('/uploads/landing/')).forEach((file) => {
      fs.unlink(path.join(__dirname, '..', file.replace(/^\//, '')), () => {});
    });
    return res.json({ success: true, data: { setting_key: settingKey } });
  } catch (error) {
    console.error('Unable to delete landing content setting:', error);
    return res.status(500).json({ success: false, message: 'Unable to remove landing page image.' });
  }
};

const makeLandingAnnouncement = (announcement = {}) => ({
  id: String(announcement.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  title_en: String(announcement.title_en || '').trim().slice(0, 180),
  title_am: String(announcement.title_am || '').trim().slice(0, 180),
  message_en: String(announcement.message_en || '').trim().slice(0, 2000),
  message_am: String(announcement.message_am || '').trim().slice(0, 2000),
  active: announcement.active !== false,
  updated_at: new Date().toISOString(),
});

const getLandingPageSettingsAdmin = async (_req, res) => {
  try {
    const settings = await getLandingPageSettings();
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Unable to retrieve landing page settings:', error);
    return res.status(500).json({ success: false, message: 'Unable to retrieve landing page settings.' });
  }
};

const createLandingPageSetting = async (req, res) => {
  const uploadedFiles = req.files || (req.file ? [req.file] : []);
  try {
    const settings = await getLandingPageSettings();
    if (uploadedFiles.length) {
      const settingKey = String(req.body?.key || '').trim();
      if (!ASSET_KEYS.includes(settingKey)) {
        uploadedFiles.forEach((file) => fs.unlink(file.path, () => {}));
        return res.status(400).json({ success: false, message: 'Unsupported landing page asset.' });
      }
      const uploadedPaths = uploadedFiles.map((file) => `/uploads/landing/${file.filename}`);
      const previousAssets = settingKey === 'home_hero_images'
        ? []
        : [settings.assets[settingKey]].filter(Boolean);
      settings.assets[settingKey] = settingKey === 'home_hero_images'
        ? [...settings.assets.home_hero_images, ...uploadedPaths]
        : uploadedPaths[uploadedPaths.length - 1];
      await saveLandingPageSettings(settings);
      previousAssets.filter((asset) => asset.startsWith('/uploads/landing/')).forEach((asset) => {
        fs.unlink(path.join(__dirname, '..', asset.slice(1)), () => {});
      });
      return res.status(201).json({ success: true, data: settings });
    }

    const announcement = makeLandingAnnouncement(req.body?.announcement);
    if (!announcement.title_en && !announcement.title_am) {
      return res.status(400).json({ success: false, message: 'An announcement title is required.' });
    }
    settings.announcements = [...settings.announcements, announcement];
    await saveLandingPageSettings(settings);
    return res.status(201).json({ success: true, data: settings, announcement });
  } catch (error) {
    uploadedFiles.forEach((file) => fs.unlink(file.path, () => {}));
    console.error('Unable to create landing page content:', error);
    return res.status(500).json({ success: false, message: 'Unable to create landing page content.' });
  }
};

const updateLandingPageSettings = async (req, res) => {
  try {
    const current = await getLandingPageSettings();
    const patch = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : req.body;
    const settings = {
      ...current,
      ...patch,
      assets: { ...current.assets, ...(patch.assets || {}) },
      contact: { ...current.contact, ...(patch.contact || {}) },
      vision: { ...current.vision, ...(patch.vision || {}) },
      mission: { ...current.mission, ...(patch.mission || {}) },
      objectives: { ...current.objectives, ...(patch.objectives || {}) },
      social_links: { ...current.social_links, ...(patch.social_links || {}) },
      announcements: Array.isArray(patch.announcements)
        ? patch.announcements.map((announcement) => makeLandingAnnouncement(announcement))
        : current.announcements,
    };

    if (settings.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.contact.email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid contact email.' });
    }
    const hasUnsafeSocialUrl = Object.values(settings.social_links).some((value) => {
      if (typeof value !== 'string') return true;
      if (!value.trim()) return false;
      try {
        return !['http:', 'https:'].includes(new URL(value).protocol);
      } catch (_error) {
        return true;
      }
    });
    if (hasUnsafeSocialUrl) {
      return res.status(400).json({ success: false, message: 'Social links must use a valid HTTP or HTTPS URL.' });
    }
    for (const field of ['en', 'am']) {
      if (typeof settings.vision[field] !== 'string' || typeof settings.mission[field] !== 'string') {
        return res.status(400).json({ success: false, message: 'Vision and mission text must be strings.' });
      }
      if (!Array.isArray(settings.objectives[field]) || settings.objectives[field].some((item) => typeof item !== 'string')) {
        return res.status(400).json({ success: false, message: 'Objectives must be lists of text.' });
      }
    }

    const savedSettings = await saveLandingPageSettings(settings);
    return res.status(200).json({ success: true, data: savedSettings });
  } catch (error) {
    console.error('Unable to update landing page settings:', error);
    return res.status(500).json({ success: false, message: 'Unable to update landing page settings.' });
  }
};

const deleteLandingPageSetting = async (req, res) => {
  try {
    const settings = await getLandingPageSettings();
    const key = String(req.body?.key || '').trim();
    const filesToRemove = [];

    if (key === 'announcements') {
      const id = String(req.body?.id || '');
      if (!id) return res.status(400).json({ success: false, message: 'An announcement ID is required.' });
      settings.announcements = settings.announcements.filter((announcement) => String(announcement.id) !== id);
    } else if (ASSET_KEYS.includes(key)) {
      const hasIndex = req.body?.index !== undefined && req.body?.index !== null && req.body?.index !== '';
      if (key === 'home_hero_images' && hasIndex) {
        const index = Number(req.body.index);
        if (!Number.isInteger(index) || index < 0 || index >= settings.assets.home_hero_images.length) {
          return res.status(400).json({ success: false, message: 'A valid hero image index is required.' });
        }
        const [removed] = settings.assets.home_hero_images.splice(index, 1);
        if (removed) filesToRemove.push(removed);
      } else if (key === 'home_hero_images') {
        filesToRemove.push(...settings.assets.home_hero_images);
        settings.assets.home_hero_images = [];
      } else {
        filesToRemove.push(settings.assets[key]);
        settings.assets[key] = null;
      }
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported landing page content.' });
    }

    const savedSettings = await saveLandingPageSettings(settings);
    filesToRemove.filter((file) => typeof file === 'string' && file.startsWith('/uploads/landing/')).forEach((file) => {
      fs.unlink(path.join(__dirname, '..', file.slice(1)), () => {});
    });
    return res.status(200).json({ success: true, data: savedSettings });
  } catch (error) {
    console.error('Unable to delete landing page content:', error);
    return res.status(500).json({ success: false, message: 'Unable to delete landing page content.' });
  }
};

const tableExists = async (tableName) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS tableCount
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.tableCount || 0) > 0;
};

const getAdminDashboardStats = async (req, res) => {
  try {
    const hasPublishedEvaluations = await tableExists('published_evaluations');
    const hasSecurityLog = await tableExists('security_logs');
    const upcomingEventsQuery = hasPublishedEvaluations
      ? "SELECT COUNT(*) AS upcomingEvents FROM published_evaluations WHERE status = 'active'"
      : "SELECT COUNT(*) AS upcomingEvents FROM evaluation_dispatches WHERE status = 'pending'";
    const securityPulseQuery = hasSecurityLog
      ? "SELECT COUNT(*) AS securityPulse FROM security_logs WHERE status IN ('flagged', 'pending', 'open')"
      : "SELECT COUNT(*) AS securityPulse FROM users WHERE LOWER(COALESCE(status, 'active')) <> 'active'";
    const [[userRows], [collegeRows], [departmentRows], [upcomingRows], [broadcastRows], [securityRows], [headRows]] = await Promise.all([
      pool.query(`SELECT COUNT(DISTINCT u.id) AS totalUsers,
        COUNT(DISTINCT CASE WHEN LOWER(u.role) = 'instructor' THEN u.id END) AS instructors,
        COUNT(DISTINCT CASE WHEN LOWER(u.role) IN ('dept_head', 'department_head', 'head') THEN u.id END) AS departmentHeads,
        COUNT(DISTINCT CASE WHEN LOWER(u.role) IN ('college_dean', 'dean') THEN u.id END) AS deans,
        COUNT(DISTINCT CASE WHEN LOWER(u.role) = 'student' THEN u.id END) AS students,
        COUNT(DISTINCT CASE WHEN LOWER(u.role) IN ('admin', 'systemadmin', 'system_admin') AND u.active_system_admin_slot = 1 THEN u.id END) AS systemAdministrators,
        COUNT(DISTINCT CASE WHEN LOWER(u.role) IN ('academic_directorate', 'academic_director', 'directorate') THEN u.id END) AS academicDirectorate,
        COUNT(DISTINCT CASE WHEN LOWER(u.role) = 'academic_vice_president' THEN u.id END) AS academicVicePresidents,
        COUNT(DISTINCT CASE WHEN LOWER(u.role) = 'lab_assistant' THEN u.id END) AS labAssistants
        FROM users u
        WHERE LOWER(COALESCE(u.status, 'active')) = 'active'`),
      pool.query('SELECT COUNT(*) AS totalColleges FROM colleges'),
      pool.query('SELECT COUNT(*) AS activeDepartments FROM departments'),
      pool.query(upcomingEventsQuery),
      pool.query('SELECT COUNT(*) AS totalBroadcasts FROM evaluation_dispatches'),
      pool.query(securityPulseQuery),
      pool.query("SELECT COUNT(*) AS registeredHeads FROM users WHERE role = 'dept_head' AND status = 'active'"),
    ]);
    const evaluationMetrics = await getInstitutionalEvaluationMetrics();
    const activeSessions = await new Promise((resolve) => {
      const sessionStore = req.app?.get('sessionStore');
      if (typeof sessionStore?.all !== 'function') return resolve(null);
      sessionStore.all((error, sessions) => {
        if (error) return resolve(null);
        const sessionRows = Array.isArray(sessions) ? sessions : Object.values(sessions || {});
        const now = Date.now();
        resolve(sessionRows.filter((sessionRecord) => {
          if (!sessionRecord?.user) return false;
          const expiresAt = sessionRecord.cookie?.expires ? new Date(sessionRecord.cookie.expires).getTime() : null;
          return expiresAt === null || !Number.isFinite(expiresAt) || expiresAt > now;
        }).length);
      });
    });

    const userStats = userRows[0] || {};
    const roleCounts = {
      instructors: Number(userStats.instructors || 0),
      departmentHeads: Number(userStats.departmentHeads || 0),
      deans: Number(userStats.deans || 0),
      students: Number(userStats.students || 0),
      systemAdministrators: Number(userStats.systemAdministrators || 0),
      academicDirectorate: Number(userStats.academicDirectorate || 0),
      academicVicePresidents: Number(userStats.academicVicePresidents || 0),
      labAssistants: Number(userStats.labAssistants || 0),
    };
    const totalUsers = Object.values(roleCounts).reduce((sum, count) => sum + count, 0);

    return res.json({
      success: true,
      message: { en: 'Admin dashboard statistics retrieved successfully.', am: 'የአስተዳዳሪ ዳሽቦርድ ስታቲስቲክስ በተሳካ ሁኔታ ተገኝቷል።' },
      data: {
        upcomingEvents: Number(upcomingRows[0][0]?.upcomingEvents || 0),
        totalBroadcasts: Number(broadcastRows[0][0]?.totalBroadcasts || 0),
        securityPulse: Number(securityRows[0][0]?.securityPulse || 0),
        registeredHeads: Number(headRows[0][0]?.registeredHeads || 0),
        totalUsers,
        usersByRole: roleCounts,
        totalColleges: Number(collegeRows[0]?.totalColleges || 0),
        activeDepartments: Number(departmentRows[0]?.activeDepartments || 0),
        evaluationCompletionRate: Number(evaluationMetrics.completionRate || 0),
        activeSessions,
      },
    });
  } catch (error) {
    console.error('Unable to retrieve admin dashboard statistics:', error);
    return res.status(500).json({
      success: false,
      message: { en: 'Unable to retrieve admin dashboard statistics.', am: 'የአስተዳዳሪ ዳሽቦርድ ስታቲስቲክስን ማግኘት አልተቻለም።' },
      data: null,
    });
  }
};

const getDepartmentAnalytics = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        d.id AS department_id,
        d.name AS department,
        ROUND(COALESCE(AVG(ses.score), 0), 2) AS score
      FROM departments d
      LEFT JOIN course_assignments ca ON ca.department_id = d.id
      LEFT JOIN evaluation_dispatches ed ON ed.assignment_id = ca.id
      LEFT JOIN student_evaluation_submissions ses
        ON ses.dispatch_id = ed.id
        AND LOWER(TRIM(COALESCE(ses.status, 'submitted'))) = 'submitted'
      GROUP BY d.id, d.name
      ORDER BY d.name ASC
    `);

    return res.json({
      success: true,
      message: { en: 'Department analytics retrieved successfully.', am: 'የዲፓርትመንት ትንታኔ በተሳካ ሁኔታ ተገኝቷል።' },
      data: rows.map((row) => ({
        department: row.department,
        score: Number(row.score || 0),
      })),
    });
  } catch (error) {
    console.error('Unable to retrieve department analytics:', error);
    return res.status(500).json({
      success: false,
      message: { en: 'Unable to retrieve department analytics.', am: 'የዲፓርትመንት ትንታኔን ማግኘት አልተቻለም።' },
      data: null,
    });
  }
};

const getSecurityLogFilter = (query = {}) => {
  const conditions = [];
  const values = [];
  const search = String(query.search || '').trim().slice(0, 200);
  const category = String(query.category || 'ALL').trim().toLowerCase();
  const dateRange = String(query.dateRange || 'all').trim().toLowerCase();
  const legacyCategories = {
    authentication: "category IS NULL AND (action_title LIKE '%login%' OR action_title LIKE '%password%' OR action_title LIKE '%logout%') AND COALESCE(description, '') NOT LIKE '%Result: 4%' AND COALESCE(description, '') NOT LIKE '%Result: 5%'",
    course_assignment: "category IS NULL AND action_title LIKE '%assign%'",
    system_settings: "category IS NULL AND (action_title LIKE '%system lock%' OR action_title LIKE '%settings%' OR action_title LIKE '%backup%')",
    security_alert: "category IS NULL AND (COALESCE(description, '') LIKE '%Result: 4%' OR COALESCE(description, '') LIKE '%Result: 5%' OR action_title LIKE '%lock%')",
    data_modification: "category IS NULL AND action_title NOT LIKE '%login%' AND action_title NOT LIKE '%password%' AND action_title NOT LIKE '%logout%' AND action_title NOT LIKE '%assign%' AND action_title NOT LIKE '%system lock%' AND action_title NOT LIKE '%settings%' AND action_title NOT LIKE '%backup%' AND COALESCE(description, '') NOT LIKE '%Result: 4%' AND COALESCE(description, '') NOT LIKE '%Result: 5%'",
  };

  if (search) {
    const wildcard = `%${search}%`;
    conditions.push('(action_title LIKE ? OR description LIKE ? OR performed_by LIKE ? OR actor_email LIKE ? OR actor_role LIKE ? OR ip_address LIKE ? OR target_details LIKE ?)');
    values.push(wildcard, wildcard, wildcard, wildcard, wildcard, wildcard, wildcard);
  }
  if (legacyCategories[category]) {
    conditions.push(`(category = ? OR (${legacyCategories[category]}))`);
    values.push(category);
  }
  if (dateRange === 'today') conditions.push('created_at >= CURDATE()');
  if (dateRange === '7d') conditions.push('created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)');

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
};

const normalizeAuditLog = (row) => {
  const parsedStatus = Number(row.status_code || String(row.description || '').match(/Result:\s*(\d{3})/)?.[1] || 0);
  const action = row.action_title || 'System event';
  const category = row.category || (parsedStatus >= 400 ? 'security_alert' : /login|password|logout/i.test(action) ? 'authentication' : /assign/i.test(action) ? 'course_assignment' : /system lock|settings|backup/i.test(action) ? 'system_settings' : 'data_modification');
  const isWarning = parsedStatus === 423 || parsedStatus === 429 || (parsedStatus < 400 && /lock|warning/i.test(action));
  const status = isWarning ? 'WARNING' : parsedStatus >= 200 && parsedStatus < 300 ? 'SUCCESS' : parsedStatus >= 400 ? 'FAILED' : 'UNKNOWN';

  return {
    id: row.id,
    action,
    desc: row.description || '',
    user: row.performed_by || 'System',
    email: row.actor_email || (String(row.performed_by || '').includes('@') ? row.performed_by : ''),
    role: row.actor_role || 'Legacy / unknown',
    category,
    target: row.target_details || row.route_path || '--',
    route: row.route_path || '',
    method: row.http_method || '',
    ip: row.ip_address || 'N/A',
    time: row.created_at,
    statusCode: parsedStatus,
    status,
  };
};

const getSecurityLogs = async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query?.limit, 10) || 50));
    const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
    const offset = (page - 1) * limit;
    const { where, values } = getSecurityLogFilter(req.query);
    const [[auditRows], [filteredCountRows], [totalCountRows], [connectionRows], [settingRows]] = await Promise.all([
      pool.query(`
        SELECT id, action_title, description, performed_by, ip_address, actor_email, actor_role, category, target_details, route_path, http_method, status_code, created_at
        FROM audit_logs ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ?
        OFFSET ?
      `, [...values, limit, offset]),
      pool.query(`SELECT COUNT(*) AS total FROM audit_logs ${where}`, values),
      pool.query('SELECT COUNT(*) AS total FROM audit_logs'),
      pool.query("SHOW STATUS LIKE 'Threads_connected'"),
      pool.query(`
        SELECT setting_key, setting_value
        FROM system_settings WHERE setting_key IN ('last_backup', 'backup_retention_days', 'security_score', 'api_token', 'system_lock_enabled')
      `),
    ]);

    const settings = settingRows.reduce((result, row) => {
      result[row.setting_key] = row.setting_value;
      return result;
    }, {});

    return res.json({
      success: true,
      message: { en: 'Security logs retrieved successfully.', am: 'የደህንነት መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።' },
      data: {
        logs: auditRows.map(normalizeAuditLog),
        totalCount: Number(filteredCountRows[0]?.total || 0),
        capturedEvents: Number(totalCountRows[0]?.total || 0),
        page,
        pageSize: limit,
        database: {
          status: 'Online',
          connections: Number(connectionRows[0]?.Value || 0),
          lastBackup: settings.last_backup || '--',
          backupRetentionDays: Number(settings.backup_retention_days || 0),
          securityScore: Number.isFinite(Number.parseFloat(settings.security_score)) ? Number.parseFloat(settings.security_score) : null,
          securityStatus: settings.security_score ? 'Configured' : 'Not configured',
          apiToken: settings.api_token || '--',
          systemLockEnabled: String(settings.system_lock_enabled || '0') === '1',
        },
      },
    });
  } catch (error) {
    console.error('Unable to retrieve security logs:', error);
    return res.status(500).json({
      success: false,
      message: { en: 'Unable to retrieve security logs.', am: 'የደህንነት መዝገቦችን ማግኘት አልተቻለም።' },
      data: null,
    });
  }
};

const exportSecurityLogs = async (req, res) => {
  try {
    const { where, values } = getSecurityLogFilter(req.query);
    const [rows] = await pool.query(`
      SELECT id, action_title, description, performed_by, ip_address, actor_email, actor_role, category, target_details, route_path, http_method, status_code, created_at
      FROM audit_logs ${where}
      ORDER BY created_at DESC, id DESC
    `, values);
    const columns = ['Timestamp', 'User', 'Email', 'Role', 'Category', 'Action', 'Target details', 'IP address', 'Status code', 'Status', 'Method', 'Route'];
    const escapeCell = (value) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = [columns, ...rows.map((row) => {
      const log = normalizeAuditLog(row);
      return [log.time, log.user, log.email, log.role, log.category, log.action, log.target, log.ip, log.statusCode || '', log.status, log.method, log.route];
    })].map((row) => row.map(escapeCell).join(',')).join('\r\n');
    res.setHeader('Content-Disposition', 'attachment; filename="ipes-security-audit.csv"');
    res.type('text/csv; charset=utf-8').send(`\uFEFF${csv}`);
  } catch (error) {
    console.error('Unable to export audit logs:', error);
    return res.status(500).json({ success: false, message: 'Unable to export audit logs.' });
  }
};

const cleanupSecurityLogs = async (req, res) => {
  if (req.body?.clearAll === true || req.body?.clear_all === true) {
    try {
      const [result] = await pool.query('DELETE FROM audit_logs');
      return res.json({ success: true, deleted: result.affectedRows, clearedAll: true });
    } catch (error) {
      console.error('Unable to clear audit logs:', error);
      return res.status(500).json({ success: false, message: 'Unable to clear audit history.' });
    }
  }

  const retentionDays = Number.parseInt(req.body?.retentionDays ?? req.body?.retention_days, 10);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    return res.status(400).json({ success: false, message: 'retentionDays must be an integer between 1 and 3650.' });
  }

  try {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const [result] = await pool.query('DELETE FROM audit_logs WHERE created_at < ?', [cutoff]);
    return res.json({ success: true, deleted: result.affectedRows, retentionDays });
  } catch (error) {
    console.error('Unable to clean up audit logs:', error);
    return res.status(500).json({ success: false, message: 'Unable to clean up audit logs.' });
  }
};

const getSystemHealth = async (_req, res) => {
  try {
    const snapshot = await getSystemHealthSnapshot();
    return res.status(200).json({ success: true, data: snapshot });
  } catch (error) {
    console.error('Unable to retrieve system health:', error);
    return res.status(200).json({
      success: true,
      message: 'System health is temporarily unavailable; returning safe fallback data.',
      data: {
        status: 'degraded',
        generatedAt: new Date().toISOString(),
        uptime: { formatted: '0d 0h 0m 0s' },
        database: { status: 'offline', latencyMs: 0, lastBackup: null, message: error?.message || 'Unable to compute system health' },
        apiPerformance: { averageResponseTimeMs: 0, requestsPerMinute: 0, errorRate: 0 },
        alerts: [{ level: 'warning', title: 'System health fallback', detail: 'The health snapshot could not be generated.' }],
      },
    });
  }
};

const triggerBackup = async (_req, res) => {
  try {
    const result = await triggerDatabaseBackup();
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Unable to trigger system backup:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Unable to trigger database backup.' });
  }
};

const updateBackupRetention = async (req, res) => {
  const retentionDays = Number(req.body?.retentionDays ?? req.body?.backupRetentionDays);
  if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 90) {
    return res.status(400).json({ success: false, message: 'Backup retention must be an integer between 7 and 90 days.' });
  }

  try {
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('backup_retention_days', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
      [String(retentionDays)]
    );
    return res.json({ success: true, data: { backupRetentionDays: retentionDays }, message: `Backup retention set to ${retentionDays} days.` });
  } catch (error) {
    console.error('Unable to update backup retention:', error);
    return res.status(500).json({ success: false, message: 'Unable to update backup retention.' });
  }
};

const getDatabaseHealth = async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [statusRows] = await connection.query(`SHOW GLOBAL STATUS
      WHERE Variable_name IN ('Threads_connected', 'Threads_running', 'Uptime', 'Questions', 'Slow_queries')`);
    const [variableRows] = await connection.query("SHOW GLOBAL VARIABLES WHERE Variable_name IN ('max_connections')");
    const [tableRows] = await connection.query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'target_role'
      GROUP BY TABLE_NAME
    `);

    const status = Array.isArray(statusRows) ? statusRows.reduce((result, row) => {
      result[row.Variable_name] = Number(row.Value || 0);
      return result;
    }, {}) : {};
    const variables = Array.isArray(variableRows) ? variableRows.reduce((result, row) => {
      result[row.Variable_name] = Number(row.Value || 0);
      return result;
    }, {}) : {};
    const maxConnections = variables.max_connections || 0;
    const hasTargetRoleColumn = Array.isArray(tableRows) && tableRows.some((row) => String(row.TABLE_NAME).toLowerCase() === 'evaluation_criteria');

    return res.status(200).json({
      success: true,
      data: {
        status: hasTargetRoleColumn ? 'Online' : 'Degraded',
        schemaStatus: hasTargetRoleColumn ? 'Compatible' : 'Missing target_role column',
        connections: status.Threads_connected || 0,
        runningQueries: status.Threads_running || 0,
        uptimeSeconds: status.Uptime || 0,
        totalQueries: status.Questions || 0,
        slowQueries: status.Slow_queries || 0,
        maxConnections,
        connectionUsage: maxConnections
          ? Number(((status.Threads_connected || 0) / maxConnections * 100).toFixed(1))
          : 0,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const isMissingSchemaError = error && (
      error.code === 'ER_BAD_FIELD_ERROR' ||
      error.code === 'ER_NO_SUCH_FIELD' ||
      error.code === 'ER_NO_SUCH_TABLE' ||
      String(error.message).includes('Unknown column') ||
      String(error.message).includes('doesn\'t exist')
    );

    console.error('Unable to retrieve database health:', {
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      message: error?.message,
      sql: error?.sql,
      handled: isMissingSchemaError,
    });

    if (isMissingSchemaError) {
      return res.status(200).json({
        success: true,
        data: {
          status: 'Degraded',
          schemaStatus: 'Schema compatibility warning',
          warning: 'One or more database objects are missing or incompatible with the expected schema.',
          checkedAt: new Date().toISOString(),
        },
      });
    }

    return res.status(503).json({
      success: false,
      message: 'Unable to retrieve database health.',
      data: { status: 'Offline', checkedAt: new Date().toISOString() },
    });
  } finally {
    if (connection) connection.release();
  }
};

const updateSystemLock = async (req, res) => {
  const enabled = req.body?.enabled === true || String(req.body?.enabled).toLowerCase() === 'true' || Number(req.body?.enabled) === 1;
  try {
    await updateSecurityControlSettings({ systemLockEnabled: enabled });
    return res.json({ success: true, enabled, message: enabled ? 'Global system lock enabled.' : 'Global system lock disabled.' });
  } catch (error) {
    console.error('Unable to update global system lock:', error);
    return res.status(500).json({ success: false, message: 'Unable to update global system lock.' });
  }
};

const createCollege = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!name || !code) return res.status(400).json({ message: 'College name and code are required.' });

    const [result] = await pool.query('INSERT INTO colleges (name, code) VALUES (?, ?)', [name, code]);
    return res.status(201).json({ id: result.insertId, name, code, message: 'College created successfully.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'College name or code already exists.' });
    console.error('Unable to create college:', error);
    return res.status(500).json({ message: 'Unable to create college.' });
  }
};

const getColleges = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, code FROM colleges ORDER BY name ASC');
    return res.json(rows);
  } catch (error) {
    console.error('Unable to retrieve colleges:', error);
    return res.status(500).json({ message: 'Unable to retrieve colleges.' });
  }
};

const getDepartmentsByCollege = async (req, res) => {
  const collegeId = Number(req.query.college_id || req.query.collegeId);
  if (!Number.isInteger(collegeId) || collegeId <= 0) {
    return res.status(400).json({ message: 'A valid college_id is required.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT
         id,
         college_id,
         COALESCE(department_name, name, 'Department') AS department_name,
         COALESCE(department_code, code, '') AS department_code,
         COALESCE(name, department_name, 'Department') AS name,
         COALESCE(code, department_code, '') AS code,
         'active' AS status
       FROM departments
       WHERE college_id = ?
       ORDER BY COALESCE(name, department_name, 'Department') ASC`,
      [collegeId]
    );
    return res.json(rows);
  } catch (error) {
    console.error('Unable to retrieve departments by college:', error);
    return res.status(500).json({ message: 'Unable to retrieve departments.' });
  }
};

const getCollegesWithDepartments = async (_req, res) => {
  try {
    const query = `
      SELECT
        c.id AS college_id,
        c.name AS college_name,
        c.code AS college_code,
        d.id AS dept_id,
        COALESCE(d.department_name, d.name, 'Department') AS dept_name,
        COALESCE(d.department_code, d.code, '') AS dept_code,
        'active' AS dept_status
      FROM colleges c
      LEFT JOIN departments d ON d.college_id = c.id
      ORDER BY c.name ASC, COALESCE(d.department_name, d.name, 'Department') ASC
    `;

    const [rows] = await pool.query(query);
    const grouped = rows.reduce((accumulator, row) => {
      const collegeId = row.college_id ?? null;
      const collegeName = row.college_name ?? 'Unassigned College';
      const collegeCode = row.college_code ?? '';
      const college = accumulator.find((item) => Number(item.college_id) === Number(collegeId));

      const department = row.dept_id == null ? null : {
        dept_id: row.dept_id,
        dept_name: row.dept_name || 'Department',
        dept_code: row.dept_code || '',
        dept_status: row.dept_status || 'active',
      };

      if (!college) {
        accumulator.push({
          college_id: collegeId,
          college_name: collegeName,
          college_code: collegeCode,
          college_status: 'active',
          departments: department ? [department] : [],
        });
        return accumulator;
      }

      if (department) {
        college.departments.push(department);
      }
      return accumulator;
    }, []);

    return res.json({ success: true, data: normalizeCollegeDepartmentRows(grouped) });
  } catch (error) {
    console.error('Unable to retrieve colleges with departments:', error);
    return res.status(500).json({ success: false, message: 'Unable to retrieve colleges with departments.' });
  }
};

const normalizeManagementRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['department_head', 'depthead'].includes(normalized)) return 'dept_head';
  if (['college_dean', 'dean'].includes(normalized)) return 'college_dean';
  if (['academic_director', 'directorate'].includes(normalized)) return 'academic_directorate';
  return normalized;
};

const getManagementRoleOccupant = async (req, res) => {
  const role = normalizeManagementRole(req.query.role || '');
  const collegeId = Number(req.query.college_id || 0) || null;
  const departmentId = Number(req.query.department_id || 0) || null;

  if (!['dept_head', 'college_dean', 'lab_assistant', 'academic_directorate', 'academic_vice_president'].includes(role)) {
    return res.status(400).json({ message: 'Unsupported management role.' });
  }
  if (role === 'college_dean' && !collegeId) return res.status(400).json({ message: 'A college is required.' });
  if ((role === 'dept_head' || role === 'lab_assistant') && !departmentId) return res.status(400).json({ message: 'A department is required.' });

  try {
    const isCollegeScoped = role === 'college_dean';
    const isDepartmentScoped = ['dept_head', 'lab_assistant'].includes(role);

    let query = `
      SELECT u.id, u.role,
             COALESCE(CONCAT_WS(' ', i.first_name, i.last_name), CONCAT_WS(' ', la.first_name, la.last_name)) AS full_name,
             COALESCE(i.department_id, la.department_id) AS department_id,
             d.name AS department_name,
             d.college_id, c.name AS college_name
      FROM users u
      LEFT JOIN instructors i ON i.user_id = u.id
      LEFT JOIN lab_assistants la ON la.user_id = u.id
      LEFT JOIN departments d ON d.id = COALESCE(i.department_id, la.department_id)
      LEFT JOIN colleges c ON c.id = d.college_id
      WHERE u.role = ? AND LOWER(COALESCE(u.status, 'active')) = 'active'
    `;

    const params = [role];

    if (isCollegeScoped) {
      query += ' AND d.college_id = ?';
      params.push(collegeId);
    }

    if (isDepartmentScoped) {
      query += ' AND COALESCE(i.department_id, la.department_id) = ?';
      params.push(departmentId);
    }

    query += ' ORDER BY u.id ASC LIMIT 1';

    const [[occupant]] = await pool.query(query, params);
    return res.json(occupant || null);
  } catch (error) {
    console.error('Unable to retrieve management role occupant:', error);
    return res.status(500).json({ message: 'Unable to retrieve management role occupant.' });
  }
};

const assignRoleWithHierarchy = async (req, res) => {
  const allowedRoles = ['dept_head', 'college_dean', 'lab_assistant', 'academic_directorate', 'academic_vice_president'];
  const role = normalizeManagementRole(req.body.role || '');
  const userId = Number(req.params.id);
  const collegeId = Number(req.body.college_id || 0) || null;
  const departmentId = Number(req.body.department_id || 0) || null;
  if (!allowedRoles.includes(role)) return res.status(400).json({ message: 'Unsupported management role.' });
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: 'Invalid user ID.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[user]] = await connection.query(`
      SELECT u.id, u.role, u.status,
        COALESCE(i.department_id, la.department_id) AS department_id,
        d.college_id
      FROM users u
      LEFT JOIN instructors i ON i.user_id = u.id
      LEFT JOIN lab_assistants la ON la.user_id = u.id
      LEFT JOIN departments d ON d.id = COALESCE(i.department_id, la.department_id)
      WHERE u.id = ? LIMIT 1
    `, [userId]);
    if (!user) {
      await connection.rollback();
      return res.status(404).json({ message: 'User not found.' });
    }
    const userRole = String(user.role || '').trim().toLowerCase();
    if (String(user.status || '').toLowerCase() !== 'active') {
      await connection.rollback();
      return res.status(400).json({ message: 'Only active academic staff can receive institutional roles.' });
    }

    const validCurrentRoles = {
      dept_head: ['instructor', 'lab_assistant'],
      college_dean: ['instructor', 'dept_head', 'lab_assistant'],
      academic_directorate: ['instructor', 'dept_head', 'college_dean', 'lab_assistant'],
      academic_vice_president: ['instructor', 'dept_head', 'college_dean', 'academic_directorate', 'academic_director', 'directorate', 'lab_assistant'],
      lab_assistant: ['instructor', 'lab_assistant'],
    };

    if (!validCurrentRoles[role]?.includes(userRole)) {
      await connection.rollback();
      return res.status(400).json({ message: role === 'lab_assistant' ? 'Only instructors or existing lab assistants can be assigned this role.' : 'Students cannot receive institutional roles.' });
    }
    if (role === 'college_dean' && (!collegeId || Number(user.college_id) !== collegeId)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Instructor does not belong to the selected college.' });
    }
    if (role === 'dept_head' && (!departmentId || !['instructor', 'lab_assistant'].includes(userRole) || Number(user.department_id) !== departmentId)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Selected staff member does not belong to the selected department.' });
    }
    if (role === 'lab_assistant' && (!departmentId || Number(user.department_id) !== departmentId)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Selected staff member does not belong to the selected department.' });
    }
    if (role === 'academic_directorate' && !['instructor', 'dept_head', 'college_dean', 'lab_assistant'].includes(userRole)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Only academic staff can receive this role.' });
    }

    const isInstitutionWideRole = ['academic_directorate', 'academic_vice_president'].includes(role);
    const scopeClause = isInstitutionWideRole
      ? ''
      : role === 'college_dean' ? 'AND d.college_id = ?' : 'AND COALESCE(i.department_id, la.department_id) = ?';
    const scopeParams = isInstitutionWideRole ? [] : [role === 'college_dean' ? collegeId : departmentId];

    if (role !== 'lab_assistant') {
      const [[occupant]] = await connection.query(`
        SELECT u.id,
          COALESCE(CONCAT_WS(' ', i.first_name, i.last_name), CONCAT_WS(' ', la.first_name, la.last_name)) AS full_name
        FROM users u
        LEFT JOIN instructors i ON i.user_id = u.id
        LEFT JOIN lab_assistants la ON la.user_id = u.id
        LEFT JOIN departments d ON d.id = COALESCE(i.department_id, la.department_id)
        WHERE u.role IN (?, ?)
          AND LOWER(COALESCE(u.status, 'active')) = 'active'
          ${scopeClause}
        LIMIT 1 FOR UPDATE
      `, [role, role === 'college_dean' ? 'dean' : role === 'dept_head' ? 'department_head' : role === 'academic_directorate' ? 'academic_director' : role, ...scopeParams]);
      if (occupant && Number(occupant.id) !== userId) {
        await connection.rollback();
        const roleLabel = role === 'college_dean' ? 'College Dean' : role === 'dept_head' ? 'Department Head' : role === 'academic_vice_president' ? 'Vice President' : 'Academic Directorate';
        return res.status(409).json({ message: `Current ${roleLabel}: ${occupant.full_name}. Remove the current occupant first.` });
      }
    }

    const [result] = await connection.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: 'User not found.' });
    }
    await connection.commit();
    return res.json({ id: userId, role, message: 'Role assigned successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Unable to assign management role:', error);
    return res.status(500).json({ message: 'Unable to assign management role.' });
  } finally {
    connection.release();
  }
};

const resetManagementRole = async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: 'Invalid user ID.' });
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Verify user has a management role
    const [[user]] = await connection.query(
      "SELECT u.id, u.role FROM users u WHERE u.id = ? AND u.role IN ('dept_head', 'college_dean', 'academic_directorate', 'academic_vice_president', 'lab_assistant')",
      [userId]
    );
    
    if (!user) {
      await connection.rollback();
      return res.status(404).json({ message: 'Active management role occupant not found.' });
    }
    
    // Simple role revert: update users table only (profile stays in instructors table)
    const [result] = await connection.query(
      "UPDATE users SET role = 'instructor' WHERE id = ?",
      [userId]
    );
    
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(500).json({ message: 'Failed to update user role.' });
    }
    
    await connection.commit();
    return res.json({ id: userId, role: 'instructor', message: 'Role reverted to Instructor successfully.' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Unable to reset management role:', error);
    return res.status(500).json({ message: 'Unable to reset management role.' });
  } finally {
    if (connection) connection.release();
  }
};

const resetUserPassword = async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ message: 'Invalid user ID.' });

  try {
    const passwordHash = await bcrypt.hash(DEFAULT_USER_PASSWORD, 12);
    const [result] = await pool.query(
      'UPDATE users SET password_hash = ?, is_first_login = 1, must_change_password = 1 WHERE id = ?',
      [passwordHash, userId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'User not found.' });
    return res.json({ success: true, id: userId, message: 'Password reset successfully. The user must change it on next login.' });
  } catch (error) {
    console.error('Unable to reset user password:', error);
    return res.status(500).json({ success: false, message: 'Unable to reset user password.' });
  }
};

const normalizeUserDepartmentId = async (connection, departmentValue) => {
  if (departmentValue === undefined || departmentValue === null || departmentValue === '') return null;

  if (Number.isInteger(Number(departmentValue)) && Number(departmentValue) > 0) {
    const departmentId = Number(departmentValue);
    const [[department]] = await connection.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [departmentId]);
    if (department) return departmentId;
  }

  const normalized = String(departmentValue).trim();
  if (!normalized) return null;

  const [[department]] = await connection.query(
    'SELECT id FROM departments WHERE name = ? OR department_name = ? OR code = ? OR department_code = ? LIMIT 1',
    [normalized, normalized, normalized, normalized]
  );

  return department ? Number(department.id) : null;
};

const splitPersonName = (fullName, fallbackFirstName, fallbackLastName) => {
  const direct = typeof fullName === 'string' ? fullName.trim() : '';
  const firstName = typeof fallbackFirstName === 'string' ? fallbackFirstName.trim() : '';
  const lastName = typeof fallbackLastName === 'string' ? fallbackLastName.trim() : '';

  if (direct) {
    const parts = direct.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return { first_name: firstName || '', last_name: lastName || '' };
    }
    return {
      first_name: parts[0],
      last_name: parts.slice(1).join(' ') || lastName,
    };
  }

  return {
    first_name: firstName,
    last_name: lastName,
  };
};

const updateUserByAdmin = async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid user ID.' });
  }

  const payload = req.body || {};
  const currentRole = String(payload.role || '').trim().toLowerCase();
  const status = typeof payload.status === 'string' ? payload.status.trim() : payload.status;
  const fullName = typeof payload.full_name === 'string' ? payload.full_name : payload.fullName || null;
  const firstName = typeof payload.first_name === 'string' ? payload.first_name : payload.firstName || null;
  const lastName = typeof payload.last_name === 'string' ? payload.last_name : payload.lastName || null;
  const email = typeof payload.email === 'string' ? payload.email.trim() : payload.email || null;
  const departmentValue = payload.department_id ?? payload.departmentId ?? payload.department ?? null;
  const departmentId = await normalizeUserDepartmentId(pool, departmentValue);
  const candidateEmployeeId = payload.employee_id ?? payload.employeeId ?? null;
  const candidateStudentId = payload.student_id ?? payload.studentId ?? null;
  const year = payload.year ?? payload.year_level ?? null;
  const section = payload.section ? String(payload.section).trim().replace(/^section\s*/i, '') : null;
  const programType = payload.program_type ?? payload.programType ?? null;
  const gender = payload.gender ?? null;
  const phoneNumber = payload.phone_number ?? payload.phoneNumber ?? null;
  const semester = payload.semester ?? null;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[existingUser]] = await connection.query(`
      SELECT u.id, u.email, u.role, u.status,
             i.id AS instructor_id, i.first_name AS instructor_first_name, i.last_name AS instructor_last_name,
             i.employee_id AS instructor_employee_id, i.department_id AS instructor_department_id,
             la.id AS lab_assistant_id, la.first_name AS lab_assistant_first_name, la.last_name AS lab_assistant_last_name,
             la.employee_id AS lab_assistant_employee_id, la.department_id AS lab_assistant_department_id,
             s.id AS student_id, s.first_name AS student_first_name, s.last_name AS student_last_name,
             s.student_id AS student_student_id, s.department_id AS student_department_id,
             s.year_level AS student_year_level, s.section AS student_section, s.program_type AS student_program_type
      FROM users u
      LEFT JOIN instructors i ON i.user_id = u.id
      LEFT JOIN lab_assistants la ON la.user_id = u.id
      LEFT JOIN students s ON s.user_id = u.id
      WHERE u.id = ? LIMIT 1
    `, [userId]);

    if (!existingUser) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const roleUpdate = currentRole ? currentRole : String(existingUser.role || '').trim().toLowerCase();
    const normalizedStatus = status !== undefined && status !== null && String(status).trim() ? String(status).trim() : String(existingUser.status || 'active').trim() || 'active';

    if (isSystemAdminRole(roleUpdate) && String(normalizedStatus).toLowerCase() === 'active') {
      const otherActiveAdmin = await getActiveSystemAdmin(connection, userId);
      if (otherActiveAdmin) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: SYSTEM_ADMIN_CONFLICT_MESSAGE });
      }
    }

    const userUpdates = [];
    const userParams = [];

    if (email !== null && email !== undefined) {
      userUpdates.push('email = ?');
      userParams.push(String(email).trim() || null);
    }

    if (currentRole) {
      userUpdates.push('role = ?');
      userParams.push(roleUpdate);
    }

    if (status !== undefined && status !== null) {
      userUpdates.push('status = ?');
      userParams.push(normalizedStatus);
    }

    if (userUpdates.length) {
      const [result] = await connection.query(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`, [...userParams, userId]);
      if (!result.affectedRows) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
    }

    const resolvedRole = roleUpdate || String(existingUser.role || '').trim().toLowerCase();
    const nameParts = splitPersonName(fullName, firstName, lastName);
    const finalFirstName = String(nameParts.first_name || existingUser.instructor_first_name || existingUser.lab_assistant_first_name || existingUser.student_first_name || '').trim();
    const finalLastName = String(nameParts.last_name || existingUser.instructor_last_name || existingUser.lab_assistant_last_name || existingUser.student_last_name || '').trim();
    const finalDepartmentId = departmentId ?? existingUser.instructor_department_id ?? existingUser.lab_assistant_department_id ?? existingUser.student_department_id ?? null;

    if (resolvedRole === 'student' || existingUser.student_id) {
      const sanitizedStudentId = candidateStudentId ?? existingUser.student_student_id ?? null;
      const studentValues = [
        sanitizedStudentId,
        finalFirstName || existingUser.student_first_name || '',
        finalLastName || existingUser.student_last_name || '',
        finalDepartmentId,
        semester || 'I',
        year || existingUser.student_year_level || '1',
        section || existingUser.student_section || 'A',
        gender || null,
        phoneNumber || null,
        programType || existingUser.student_program_type || 'Regular',
      ];

      if (existingUser.student_id) {
        await connection.query(
          `UPDATE students SET student_id = ?, first_name = ?, last_name = ?, department_id = ?, semester = ?, year_level = ?, section = ?, gender = ?, phone_number = ?, program_type = ? WHERE id = ?`,
          [...studentValues, existingUser.student_id]
        );
      } else {
        await connection.query(
          `INSERT INTO students (user_id, student_id, first_name, last_name, department_id, semester, year_level, section, gender, phone_number, program_type, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)`,
          [userId, sanitizedStudentId || `${userId}-student`, finalFirstName || 'Student', finalLastName || '', finalDepartmentId || 0, semester || 'I', year || '1', section || 'A', gender || null, phoneNumber || null, programType || 'Regular']
        );
      }
    } else if (resolvedRole === 'lab_assistant' || existingUser.lab_assistant_id) {
      const employeeValue = candidateEmployeeId ?? existingUser.lab_assistant_employee_id ?? null;
      if (existingUser.lab_assistant_id) {
        await connection.query(
          `UPDATE lab_assistants SET employee_id = ?, first_name = ?, last_name = ?, department_id = ?, gender = ?, phone_number = ? WHERE id = ?`,
          [employeeValue, finalFirstName || existingUser.lab_assistant_first_name || '', finalLastName || existingUser.lab_assistant_last_name || '', finalDepartmentId, gender || null, phoneNumber || null, existingUser.lab_assistant_id]
        );
      } else {
        await connection.query(
          `INSERT INTO lab_assistants (user_id, employee_id, first_name, last_name, department_id, gender, phone_number) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, employeeValue || `LA-${userId}`, finalFirstName || 'Lab', finalLastName || 'Assistant', finalDepartmentId || 0, gender || null, phoneNumber || null]
        );
      }
    } else {
      const instructorEmployeeId = candidateEmployeeId ?? existingUser.instructor_employee_id ?? null;
      if (existingUser.instructor_id) {
        await connection.query(
          `UPDATE instructors SET employee_id = ?, first_name = ?, last_name = ?, department_id = ?, gender = ?, phone_number = ? WHERE id = ?`,
          [instructorEmployeeId, finalFirstName || existingUser.instructor_first_name || '', finalLastName || existingUser.instructor_last_name || '', finalDepartmentId, gender || null, phoneNumber || null, existingUser.instructor_id]
        );
      } else {
        await connection.query(
          `INSERT INTO instructors (user_id, employee_id, first_name, last_name, department_id, gender, phone_number) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, instructorEmployeeId || `INS-${userId}`, finalFirstName || 'Instructor', finalLastName || '', finalDepartmentId || 0, gender || null, phoneNumber || null]
        );
      }
    }

    await connection.commit();
    return res.json({
      success: true,
      message: 'User updated successfully.',
      data: {
        id: userId,
        role: resolvedRole,
        status: normalizedStatus,
      },
    });
  } catch (error) {
    await connection.rollback();
    if (isActiveSystemAdminUniqueError(error)) {
      return res.status(409).json({ success: false, message: SYSTEM_ADMIN_CONFLICT_MESSAGE });
    }
    console.error('Unable to update user by admin:', error);
    return res.status(500).json({ success: false, message: 'Unable to update user.' });
  } finally {
    connection.release();
  }
};

const toggleUserArchive = async (req, res) => {
  const userId = Number(req.params.id);
  const requestedStatus = String(req.body?.status || '').trim().toLowerCase();
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid user ID.' });
  }
  if (requestedStatus && !['active', 'archived'].includes(requestedStatus)) {
    return res.status(400).json({ success: false, message: 'Status must be Active or Archived.' });
  }

  try {
    const [[user]] = await pool.query('SELECT id, role, status FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const nextStatus = requestedStatus || (String(user.status || 'active').trim().toLowerCase() === 'archived' ? 'active' : 'archived');
    if (nextStatus === 'active' && isSystemAdminRole(user.role)) {
      const otherActiveAdmin = await getActiveSystemAdmin(pool, userId);
      if (otherActiveAdmin) return res.status(409).json({ success: false, message: SYSTEM_ADMIN_CONFLICT_MESSAGE });
    }
    const [result] = await pool.query('UPDATE users SET status = ? WHERE id = ?', [nextStatus, userId]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, data: { id: userId, status: nextStatus }, message: nextStatus === 'archived' ? 'User archived successfully.' : 'User restored successfully.' });
  } catch (error) {
    if (isActiveSystemAdminUniqueError(error)) {
      return res.status(409).json({ success: false, message: SYSTEM_ADMIN_CONFLICT_MESSAGE });
    }
    console.error('Unable to toggle archive status:', error);
    return res.status(500).json({ success: false, message: 'Unable to update user archive status.' });
  }
};

const deleteUserByAdmin = async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid user ID.' });
  }

  try {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, data: { id: userId }, message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Unable to delete user by admin:', error);
    return res.status(500).json({ success: false, message: 'Unable to delete user.' });
  }
};

const getRoleCandidates = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.user_id, i.first_name, i.last_name, u.email, i.employee_id,
        u.role, u.status, i.department_id,
        d.name AS department_name, d.college_id, c.name AS college_name,
        CONCAT(i.first_name, ' ', i.last_name) AS full_name
      FROM users u
      INNER JOIN instructors i ON i.user_id = u.id
      LEFT JOIN departments d ON d.id = i.department_id
      LEFT JOIN colleges c ON c.id = d.college_id
      WHERE u.role IN ('instructor', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate')
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
      UNION ALL
      SELECT la.user_id, la.first_name, la.last_name, u.email, la.employee_id,
        u.role, u.status, la.department_id,
        d.name AS department_name, d.college_id, c.name AS college_name,
        CONCAT(la.first_name, ' ', la.last_name) AS full_name
      FROM users u
      INNER JOIN lab_assistants la ON la.user_id = u.id
      LEFT JOIN departments d ON d.id = la.department_id
      LEFT JOIN colleges c ON c.id = d.college_id
      WHERE u.role = 'lab_assistant'
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
      ORDER BY first_name ASC, last_name ASC
    `);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Unable to retrieve role candidates:', {
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      message: error?.message,
      sql: error?.sql,
    });
    return res.status(500).json({ success: false, message: 'Unable to retrieve role candidates.', data: null });
  }
};

module.exports = {
  normalizeCollegeDepartmentRows,
  updateAdminProfile,
  getAdminDashboardStats,
  getDepartmentAnalytics,
  getSecurityLogs,
  exportSecurityLogs,
  getDatabaseHealth,
  getSystemHealth,
  triggerBackup,
  updateBackupRetention,
  updateSystemLock,
  cleanupSecurityLogs,
  createCollege,
  getColleges,
  getDepartmentsByCollege,
  getCollegesWithDepartments,
  getManagementRoleOccupant,
  assignRoleWithHierarchy,
  resetManagementRole,
  resetUserPassword,
  updateUserByAdmin,
  toggleUserArchive,
  deleteUserByAdmin,
  getRoleCandidates,
  getLandingContentAdmin,
  updateLandingContent,
  deleteLandingContent,
  getLandingPageSettingsAdmin,
  createLandingPageSetting,
  updateLandingPageSettings,
  deleteLandingPageSetting,
  getContactSettings,
  updateContactSetting,
};