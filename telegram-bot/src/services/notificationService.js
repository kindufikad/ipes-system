const pool = require('../../../config/db');
const { getDashboardUrl } = require('../config');

let botInstance = null;

const setBotInstance = (bot) => {
  botInstance = bot;
};

const getBotInstance = () => botInstance;

const sendTelegramNotification = async (userId, message) => {
  if (!botInstance) {
    return { success: false, reason: 'telegram_bot_not_initialized' };
  }

  const [rows] = await pool.query(
    'SELECT telegram_chat_id, role, language FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  const recipient = rows[0];
  const chatId = recipient?.telegram_chat_id;
  if (!chatId) {
    return { success: false, reason: 'telegram_chat_not_linked' };
  }

  const options = {
    parse_mode: 'HTML',
  };
  const dashboardUrl = getDashboardUrl(recipient.role);
  if (dashboardUrl) {
    options.reply_markup = {
      inline_keyboard: [[{
        text: String(recipient.language || '').toLowerCase() === 'en' ? 'Open IPES' : 'IPES ይክፈቱ',
        url: dashboardUrl,
      }]],
    };
  }

  await botInstance.telegram.sendMessage(chatId, message, options);

  return { success: true, chatId };
};

module.exports = {
  setBotInstance,
  getBotInstance,
  sendTelegramNotification,
};
