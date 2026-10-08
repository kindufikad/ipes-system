const pool = require('./config/db');

(async () => {
  try {
    // Find Melese's instructor ID
    const [[user]] = await pool.query(
      "SELECT id, user_id, first_name, last_name FROM instructors WHERE LOWER(CONCAT(first_name, ' ', last_name)) LIKE '%melese%' LIMIT 1"
    );
    console.log('\n=== INSTRUCTOR RECORD ===');
    console.log(user);

    if (user) {
      // Query directorate_evaluations
      const [dirs] = await pool.query(
        'SELECT id, dean_id, total_score, strengths, weaknesses, status, created_at FROM directorate_evaluations WHERE dean_id = ? LIMIT 1',
        [user.id]
      );
      console.log('\n=== DIRECTORATE_EVALUATIONS ===');
      console.log(dirs[0] || 'No records found');

      // Query evaluation_results
      const [evals] = await pool.query(
        'SELECT id, instructor_id, student_average, peer_average, dept_head_score, total_score, final_score FROM evaluation_results WHERE instructor_id = ? LIMIT 1',
        [user.id]
      );
      console.log('\n=== EVALUATION_RESULTS ===');
      console.log(evals[0] || 'No records found');

      // Query student evaluations
      const [[studentEval]] = await pool.query(
        `SELECT COALESCE(AVG(ses.score), 0) AS score
         FROM student_evaluation_submissions ses
         INNER JOIN evaluation_dispatches ed ON ed.id = ses.dispatch_id
         INNER JOIN course_assignments ca ON ca.course_id = ed.course_id AND ca.instructor_id = ?
         WHERE LOWER(ses.status) = 'submitted'`,
        [user.id]
      );
      console.log('\n=== STUDENT EVALUATIONS ===');
      console.log(studentEval);

      // Query peer evaluations
      const [[peerEval]] = await pool.query(
        `SELECT COALESCE(AVG(pes.score), 0) AS score
         FROM peer_evaluation_submissions pes
         INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
         WHERE pe.evaluatee_id = ? AND LOWER(pes.status) IN ('submitted', 'completed', 'approved')`,
        [user.id]
      );
      console.log('\n=== PEER EVALUATIONS ===');
      console.log(peerEval);

      // Check course assignments
      const [[courseCheck]] = await pool.query(
        'SELECT COUNT(*) AS course_count FROM course_assignments WHERE instructor_id = ?',
        [user.id]
      );
      console.log('\n=== COURSE ASSIGNMENTS ===');
      console.log(courseCheck);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
