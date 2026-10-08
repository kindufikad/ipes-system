const axios = require('axios');

const escapeMarkdown = (value) => String(value || '').replace(/([_*[\]`])/g, '\\$1');

const sendTelegramReminder = async (chatId, studentName, remainingCount, pendingCourses = []) => {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramBotToken || !chatId) {
    console.warn('[TELEGRAM] Urgent reminder skipped because token or chat ID is missing.');
    return false;
  }

  const courseListText = pendingCourses.length > 0
    ? '\n📌 *የቀሩት ኮርሶች:*\n' + pendingCourses.map((course) =>
      `• ${escapeMarkdown(course.courseName)} - ${escapeMarkdown(course.instructorName)}`
    ).join('\n')
    : '';

  const message = `🚨 *አስቸኳይ ማስታወቂያ - IPES System* 🚨\n\n` +
    `ሰላም *${escapeMarkdown(studentName || 'ተማሪ')}*፣\n` +
    `የመምህራን ምዘና (Evaluation Form) ሙሉ በሙሉ ካልሞላችሁ የመጨረሻ ፈተና (Final Exam) ላይ የማትቀመጡ መሆኑን እናሳውቃለን!\n\n` +
    `📌 *የቀሩብዎት ምዘናዎች:* ${Number(remainingCount) || 0}` +
    `${courseListText}\n\n` +
    `እባክዎትን አሁኑኑ ወደ ሲስተሙ በመግባት ምዘናዎትን ያጠናቁ::`;

  try {
    await axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    });
    return true;
  } catch (error) {
    console.error(`[TELEGRAM] Failed to send urgent reminder to ${chatId}:`, error.message);
    return false;
  }
};

module.exports = { sendTelegramReminder };