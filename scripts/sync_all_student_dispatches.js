const pool = require('../config/db');

const normalizeSection = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/^section\s+/i, '').trim();
};

(async () => {
  try {
    console.log('Syncing student dispatches for published course assignments...');

    const [assignments] = await pool.query(
      `SELECT ca.id AS assignment_id,
              ca.course_id,
              ca.department_id,
              ca.program_type,
              ca.year_level,
              ca.semester,
              ca.section,
              ca.academic_year,
              ca.is_student_published,
              c.name AS course_name
       FROM course_assignments ca
       LEFT JOIN courses c ON ca.course_id = c.id
       WHERE ca.is_student_published = 1`
    );

    for (const assignment of assignments) {
      const normalizedSection = normalizeSection(assignment.section);
      const [studentRows] = await pool.query(
        `SELECT s.id, s.user_id FROM students s
         WHERE s.department_id = ?
           AND (
             LOWER(TRIM(s.program_type)) = LOWER(TRIM(?))
             OR s.program_type IS NULL
             OR ? IS NULL
             OR ? = ''
             OR LOWER(?) = 'all'
           )
           AND (
             REGEXP_REPLACE(LOWER(s.year_level), '[^0-9]', '') = REGEXP_REPLACE(LOWER(?), '[^0-9]', '')
             OR s.year_level IS NULL
             OR ? IS NULL
             OR ? = ''
             OR LOWER(?) = 'all'
           )
           AND (
             LOWER(TRIM(s.semester)) = LOWER(TRIM(?))
             OR s.semester IS NULL
             OR ? IS NULL
             OR ? = ''
             OR LOWER(?) = 'all'
           )
           AND (
             LOWER(TRIM(s.section)) = LOWER(TRIM(?))
             OR s.section IS NULL
             OR ? IS NULL
             OR ? = ''
             OR LOWER(?) = 'all'
           )`,
        [
          assignment.department_id,
          assignment.program_type,
          assignment.program_type,
          assignment.program_type,
          assignment.program_type,
          assignment.year_level,
          assignment.year_level,
          assignment.year_level,
          assignment.year_level,
          assignment.year_level,
          assignment.semester,
          assignment.semester,
          assignment.semester,
          assignment.semester,
          assignment.semester,
          normalizedSection,
          normalizedSection,
          normalizedSection,
          normalizedSection,
          normalizedSection,
        ]
      );

      let finalStudents = studentRows;
      if (!finalStudents.length) {
        console.log(`No specific student matches for assignment ${assignment.assignment_id}. Falling back to all students in department ${assignment.department_id}.`);
        const [fallbackRows] = await pool.query(
          'SELECT id, user_id FROM students WHERE department_id = ?',
          [assignment.department_id]
        );
        finalStudents = fallbackRows;
      }

      const [existingDispatches] = await pool.query(
        `SELECT student_id FROM evaluation_dispatches WHERE assignment_id = ? AND course_id = ? AND status = 'pending'`,
        [assignment.assignment_id, assignment.course_id]
      );
      const existingStudentIds = new Set(existingDispatches.map((row) => row.student_id));

      let insertedCount = 0;
      for (const student of finalStudents) {
        if (existingStudentIds.has(student.id)) continue;

        await pool.query(
          `INSERT INTO evaluation_dispatches
            (assignment_id, template_id, student_id, student_identifier, course_id, course_name, academic_year, semester, year_level, student_group, created_by, payload, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            assignment.assignment_id,
            null,
            student.id,
            null,
            assignment.course_id,
            assignment.course_name || '',
            assignment.academic_year,
            assignment.semester,
            assignment.year_level,
            'student',
            null,
            JSON.stringify({ source: 'sync_all_student_dispatches' }),
            'pending',
          ]
        );
        insertedCount += 1;
      }

      console.log(`Assignment ${assignment.assignment_id}: inserted ${insertedCount} missing dispatches, matched ${finalStudents.length} students.`);
    }

    const [userRows] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', ['fikiradis']);
    if (!userRows.length) {
      throw new Error('User fikiradis not found');
    }
    const userId = userRows[0].id;

    const [studentRows] = await pool.query('SELECT id FROM students WHERE user_id = ? LIMIT 1', [userId]);
    if (!studentRows.length) {
      throw new Error('Student record for fikiradis not found');
    }
    const studentId = studentRows[0].id;

    const [pendingRows] = await pool.query(
      `SELECT ed.* FROM evaluation_dispatches ed
       WHERE ed.student_id = ?
         AND ed.status = 'pending'
       ORDER BY ed.created_at DESC`,
      [studentId]
    );

    console.log('Pending dispatches for fikiradis:', JSON.stringify(pendingRows, null, 2));
    console.log('Sync complete.');
  } catch (error) {
    console.error('Sync script error:', error.sqlMessage || error.message || error);
  } finally {
    pool.end();
  }
})();