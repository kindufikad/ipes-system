const nodemailer = require('nodemailer');
const crypto = require('crypto');

const SMTP_SETTING_KEYS = {
  host: 'smtp_host',
  port: 'smtp_port',
  senderEmail: 'smtp_sender_email',
  appPassword: 'smtp_app_password',
};

const getEncryptionKey = () => crypto.createHash('sha256')
  .update(process.env.EMAIL_SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'ipes-email-settings-key-change-me')
  .digest();

const encryptSmtpPassword = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptSmtpPassword = (value) => {
  const [version, ivValue, tagValue, encryptedValue] = String(value || '').split(':').slice(1);
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    const error = new Error('Stored SMTP app password is invalid.');
    error.code = 'EMAIL_CONFIG_INVALID';
    throw error;
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    const error = new Error('Unable to decrypt stored SMTP app password. Check EMAIL_SETTINGS_ENCRYPTION_KEY.');
    error.code = 'EMAIL_CONFIG_INVALID';
    throw error;
  }
};

const getEmailConfig = () => ({
  host: process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 587),
  secure: String(process.env.EMAIL_SECURE || process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  user: process.env.EMAIL_USER || process.env.SMTP_USER || '',
  pass: (process.env.EMAIL_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, ''),
  from: process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.EMAIL_USER || process.env.SMTP_USER || '',
});

const createEmailTransporter = (configOverride) => {
  const config = configOverride || getEmailConfig();
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

const getEmailConfigFromDatabase = async (pool) => {
  const keys = Object.values(SMTP_SETTING_KEYS);
  const placeholders = keys.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (${placeholders})`,
    keys
  );
  const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  const user = String(settings[SMTP_SETTING_KEYS.senderEmail] || '').trim().toLowerCase();
  const pass = decryptSmtpPassword(settings[SMTP_SETTING_KEYS.appPassword]);
  const port = Number(settings[SMTP_SETTING_KEYS.port] || 587);
  const config = {
    host: String(settings[SMTP_SETTING_KEYS.host] || 'smtp.gmail.com').trim(),
    port,
    secure: port === 465,
    user,
    pass,
    from: user,
  };
  if (!user || !pass || !config.host || !Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('SMTP settings are incomplete.');
    error.code = 'EMAIL_CONFIG_MISSING';
    throw error;
  }
  return config;
};

const verifyEmailTransporter = async (transporter) => {
  await transporter.verify();
};

module.exports = {
  createEmailTransporter,
  decryptSmtpPassword,
  encryptSmtpPassword,
  getEmailConfigFromDatabase,
  SMTP_SETTING_KEYS,
  verifyEmailTransporter,
};
