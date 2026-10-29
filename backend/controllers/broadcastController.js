const pool = require('../config/db');
const { createEmailTransporter, verifyEmailTransporter } = require('../services/emailService');
const { BOT_URL } = require('../telegram-bot/src/config');

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character]);

const buildInvitationEmail = ({ name, identifier }) => {
  const safeName = escapeHtml(name || 'IPES User');
  const safeIdentifier = escapeHtml(identifier || '');
  const botUrl = BOT_URL;

  return {
    subject: '🤖 IPES System: Connect to Telegram Bot',
    text: `Dear ${name || 'IPES User'} (${identifier || ''}),\n\nPlease connect your IPES account to our official Telegram Bot to receive real-time notifications about pending instructor evaluations and final exam eligibility status.\n\nLaunch the bot: ${botUrl}\n\nSteps after opening:\n1. Press START\n2. Click "📱 Share Contact / ስልክ ቁጥር አጋራ"`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 640px;">
        <p>Dear ${safeName} (${safeIdentifier}),</p>
        <p>Please connect your IPES account to our official Telegram Bot to receive real-time notifications about pending instructor evaluations and final exam eligibility status.</p>
        <p>👉 <a href="${botUrl}">Click here to launch the bot</a></p>
        <p>Steps after opening:</p>
        <ol>
          <li>Press START</li>
          <li>Click "📱 Share Contact / ስልክ ቁጥር አጋራ"</li>
        </ol>
      </div>
    `,
  };
};

const sendBotBroadcast = async (_req, res) => {
  let emailTransport;
  try {
    const [recipients] = await pool.query(`
      SELECT u.id AS user_id, TRIM(u.email) AS email,
        LOWER(TRIM(COALESCE(u.role, ''))) AS role,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(i.first_name, ''), ' ', COALESCE(i.last_name, ''))), ''),
          NULLIF(TRIM(CONCAT(COALESCE(la.first_name, ''), ' ', COALESCE(la.last_name, ''))), ''),
          u.email
        ) AS full_name,
        CASE
          WHEN LOWER(COALESCE(u.role, '')) = 'student' THEN COALESCE(s.student_id, u.email)
          ELSE COALESCE(u.email, i.employee_id, la.employee_id)
        END AS recipient_identifier
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN instructors i ON i.user_id = u.id
      LEFT JOIN lab_assistants la ON la.user_id = u.id
      WHERE LOWER(COALESCE(u.status, 'active')) = 'active'
        AND NULLIF(TRIM(u.email), '') IS NOT NULL
        AND LOWER(COALESCE(u.role, '')) IN (
          'student', 'instructor', 'dept_head', 'department_head', 'college_dean', 'dean',
          'academic_directorate', 'academic_director', 'directorate', 'lab_assistant', 'admin', 'system_admin'
        )
    `);

    const uniqueRecipients = [...new Map(recipients.map((recipient) => [recipient.email.toLowerCase(), recipient])).values()];
    if (!uniqueRecipients.length) {
      return res.status(200).json({ success: true, message: 'No active student or staff email addresses were found.', sent: 0, failed: 0 });
    }

    emailTransport = createEmailTransporter();
    await verifyEmailTransporter(emailTransport.transporter);
    let sent = 0;
    const failures = [];

    for (const recipient of uniqueRecipients) {
      const email = buildInvitationEmail({ name: recipient.full_name, identifier: recipient.recipient_identifier });
      try {
        await emailTransport.transporter.sendMail({
          from: emailTransport.config.from,
          to: recipient.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
        sent += 1;
      } catch (error) {
        console.error(`Telegram bot broadcast failed for user ${recipient.user_id}:`, error.message);
        failures.push({ user_id: recipient.user_id, email: recipient.email });
      }
    }

    return res.status(failures.length ? 207 : 200).json({
      success: failures.length === 0,
      message: `Telegram bot invitation sent to ${sent} recipient(s).`,
      sent,
      failed: failures.length,
      failures,
    });
  } catch (error) {
    console.error('Unable to send Telegram bot broadcast:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to send the Telegram bot broadcast.' });
  } finally {
    emailTransport?.transporter.close();
  }
};

module.exports = { sendBotBroadcast, buildInvitationEmail };