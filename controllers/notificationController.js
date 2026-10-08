const pool = require('../config/db');
const { sendTelegramNotification } = require('../telegram-bot/src/services/notificationService');
const { formatEligibilityWarning } = require('../telegram-bot/src/services/localization');
let realtimeServer = null;

const setRealtimeServer = (io) => {
  realtimeServer = io;
};

const createNotifications = async ({ userIds, title, message, type = 'reminder' }) => {
  const recipients = [...new Set((userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!recipients.length) return [];

  const notificationTime = new Date();
  const values = recipients.flatMap((userId) => [userId, title, message, type, 0, notificationTime]);
  const placeholders = recipients.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  let result;
  try {
    [result] = await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES ${placeholders}`,
      values
    );
  } catch (error) {
    console.error('Bulk notification insert failed:', error);
    throw new Error(`Unable to save notifications: ${error.message}`);
  }

  const notifications = recipients.map((userId, index) => ({
    id: result.insertId + index,
    user_id: userId,
    title,
    message,
    type,
    is_read: 0,
    created_at: notificationTime.toISOString(),
  }));
  if (realtimeServer) {
    notifications.forEach((notification) => {
      realtimeServer.to(`user_${notification.user_id}`).emit('new_notification', {
        ...notification,
        is_read: false,
      });
    });
  }
  return notifications;
};

const normalizeAudienceValue = (audience) => {
  const raw = String(audience ?? '').trim().toLowerCase();
  if (!raw) return null;

  const normalized = raw
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const aliases = {
    all: 'all',
    all_users: 'all',
    students: 'student',
    student: 'student',
    instructors: 'instructor',
    instructor: 'instructor',
    dept_head: 'dept_head',
    dept_heads: 'dept_head',
    deptheads: 'dept_head',
    department_head: 'dept_head',
    department_heads: 'dept_head',
    lab_assistant: 'lab_assistant',
    lab_assistants: 'lab_assistant',
    college_dean: 'college_dean',
    college_deans: 'college_dean',
    dean: 'college_dean',
    deans: 'college_dean',
    academic_director: 'academic_directorate',
    academic_directors: 'academic_directorate',
    academic_directorate: 'academic_directorate',
    directorate: 'academic_directorate',
    vice_president: 'academic_vice_president',
    vice_presidents: 'academic_vice_president',
    academic_vice_president: 'academic_vice_president',
    academic_vice_presidents: 'academic_vice_president',
  };

  return aliases[normalized] || null;
};

const getUserNotifications = async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ success: false, message: 'Authenticated user is required.' });
    }

    let notifications = [];
    let unreadCount = 0;

    try {
      const [rows] = await pool.query(
        `SELECT id, title, message, type, is_read, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      );
      notifications = Array.isArray(rows) ? rows : [];

      const [[count]] = await pool.query(
        'SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = 0',
        [userId]
      );
      unreadCount = Number(count?.unread_count || 0);
    } catch (queryError) {
      if (queryError?.code === 'ER_NO_SUCH_TABLE' || queryError?.code === 'ER_BAD_TABLE_ERROR') {
        return res.status(200).json({ success: true, data: { notifications: [], unreadCount: 0 } });
      }
      throw queryError;
    }

    return res.status(200).json({
      success: true,
      data: {
        notifications: notifications.map((notification) => ({
          ...notification,
          is_read: Boolean(notification.is_read),
        })),
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Fetch user notifications failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to load notifications.', error: error?.message || 'Unknown notification error' });
  }
};

const getNotifications = getUserNotifications;

const markNotificationRead = async (req, res) => {
  const userId = Number(req.user?.id);
  const notificationId = Number(req.params.notificationId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ success: false, message: 'Authenticated user is required.' });
  }
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ success: false, message: 'A valid notification ID is required.' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
    return res.status(200).json({ success: true, updated: Number(result?.affectedRows || 0) });
  } catch (error) {
    console.error('Mark notification read failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to mark notification as read.' });
  }
};

const deleteNotification = async (req, res) => {
  const userId = Number(req.user?.id);
  const notificationId = Number(req.params.notificationId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ success: false, message: 'Authenticated user is required.' });
  }
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ success: false, message: 'A valid notification ID is required.' });
  }

  try {
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
    return res.status(200).json({ success: true, deleted: Number(result?.affectedRows || 0) });
  } catch (error) {
    console.error('Delete notification failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to delete notification.' });
  }
};

const markAllRead = async (req, res) => {
  try {
    const requestedUserId = Number(req.params.userId || req.user.id);
    if (requestedUserId !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only update your own notifications.' });
    }

    try {
      const [result] = await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [requestedUserId]);
      return res.status(200).json({ success: true, updated: Number(result?.affectedRows || 0) });
    } catch (queryError) {
      if (queryError?.code === 'ER_NO_SUCH_TABLE' || queryError?.code === 'ER_BAD_TABLE_ERROR') {
        return res.status(200).json({ success: true, updated: 0, data: [] });
      }
      throw queryError;
    }
  } catch (error) {
    console.error('Mark all notifications read failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to mark notifications as read.', error: error?.message || 'Unknown notification error' });
  }
};

const clearAllNotifications = async (req, res) => {
  try {
    const requestedUserId = Number(req.params.userId || req.user.id);
    if (requestedUserId !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'You can only clear your own notifications.' });
    }

    try {
      const [result] = await pool.query('DELETE FROM notifications WHERE user_id = ?', [requestedUserId]);
      return res.status(200).json({ success: true, deleted: Number(result?.affectedRows || 0) });
    } catch (queryError) {
      if (queryError?.code === 'ER_NO_SUCH_TABLE' || queryError?.code === 'ER_BAD_TABLE_ERROR') {
        return res.status(200).json({ success: true, deleted: 0, data: [] });
      }
      throw queryError;
    }
  } catch (error) {
    console.error('Clear all notifications failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to clear notifications.', error: error?.message || 'Unknown notification error' });
  }
};

const sendNotification = async (req, res) => {
  try {
    const { userIds, audience, title, message, department_id, year_level, section, program_type } = req.body || {};
    let recipients = Array.isArray(userIds) ? userIds : (userIds ? [userIds] : []);
    const normalizedAudience = normalizeAudienceValue(audience);

    try {
      if (!recipients.length && normalizedAudience === 'all') {
        const [activeUsers] = await pool.query(
          "SELECT id FROM users WHERE LOWER(COALESCE(status, 'active')) = 'active'"
        );
        recipients = activeUsers.map((user) => user.id);
      } else if (!recipients.length && normalizedAudience) {
        const audienceRoles = normalizedAudience === 'academic_vice_president'
          ? ['academic_vice_president', 'vice_president', 'vice_presidents']
          : [normalizedAudience];
        const [audienceUsers] = await pool.query(
          `SELECT id FROM users
           WHERE LOWER(TRIM(COALESCE(role, ''))) IN (${audienceRoles.map(() => '?').join(', ')})
             AND LOWER(COALESCE(status, 'active')) = 'active'`,
          audienceRoles
        );
        recipients = audienceUsers.map((user) => user.id);
      } else if (!recipients.length && (department_id || year_level || section || program_type)) {
        const [studentUsers] = await pool.query(
          `SELECT s.user_id
           FROM students s
           INNER JOIN users u ON u.id = s.user_id
           WHERE (? IS NULL OR s.department_id = ?)
             AND (? IS NULL OR LOWER(TRIM(s.year_level)) = LOWER(TRIM(?)))
             AND (? IS NULL OR LOWER(TRIM(REPLACE(s.section, 'Section ', ''))) = LOWER(TRIM(REPLACE(?, 'Section ', ''))))
             AND (? IS NULL OR LOWER(TRIM(s.program_type)) = LOWER(TRIM(?)))`,
          [department_id ?? null, department_id ?? null, year_level ?? null, year_level ?? null, section ?? null, section ?? null, program_type ?? null, program_type ?? null]
        );
        recipients = studentUsers.map((student) => student.user_id);
      }
    } catch (queryError) {
      if (queryError?.code === 'ER_NO_SUCH_TABLE' || queryError?.code === 'ER_BAD_TABLE_ERROR') {
        return res.status(200).json({ success: true, sent: 0, message: 'No notification audience data is available yet.' });
      }
      throw queryError;
    }

    const normalizedUserIds = [...new Set(recipients.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    const normalizedTitle = String(title || '').trim();
    const normalizedMessage = String(message || '').trim();

    if (!normalizedUserIds.length || !normalizedTitle || !normalizedMessage) {
      return res.status(400).json({ success: false, message: 'userIds, audience, title, and message are required.' });
    }

    await createNotifications({
      userIds: normalizedUserIds,
      title: normalizedTitle,
      message: normalizedMessage,
      type: 'manual',
    });
    return res.status(201).json({ success: true, sent: normalizedUserIds.length });
  } catch (error) {
    console.error('Send notification failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to send notification.', error: error?.message || 'Unknown notification error' });
  }
};

const sendTelegramReminders = async (req, res) => {
  const instructorId = Number(req.body?.instructorId || req.body?.instructor_id || 0);
  const departmentId = Number(req.user?.department_id || req.user?.departmentId || 0);

  if (!Number.isInteger(instructorId) || instructorId <= 0) {
    return res.status(400).json({ success: false, message: 'A valid instructorId is required.' });
  }
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return res.status(403).json({ success: false, message: 'Your department is not defined.' });
  }

  try {
    const [[instructor]] = await pool.query(
      'SELECT id FROM instructors WHERE id = ? AND department_id = ? LIMIT 1',
      [instructorId, departmentId]
    );
    if (!instructor) {
      return res.status(404).json({ success: false, message: 'Instructor not found in your department.' });
    }

    const [students] = await pool.query(`
      SELECT u.id AS user_id, u.telegram_chat_id, s.first_name,
        COUNT(DISTINCT ed.id) AS pending_count
      FROM course_assignments ca
      INNER JOIN students s ON ca.student_id = s.id OR (
        ca.student_id IS NULL
        AND s.department_id = ca.department_id
        AND LOWER(COALESCE(s.year_level, '')) = LOWER(COALESCE(ca.year_level, ''))
        AND LOWER(COALESCE(s.section, '')) = LOWER(COALESCE(ca.section, ''))
        AND (ca.program_type IS NULL OR LOWER(COALESCE(s.program_type, '')) = LOWER(ca.program_type))
      )
      INNER JOIN users u ON u.id = s.user_id
      INNER JOIN evaluation_dispatches ed
        ON ed.assignment_id = ca.id
       AND ed.student_id = s.id
       AND LOWER(COALESCE(ed.evaluation_type, 'student')) = 'student'
      WHERE ca.department_id = ?
        AND ca.instructor_id = ?
        AND LOWER(COALESCE(ca.status, 'assigned')) <> 'cancelled'
        AND LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active')
        AND LOWER(COALESCE(u.status, 'active')) = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM student_evaluation_submissions ses
          WHERE ses.dispatch_id = ed.id
            AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
        )
      GROUP BY u.id, u.telegram_chat_id, s.first_name, s.last_name
    `, [departmentId, instructorId]);

    const [peers] = await pool.query(`
      SELECT DISTINCT evaluator_user.id AS user_id, evaluator_user.telegram_chat_id
      FROM peer_evaluations pe
      INNER JOIN instructors evaluator ON evaluator.id = pe.evaluator_id
      INNER JOIN users evaluator_user ON evaluator_user.id = evaluator.user_id
      WHERE pe.evaluatee_id = ?
        AND pe.evaluator_id <> ?
        AND evaluator.department_id = ?
        AND LOWER(COALESCE(evaluator_user.status, 'active')) = 'active'
        AND LOWER(TRIM(COALESCE(evaluator_user.role, ''))) IN ('instructor', 'peer')
        AND LOWER(COALESCE(pe.status, 'pending')) IN ('pending', 'active')
        AND NOT EXISTS (
          SELECT 1
          FROM peer_evaluation_submissions pes
          WHERE pes.peer_evaluation_id = pe.id
            AND LOWER(COALESCE(pes.status, 'pending')) IN ('submitted', 'completed', 'approved')
        )
    `, [instructorId, instructorId, departmentId]);

    const studentDeliveryResults = await Promise.allSettled(students.map((student) =>
      sendTelegramNotification(student.user_id, formatEligibilityWarning({
        language: 'am',
        name: student.first_name,
        pendingCount: student.pending_count,
      }))
    ));
    const peerReminder = '🔔 የእኩዮች ምዘና ማሳሰቢያ። እባክዎ በIPES ላይ የተመደበልዎትን የእኩዮች ምዘና ከመጨረሻ ቀኑ በፊት ያጠናቁ።';
    const peerDeliveryResults = await Promise.allSettled(peers.map((peer) =>
      sendTelegramNotification(peer.user_id, peerReminder)
    ));
    const deliveryResults = [...studentDeliveryResults, ...peerDeliveryResults];
    const sent = deliveryResults.filter((result) => result.status === 'fulfilled' && result.value?.success).length;
    const failed = deliveryResults.length - sent;

    return res.status(200).json({
      success: true,
      pendingStudents: students.length,
      pendingPeers: peers.length,
      sent,
      skippedUnlinked: deliveryResults.filter((result) => result.status === 'fulfilled' && !result.value?.success).length,
      failed,
    });
  } catch (error) {
    console.error('Send Telegram evaluation reminders failed:', error);
    return res.status(500).json({ success: false, message: 'Unable to send Telegram reminders.' });
  }
};

module.exports = {
  getUserNotifications,
  getNotifications,
  markNotificationRead,
  deleteNotification,
  markAllRead,
  clearAllNotifications,
  sendNotification,
  sendTelegramReminders,
  createNotifications,
  setRealtimeServer,
};