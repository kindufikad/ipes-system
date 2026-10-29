const pool = require('../config/db');

const batchAssignMatrix = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { programType, yearLevel, semester, section, assignments } = req.body || {};
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ message: 'Assignments must be a non-empty array.' });
    }

    if (!programType || !yearLevel || !semester || !section) {
      return res.status(400).json({ message: 'Filters and at least one assigned course are required.' });
    }

    const rows = assignments
      .filter((assignment) => assignment?.staffId || assignment?.instructorId)
      .map((assignment) => ({
        courseId: Number(assignment.courseId),
        staffId: Number(assignment.staffId || assignment.instructorId),
        role: String(assignment.role || assignment.staffRole || 'instructor').trim().toLowerCase(),
      }))
      .filter((assignment) => assignment.courseId > 0 && assignment.staffId > 0);

    if (!rows.length) {
      return res.status(400).json({ message: 'At least one valid course assignment is required.' });
    }

    let callerDepartmentId = Number(req.user?.department_id || req.user?.departmentId || 0);
    if (!Number.isInteger(callerDepartmentId) || callerDepartmentId <= 0) {
      const [[caller]] = await connection.query(
        `SELECT COALESCE(i.department_id, s.department_id) AS department_id
         FROM users u
         LEFT JOIN instructors i ON i.user_id = u.id
         LEFT JOIN students s ON s.user_id = u.id
         WHERE u.id = ? LIMIT 1`,
        [req.user?.id]
      );
      callerDepartmentId = Number(caller?.department_id || 0);
    }
    await connection.beginTransaction();

    for (const row of rows) {
      const academicYear = String(req.body.academicYear || '2026').trim();
      const normalizedSemester = String(semester).trim();
      const normalizedYearLevel = String(yearLevel).trim();
      const normalizedSection = String(section).trim();
      const normalizedProgramType = String(programType).trim();
      const normalizedRole = ['instructor', 'lab_assistant'].includes(row.role) ? row.role : 'instructor';
      const [[course]] = await connection.query(
        'SELECT id, department_id FROM courses WHERE id = ? LIMIT 1',
        [row.courseId]
      );
      const targetPersonQuery = normalizedRole === 'lab_assistant'
        ? `SELECT la.id, la.department_id
           FROM lab_assistants la
           INNER JOIN users u ON u.id = la.user_id
           WHERE (la.id = ? OR la.user_id = ?)
             AND LOWER(COALESCE(u.role, 'lab_assistant')) = 'lab_assistant'
             AND LOWER(COALESCE(u.status, 'active')) = 'active'
           LIMIT 1`
        : `SELECT i.id, i.department_id
           FROM instructors i
           INNER JOIN users u ON u.id = i.user_id
           WHERE (i.id = ? OR i.user_id = ?)
             AND LOWER(COALESCE(u.role, 'instructor')) IN ('instructor', 'dept_head', 'college_dean')
             AND LOWER(COALESCE(u.status, 'active')) = 'active'
           LIMIT 1`;
      const [[targetPerson]] = await connection.query(targetPersonQuery, [row.staffId, row.staffId]);

      if (!course || !targetPerson) {
        throw new Error(`Invalid course or staff selection for course ${row.courseId}.`);
      }
      if (req.user?.role === 'dept_head' && Number(course.department_id) !== callerDepartmentId) {
        throw new Error('Department Heads may only assign courses from their department.');
      }

      const [[existingAssignment]] = await connection.query(
        `SELECT id
         FROM course_assignments
         WHERE department_id = ? AND course_id = ? AND academic_year = ?
           AND semester = ? AND year_level = ? AND section = ? AND program_type = ?
         LIMIT 1`,
        [course.department_id, course.id, academicYear, normalizedSemester, normalizedYearLevel, normalizedSection, normalizedProgramType]
      );
      if (existingAssignment) {
        const conflict = new Error(`Course ${row.courseId} is already assigned for this section, semester, year, and program.`);
        conflict.statusCode = 409;
        throw conflict;
      }

      const [[existingStaffAssignment]] = await connection.query(
        `SELECT id
         FROM course_assignments
         WHERE department_id = ?
           AND course_id = ?
           AND academic_year = ?
           AND semester = ?
           AND year_level = ?
           AND section = ?
           AND program_type = ?
           AND staff_id = ?
           AND assigned_role = ?
         LIMIT 1`,
        [course.department_id, course.id, academicYear, normalizedSemester, normalizedYearLevel, normalizedSection, normalizedProgramType, targetPerson.id, normalizedRole]
      );
      if (existingStaffAssignment) {
        const conflict = new Error(`This ${normalizedRole.replace('_', ' ')} is already assigned to course ${row.courseId} for the selected section and term.`);
        conflict.statusCode = 409;
        throw conflict;
      }

      const selectedInstructorId = normalizedRole === 'lab_assistant' ? null : targetPerson.id;
      await connection.query(
        `INSERT INTO course_assignments
          (department_id, course_id, instructor_id, staff_id, assigned_role, section, academic_year, semester, year_level, program_type, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Assigned')`,
        [
          course.department_id,
          course.id,
          selectedInstructorId,
          targetPerson.id,
          normalizedRole,
          normalizedSection,
          academicYear,
          normalizedSemester,
          normalizedYearLevel,
          normalizedProgramType,
        ]
      );
    }

    await connection.commit();
    return res.status(201).json({ success: true, assignedCount: rows.length });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Matrix assignment rollback failed:', rollbackError);
    }
    console.error('Matrix assignment failed:', {
      message: error.message,
      code: error.code,
      sql: error.sql,
      stack: error.stack,
      body: req.body,
      userId: req.user?.id,
    });
    return res.status(error.statusCode || (error.code === 'ER_DUP_ENTRY' ? 409 : 500)).json({
      success: false,
      data: [],
      message: error.statusCode === 409 || error.code === 'ER_DUP_ENTRY'
        ? 'This course is already assigned for the selected section, semester, year, and program.'
        : 'Unable to save course assignment matrix.',
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = { batchAssignMatrix };
