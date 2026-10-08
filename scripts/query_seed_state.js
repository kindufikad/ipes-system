const pool = require('../config/db');

(async () => {
  try {
    const [users] = await pool.query('SELECT id, username, role FROM users WHERE username IN (?,?)', ['test.student1', 'test.instructor1']);
    console.log('users:', users);

    const studentUser = users.find((u) => u.username === 'test.student1');
    if (studentUser) {
      const [students] = await pool.query('SELECT * FROM students WHERE user_id = ?', [studentUser.id]);
      console.log('student profile:', students);
    }

    const [instructors] = await pool.query('SELECT * FROM instructors WHERE user_id = ?', [users.find((u) => u.username === 'test.instructor1')?.id || 0]);
    console.log('instructor profile:', instructors);

    const [dispatches] = await pool.query('SELECT * FROM evaluation_dispatches WHERE student_id = ? ORDER BY created_at DESC LIMIT 20', [users.find((u) => u.username === 'test.student1')?.id || 0]);
    console.log('student dispatches:', dispatches);

    const [peerEvals] = await pool.query('SELECT * FROM peer_evaluations ORDER BY created_at DESC LIMIT 20');
    console.log('peer evaluations:', peerEvals);

    const [studentSubmissions] = await pool.query('SELECT * FROM student_evaluation_submissions ORDER BY created_at DESC LIMIT 20');
    console.log('student submissions:', studentSubmissions);

    const [peerSubmissions] = await pool.query('SELECT * FROM peer_evaluation_submissions ORDER BY created_at DESC LIMIT 20');
    console.log('peer submissions:', peerSubmissions);

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
