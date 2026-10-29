const pool = require('./config/db');

(async () => {
  try {
    // Check all tables for evaluation data
    const [tables] = await pool.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    const evalTables = tableNames.filter(t => 
      t.includes('eval') || t.includes('dean') || t.includes('results')
    );

    console.log('\n=== CHECKING ALL EVALUATION TABLES FOR INSTRUCTOR ID 40 ===\n');

    for (const tbl of evalTables) {
      try {
        const [rows] = await pool.query(
          `SELECT * FROM \`${tbl}\` WHERE instructor_id = 40 OR dean_id = 40 LIMIT 3`
        );
        if (rows.length > 0) {
          console.log(`\n${tbl}: FOUND ${rows.length} records`);
          console.log(rows);
        }
      } catch (e) {
        // Ignore tables without instructor_id or dean_id columns
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
