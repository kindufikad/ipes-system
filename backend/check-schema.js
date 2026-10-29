const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root123',
    database: 'ipes_db',
    connectionLimit: 5,
  });

  try {
    const [columns] = await pool.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'evaluation_dispatches'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('All columns in evaluation_dispatches:');
    columns.forEach(col => {
      if (col.COLUMN_NAME.includes('target') || col.COLUMN_NAME.includes('template')) {
        console.log(`  *** ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`);
      } else {
        console.log(`  ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`);
      }
    });
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
