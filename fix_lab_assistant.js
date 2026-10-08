const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ipes_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const connection = await pool.getConnection();

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash('password123', 10);

    // Update user
    const [result] = await connection.execute(
      'UPDATE users SET password_hash = ?, is_first_login = 0 WHERE email = ?',
      [passwordHash, 'demsew@mkau.edu.et']
    );

    console.log('✓ User password hashed with bcrypt');
    console.log('✓ is_first_login set to FALSE');

    // Verify update
    const [rows] = await connection.execute(
      'SELECT id, email, role, is_first_login FROM users WHERE email = ?',
      ['demsew@mkau.edu.et']
    );

    console.log('\nUpdated user:', rows[0]);
    console.log('\nLogin Instructions:');
    console.log('Email: demsew@mkau.edu.et');
    console.log('Password: password123');
    console.log('Expected redirect: /lab-assistant/dashboard');

    connection.release();
    pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
