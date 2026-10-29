require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { createBot } = require('../telegram-bot/src/bot');
const { BOT_TOKEN } = require('../telegram-bot/src/config');

let botInstance = null;

const startTelegramBot = () => {
  if (!BOT_TOKEN) {
    console.warn('[TELEGRAM] BOT_TOKEN is missing. Set TELEGRAM_BOT_TOKEN in the backend .env file.');
    return null;
  }

  if (botInstance) {
    return botInstance;
  }

  botInstance = createBot();
  return botInstance;
};

if (require.main === module) {
  startTelegramBot();
}

module.exports = { startTelegramBot };
