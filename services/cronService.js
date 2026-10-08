const cron = require('node-cron');
const pool = require('../config/db');
const { getBotInstance } = require('../telegram-bot/src/services/notificationService');
const { getDashboardUrl } = require('../telegram-bot/src/config');
const { sendTelegramReminder } = require('../utils/telegramBot');

const CRON_TIMEZONE = process.env.TELEGRAM_CRON_TIMEZONE || 'Africa/Addis_Ababa';
let reminderTask = null;

const getDateParts = (date, timezone = CRON_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]));
};

const getDateKey = (value, timezone = CRON_TIMEZONE) => {
  if (!value) return null;
  if (value instanceof Date) {
    const parts = getDateParts(value, timezone);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  const text = String(value).trim();
  const datePrefix = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (datePrefix) return `${datePrefix[1]}-${datePrefix[2]}-${datePrefix[3]}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = getDateParts(parsed, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const getTomorrowDateKey = (now = new Date(), timezone = CRON_TIMEZONE) => {
  const parts = getDateParts(now, timezone);
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1))
    .toISOString()
    .slice(0, 10);
};

const getStudentReminderRecipients = async ({ departmentId = null, userIds = null, dueTomorrowOnly = false, now = new Date() } = {}) => {
  const filters = [
    'u.telegram_chat_id IS NOT NULL',
    "LOWER(COALESCE(u.status, 'active')) = 'active'",
    "LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')",
    "LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active', 'published')",
    '(ed.department_id IS NULL OR ed.department_id = s.department_id)',
    `NOT EXISTS (
      SELECT 1 FROM student_evaluation_submissions ses
      WHERE ses.dispatch_id = ed.id
        AND LOWER(COALESCE(ses.status, 'pending')) IN ('submitted', 'completed', 'approved')
    )`,
  ];
  const params = [];

  if (departmentId != null) {
    filters.push('s.department_id = ?');
    params.push(departmentId);
  }
  if (userIds != null) {
    if (!userIds.length) return [];
    filters.push(`u.id IN (${userIds.map(() => '?').join(', ')})`);
    params.push(...userIds);
  }

  const [rows] = await pool.query(`
    SELECT u.id AS user_id, u.telegram_chat_id,
      TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS name,
      ed.id AS dispatch_id, ed.deadline AS dispatch_deadline,
      deadline_settings.deadline_at AS department_deadline,
      COALESCE(NULLIF(ed.course_name, ''), NULLIF(c.name, ''), NULLIF(ed.course_code, ''), 'Course') AS course_name,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', NULLIF(i.first_name, ''), NULLIF(i.last_name, ''))), ''),
        NULLIF(TRIM(CONCAT_WS(' ', NULLIF(la.first_name, ''), NULLIF(la.last_name, ''))), ''),
        NULLIF(TRIM(CONCAT_WS(' ', NULLIF(ed.target_first_name, ''), NULLIF(ed.target_last_name, ''))), ''),
        'Instructor'
      ) AS instructor_name
    FROM students s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN evaluation_dispatches ed ON ed.student_id = s.id OR (
      ed.student_id IS NULL
      AND ed.student_group IS NOT NULL
      AND LOWER(TRIM(REPLACE(REPLACE(ed.student_group, 'Section ', ''), 'section ', ''))) =
        LOWER(TRIM(REPLACE(REPLACE(COALESCE(s.section, ''), 'Section ', ''), 'section ', '')))
    )
    LEFT JOIN evaluation_deadline_settings deadline_settings ON deadline_settings.department_id = s.department_id
    LEFT JOIN course_assignments ca ON ca.id = ed.assignment_id
    LEFT JOIN courses c ON c.id = COALESCE(ed.course_id, ca.course_id)
    LEFT JOIN instructors i ON i.id = ca.instructor_id
    LEFT JOIN lab_assistants la ON la.id = ca.lab_assistant_id
    WHERE ${filters.join('\n      AND ')}
  `, params);

  const tomorrow = getTomorrowDateKey(now);
  const recipients = new Map();
  for (const row of rows) {
    const effectiveDeadline = getDateKey(row.dispatch_deadline) || getDateKey(row.department_deadline);
    const userId = Number(row.user_id);
    const recipient = recipients.get(userId) || {
      user_id: userId,
      telegram_chat_id: row.telegram_chat_id,
      name: row.name || 'ተማሪ',
      pending_count: 0,
      has_deadline_tomorrow: false,
      pending_courses: [],
      dispatch_ids: new Set(),
    };
    if (!recipient.dispatch_ids.has(Number(row.dispatch_id))) {
      recipient.dispatch_ids.add(Number(row.dispatch_id));
      recipient.pending_count += 1;
      const courseKey = `${row.course_name}|${row.instructor_name}`;
      if (!recipient.pending_courses.some((course) => course.key === courseKey)) {
        recipient.pending_courses.push({ key: courseKey, courseName: row.course_name, instructorName: row.instructor_name });
      }
    }
    recipient.has_deadline_tomorrow ||= effectiveDeadline === tomorrow;
    recipients.set(userId, recipient);
  }
  return [...recipients.values()]
    .filter((recipient) => !dueTomorrowOnly || recipient.has_deadline_tomorrow)
    .map(({ dispatch_ids, ...recipient }) => ({
      ...recipient,
      pending_courses: recipient.pending_courses.map(({ key, ...course }) => course),
    }));
};

const getDeadlineReminderRecipients = (now = new Date()) =>
  getStudentReminderRecipients({ dueTomorrowOnly: true, now });

const getPendingRecipients = async () => {
  const [students] = await pool.query(`
    SELECT u.id AS user_id, u.telegram_chat_id, u.language,
      TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))) AS name,
      COUNT(DISTINCT ed.id) AS pending_count, 'student' AS recipient_type
    FROM students s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN evaluation_dispatches ed ON ed.student_id = s.id
    LEFT JOIN student_evaluation_submissions ses ON ses.dispatch_id = ed.id
    WHERE u.telegram_chat_id IS NOT NULL
      AND LOWER(COALESCE(u.status, 'active')) = 'active'
      AND LOWER(COALESCE(ed.evaluation_type, 'student')) IN ('student', 'lab_assistant_student')
      AND LOWER(COALESCE(ed.status, 'pending')) IN ('pending', 'active')
      AND (ses.id IS NULL OR LOWER(COALESCE(ses.status, 'pending')) NOT IN ('submitted', 'completed', 'approved'))
    GROUP BY u.id, u.telegram_chat_id, u.language, s.first_name, s.last_name
  `);

  const [instructors] = await pool.query(`
    SELECT u.id AS user_id, u.telegram_chat_id, u.language, u.role,
      TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))) AS name,
      COUNT(DISTINCT pe.id) AS pending_count, 'instructor' AS recipient_type
    FROM instructors i
    INNER JOIN users u ON u.id = i.user_id
    INNER JOIN peer_evaluations pe ON pe.evaluator_id = i.id
    LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
    WHERE u.telegram_chat_id IS NOT NULL
      AND LOWER(COALESCE(u.status, 'active')) = 'active'
      AND LOWER(COALESCE(pe.status, 'pending')) IN ('pending', 'active')
      AND (pes.id IS NULL OR LOWER(COALESCE(pes.status, 'pending')) NOT IN ('submitted', 'completed', 'approved'))
    GROUP BY u.id, u.telegram_chat_id, u.language, u.role, i.first_name, i.last_name
  `);

  return [...students, ...instructors];
};

const sendPendingEvaluationReminders = async () => {
  const bot = getBotInstance();
  const recipients = await getPendingRecipients();
  let sent = 0;
  let skipped = 0;
  for (const recipient of recipients) {
    if (recipient.recipient_type !== 'instructor') continue;
    const pendingCount = Number(recipient.pending_count || 0);
    if (!recipient.telegram_chat_id || pendingCount <= 0) {
      skipped += 1;
      continue;
    }
    if (!bot) {
      skipped += 1;
      continue;
    }

    const message = `🔔 የእኩዮች ምዘና ማሳሰቢያ\n\nበIPES ${pendingCount} የእኩዮች ምዘናዎች ቀርተውዎታል። እባክዎ ከመጨረሻ ቀኑ በፊት ያጠናቁ።`;
    const dashboardUrl = getDashboardUrl(recipient.role);
    const options = dashboardUrl ? {
      reply_markup: {
        inline_keyboard: [[{
          text: String(recipient.language || '').toLowerCase() === 'en' ? '🌐 Open IPES' : '🌐 IPES ይክፈቱ',
          url: dashboardUrl,
        }]],
      },
    } : {};

    try {
      await bot.telegram.sendMessage(recipient.telegram_chat_id, message, options);
      sent += 1;
    } catch (error) {
      skipped += 1;
      console.error(`[TELEGRAM CRON] Reminder failed for user ${recipient.user_id}:`, error.message);
    }
  }

  const deadlineRecipients = await getDeadlineReminderRecipients();
  for (const recipient of deadlineRecipients) {
    const delivered = await sendTelegramReminder(
      recipient.telegram_chat_id,
      recipient.name,
      recipient.pending_count,
      recipient.pending_courses
    );
    if (delivered) sent += 1;
    else skipped += 1;
  }

  console.log(`[TELEGRAM CRON] Daily reminders complete: ${sent} sent, ${skipped} skipped; ${deadlineRecipients.length} students had forms due tomorrow.`);
  return { sent, skipped, deadlineRecipients: deadlineRecipients.length };
};

const startCronService = () => {
  if (reminderTask) return reminderTask;

  reminderTask = cron.schedule('0 9 * * *', () => {
    sendPendingEvaluationReminders().catch((error) => {
      console.error('[TELEGRAM CRON] Daily reminder job failed:', error.message);
    });
  }, { timezone: CRON_TIMEZONE });

  console.log(`[TELEGRAM CRON] Daily reminder job scheduled for 09:00 (${CRON_TIMEZONE}).`);
  return reminderTask;
};

const stopCronService = () => {
  if (!reminderTask) return;
  reminderTask.stop();
  reminderTask = null;
};

module.exports = {
  startCronService,
  stopCronService,
  sendPendingEvaluationReminders,
  getPendingRecipients,
  getDeadlineReminderRecipients,
  getStudentReminderRecipients,
  getDateKey,
  getTomorrowDateKey,
};