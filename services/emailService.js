const nodemailer = require('nodemailer');

const getEmailConfig = () => ({
  host: process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 587),
  secure: String(process.env.EMAIL_SECURE || process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  user: process.env.EMAIL_USER || process.env.SMTP_USER || '',
  pass: (process.env.EMAIL_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, ''),
  from: process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.EMAIL_USER || process.env.SMTP_USER || '',
});

const createEmailTransporter = () => {
  const config = getEmailConfig();
  const missingSettings = [];
  if (!config.host) missingSettings.push('EMAIL_HOST');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) missingSettings.push('EMAIL_PORT');
  if (!config.user) missingSettings.push('EMAIL_USER');
  if (!config.pass) missingSettings.push('EMAIL_PASS');
  if (!config.from) missingSettings.push('EMAIL_FROM');
  if (missingSettings.length) {
    const error = new Error(`Email service is not configured. Missing: ${missingSettings.join(', ')}`);
    error.code = 'EMAIL_CONFIG_MISSING';
    throw error;
  }

  return {
    config,
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    }),
  };
};

const verifyEmailTransporter = async (transporter) => {
  await transporter.verify();
};

module.exports = { createEmailTransporter, verifyEmailTransporter };
