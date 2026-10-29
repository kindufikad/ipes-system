const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const configuredHost = process.env.DB_HOST || 'localhost';

const pool = mysql.createPool({
  host: configuredHost === 'localhost' ? '127.0.0.1' : configuredHost,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ipes_db',
  port: Number(process.env.DB_PORT || 3306),
  connectTimeout: 5000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

pool.getConnection()
  .then((connection) => {
    console.log('Connected to MySQL database successfully.');
    connection.release();
  })
  .catch((error) => {
    const details = Array.isArray(error.errors)
      ? error.errors.map((item) => `${item.code || 'ERROR'} ${item.address || ''}:${item.port || ''}`.trim()).join(', ')
      : `${error.code || 'ERROR'} ${error.message || ''}`.trim();
    console.error(`MySQL database connection failed: ${details}`);
  });

pool.on('error', (error) => {
  console.error(`MySQL pool error: ${error.message}`);
});

module.exports = pool;
