const express = require('express');
const cors = require('cors');
const telegramRoutes = require('./routes/telegramRoutes');

const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'IPES Telegram Bot service is healthy.',
    });
  });

  app.use('/api/telegram', telegramRoutes);

  return app;
};

module.exports = {
  createApp,
};
