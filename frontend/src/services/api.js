const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 1. የ Aiven MySQL Connection Pool ማዋቀር (Render Environment Variables የሚጠቀም)
const poolConfig = {
  host: process.env.DB_HOST || 'mysql-1d1ca8c7-kindufikad075-0101.b.aivencloud.com',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 24479,
  user: process.env.DB_USER || 'avnadmin',
  password: process.env.DB_PASSWORD, // ከ Render Environment Variables ይወስዳል
  database: process.env.DB_NAME || 'defaultdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true, // <--- በጣም አስፈላጊ: የ SQL ስክሪፕቶችን በአንድ ላይ ለማንበብ
  ssl: {
    rejectUnauthorized: false // Aiven SSL እንዲቀበል ያደርጋል
  }
};

const pool = mysql.createPool(poolConfig);

// 2. ዳታቤዙን በራስ-ሰር የሚያስነብበው እና ቴብሎቹን የሚፈጥረው ተግባር (Function)
async function initializeDatabase(dbPool) {
  try {
    const sqlFilePath = path.join(__dirname, 'database.sql');
    if (fs.existsSync(sqlFilePath)) {
      console.log('database.sql file found. Checking/initializing tables...');
      const sql = fs.readFileSync(sqlFilePath, 'utf8');
      await dbPool.query(sql);
      console.log('Database tables initialized successfully!');
    } else {
      console.log('database.sql file not found in directory:', __dirname);
    }
  } catch (err) {
    console.error('Database initialization error:', err.message);
  }
}

// 3. ሰርቨሩን ማስጀመር እና ቴብሎቹን ማዘጋጀት
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // ከ Aiven MySQL ጋር መገናኘቱን መፈተሽ
    const connection = await pool.getConnection();
    console.log('Connected to Aiven MySQL database successfully!');
    connection.release();

    // ቴብሎቹን በራስ-ሰር መጫን
    await initializeDatabase(pool);

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to the database. API will start without DB access:', error.message);
    
    // ዳታቤዝ ቢያስቸግርም ሰርቨሩ እንዳይዘጋ (Crash እንዳያደርግ)
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT} (Without DB access)`);
    });
  }
}

startServer();

module.exports = pool;