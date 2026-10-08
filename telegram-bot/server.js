require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const path = require('path');
const { createApp } = require('./src/app');
const { createBot } = require('./src/bot');

const { BOT_TOKEN, TELEGRAM_PORT } = require('./src/config');

if (!BOT_TOKEN) {
  console.warn('BOT_TOKEN is missing. Please set TELEGRAM_BOT_TOKEN in your environment variables.');
}

const app = createApp();
const bot = createBot();

app.listen(TELEGRAM_PORT, () => {
  console.log(`IPES Telegram Bot server running on port ${TELEGRAM_PORT}`);
  console.log('Bot status:', BOT_TOKEN ? 'initialized' : 'not configured');
});

module.exports = { app, bot };
