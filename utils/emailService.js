const nodemailer = require('nodemailer');
const crypto = require('crypto');

const SMTP_SETTING_KEYS = {
  host: 'SMTP_HOST',
  port: 'SMTP_PORT',
  senderEmail: 'SMTP_USER',
  appPassword: 'SMTP_PASS',
  legacyHost: 'smtp_host',
  legacyPort: 'smtp_port',
  legacySenderEmail: 'smtp_sender_email',
  legacyAppPassword: 'smtp_app_password',
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
    error.code = 'EMAIL_CONFIG_DECRYPTION_FAILED';
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
  const baseConfig = configOverride || getEmailConfig();
  const config = {
    ...baseConfig,
    pass: String(baseConfig.pass || '').replace(/\s+/g, ''),
  };
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
  let rows;
  try {
    [rows] = await pool.query(
      `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (${placeholders})`,
      keys
    );
  } catch (cause) {
    const error = new Error(cause?.code === 'ER_NO_SUCH_TABLE'
      ? 'The system_settings table is missing. Run the database migrations before sending email.'
      : 'Unable to read SMTP settings from the database.');
    error.code = cause?.code === 'ER_NO_SUCH_TABLE' ? 'EMAIL_CONFIG_MISSING' : 'EMAIL_CONFIG_UNAVAILABLE';
    error.cause = cause;
    throw error;
  }
  const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  const user = String(settings[SMTP_SETTING_KEYS.senderEmail] || settings[SMTP_SETTING_KEYS.legacySenderEmail] || '').trim().toLowerCase();
  const appPasswordKey = settings[SMTP_SETTING_KEYS.appPassword]
    ? SMTP_SETTING_KEYS.appPassword
    : SMTP_SETTING_KEYS.legacyAppPassword;
  const storedPassword = String(settings[appPasswordKey] || '');
  let pass = '';
  if (storedPassword.startsWith('enc:v1:')) {
    pass = decryptSmtpPassword(storedPassword);
  } else if (storedPassword) {
    const legacyPassword = storedPassword.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9]{16}$/.test(legacyPassword)) {
      const error = new Error('Stored SMTP app password is not a valid 16-character Google App Password.');
      error.code = 'EMAIL_CONFIG_INVALID';
      throw error;
    }
    const encryptedPassword = encryptSmtpPassword(legacyPassword);
    try {
      await pool.query(
        'UPDATE system_settings SET setting_value = ? WHERE setting_key = ? AND setting_value = ?',
        [encryptedPassword, appPasswordKey, storedPassword]
      );
      pass = legacyPassword;
    } catch (cause) {
      const error = new Error('Unable to secure the stored SMTP app password. Re-save the email service settings.');
      error.code = 'EMAIL_CONFIG_UNAVAILABLE';
      error.cause = cause;
      throw error;
    }
  }
  const port = Number(settings[SMTP_SETTING_KEYS.port] || settings[SMTP_SETTING_KEYS.legacyPort] || 587);
  const config = {
    host: String(settings[SMTP_SETTING_KEYS.host] || settings[SMTP_SETTING_KEYS.legacyHost] || 'smtp.gmail.com').trim(),
    port,
    secure: port === 465,
    user,
    pass,
    from: user,
  };
  const missingSettings = [];
  if (!config.host) missingSettings.push(SMTP_SETTING_KEYS.host);
  if (!Number.isInteger(port) || port < 1 || port > 65535) missingSettings.push(SMTP_SETTING_KEYS.port);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) missingSettings.push(SMTP_SETTING_KEYS.senderEmail);
  if (!pass) missingSettings.push(SMTP_SETTING_KEYS.appPassword);
  if (config.host.toLowerCase() === 'smtp.gmail.com' && !/^[A-Za-z0-9]{16}$/.test(pass)) {
    const error = new Error('The Gmail App Password must contain 16 letters or digits.');
    error.code = 'EMAIL_CONFIG_INVALID';
    throw error;
  }
  if (missingSettings.length) {
    const error = new Error(`Missing required SMTP settings: ${missingSettings.join(', ')}.`);
    error.code = 'EMAIL_CONFIG_MISSING';
    throw error;
  }
  return config;
};

const getEmailDeliveryErrorCode = (error) => {
  const responseCode = Number(error?.responseCode || 0);
  const errorMessage = String(error?.message || '').toLowerCase();
  if ([421, 450, 451, 452, 454].includes(responseCode)
    || /rate.?limit|too many (?:requests|attempts|messages)|quota exceeded|temporarily deferred/.test(errorMessage)) {
    return 'EMAIL_RATE_LIMITED';
  }
  if (error?.code === 'EMAIL_CONFIG_DECRYPTION_FAILED') return 'EMAIL_CONFIG_DECRYPTION_FAILED';
  if (error?.code === 'EMAIL_CONFIG_MISSING') return 'EMAIL_CONFIG_MISSING';
  if (error?.code === 'EMAIL_CONFIG_INVALID') return 'EMAIL_CONFIG_INVALID';
  if (error?.code === 'EAUTH' || [534, 535].includes(responseCode)) {
    return 'EMAIL_AUTH_FAILED';
  }
  if (error?.code === 'EMAIL_CONFIG_UNAVAILABLE') return 'EMAIL_CONFIG_UNAVAILABLE';
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED'].includes(error?.code)) {
    return 'EMAIL_PROVIDER_UNAVAILABLE';
  }
  return 'EMAIL_DELIVERY_FAILED';
};

const logEmailDeliveryFailure = (error, context = 'email delivery') => {
  console.error(`[emailService] ${context} failed`, {
    category: getEmailDeliveryErrorCode(error),
    code: error?.code || 'UNKNOWN',
    responseCode: Number(error?.responseCode) || null,
  });
};

const verifyEmailTransporter = async (transporter) => {
  await transporter.verify();
};

module.exports = {
  createEmailTransporter,
  decryptSmtpPassword,
  encryptSmtpPassword,
  getEmailConfigFromDatabase,
  getEmailDeliveryErrorCode,
  logEmailDeliveryFailure,
  SMTP_SETTING_KEYS,
  verifyEmailTransporter,
};