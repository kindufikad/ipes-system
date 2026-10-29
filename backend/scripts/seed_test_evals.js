const pool = require('../config/db');

(async () => {
  try {
    const studentUsername = 'test.student1';
    const instructorUsername = 'test.instructor1';

    const [userRows] = await pool.query('SELECT id, username FROM users WHERE username IN (?, ?) ', [studentUsername, instructorUsername]);
    const users = userRows.reduce((acc, row) => { acc[row.username] = row; return acc; }, {});
    if (!users[studentUsername]) throw new Error('Student user not found: ' + studentUsername);
    if (!users[instructorUsername]) throw new Error('Instructor user not found: ' + instructorUsername);

    const studentUserId = users[studentUsername].id;
    const instructorUserId = users[instructorUsername].id;

    const [studentRows] = await pool.query('SELECT id, department_id FROM students WHERE user_id = ? LIMIT 1', [studentUserId]);
    if (!studentRows.length) throw new Error('Student profile not found for user');
    const student = studentRows[0];

    const [instructorRows] = await pool.query('SELECT id, user_id FROM instructors WHERE user_id = ? LIMIT 1', [instructorUserId]);
    if (!instructorRows.length) throw new Error('Instructor profile not found for user');
    const instructor = instructorRows[0];

    // ensure a test course exists
    const courseCode = 'TEST101';
    const courseName = 'Test Course for Automation';
    let courseId;
    const [courses] = await pool.query('SELECT id FROM courses WHERE code = ? LIMIT 1', [courseCode]);
    if (courses.length) {
      courseId = courses[0].id;
    } else {
      const [result] = await pool.query('INSERT INTO courses (code, name, department_id) VALUES (?, ?, ?)', [courseCode, courseName, student.department_id || null]);
      courseId = result.insertId;
      console.log('Inserted course id', courseId);
    }

    // create course_assignment published to students
    const [existingAssign] = await pool.query('SELECT id FROM course_assignments WHERE course_id = ? AND department_id = ? AND instructor_id = ? LIMIT 1', [courseId, student.department_id || null, instructor.id]);
    let assignmentId;
    if (existingAssign.length) {
      assignmentId = existingAssign[0].id;
      console.log('Existing assignment', assignmentId);
    } else {
      const [res] = await pool.query('INSERT INTO course_assignments (course_id, department_id, instructor_id, is_student_published, is_peer_published, created_at) VALUES (?, ?, ?, ?, ?, NOW())', [courseId, student.department_id || null, instructor.id, 1, 1]);
      assignmentId = res.insertId;
      console.log('Created assignment', assignmentId);
    }

    // create evaluation_dispatch for student
    const [existingDispatch] = await pool.query('SELECT id FROM evaluation_dispatches WHERE student_id = ? AND course_id = ? AND status = ? LIMIT 1', [student.id, courseId, 'pending']);
    let dispatchId;
    if (existingDispatch.length) {
      dispatchId = existingDispatch[0].id;
      console.log('Existing dispatch', dispatchId);
      await pool.query('UPDATE evaluation_dispatches SET course_code = ? WHERE id = ?', [courseCode, dispatchId]);
    } else {
      const [res] = await pool.query('INSERT INTO evaluation_dispatches (template_id, student_id, student_identifier, course_id, course_code, course_name, academic_year, semester, year_level, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())', [null, student.id, null, courseId, courseCode, courseName, '2026', '1', '1', 'pending']);
      dispatchId = res.insertId;
      console.log('Created dispatch', dispatchId);
    }

    // create peer_evaluation for instructor to evaluate (assign to instructorUserId)
    // evaluatee - use instructor.id (the same instructor) or find another instructor
    const evaluateeId = instructor.id;
    const [existingPeer] = await pool.query('SELECT id FROM peer_evaluations WHERE evaluator_id = ? AND evaluatee_id = ? AND course_id = ? LIMIT 1', [instructor.id, evaluateeId, courseId]);
    if (existingPeer.length) {
      console.log('Existing peer evaluation', existingPeer[0].id);
    } else {
      const [res] = await pool.query('INSERT INTO peer_evaluations (evaluator_id, evaluatee_id, course_id, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())', [instructor.id, evaluateeId, courseId, '2026-08-30', 'pending']);
      console.log('Created peer evaluation', res.insertId);
    }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err.message || err);
    process.exit(1);
  }
})();
