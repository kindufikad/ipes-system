const ACADEMIC_YEAR = process.env.SEED_EVALUATION_YEAR || '2025/2026';
const SEMESTER = process.env.SEED_EVALUATION_SEMESTER || 'Semester I';
const COURSE_CODE = process.env.SEED_EVALUATION_COURSE_CODE || 'SEED-TEST-001';
const TEMPLATE_NAME = 'IPES Test Instructor Evaluation Template';

const criteria = [
  { evaluatorType: 'student', targetRole: 'instructor', category: 'Teaching Quality', key: 'clear_explanations', en: 'Explains course concepts clearly.', am: 'የኮርሱን ሐሳቦች በግልጽ ያብራራል።' },
  { evaluatorType: 'student', targetRole: 'instructor', category: 'Teaching Quality', key: 'subject_knowledge', en: 'Demonstrates strong subject knowledge.', am: 'ጠንካራ የትምህርቱ እውቀት ያሳያል።' },
  { evaluatorType: 'student', targetRole: 'instructor', category: 'Professionalism', key: 'punctuality', en: 'Starts and ends classes on time.', am: 'ትምህርቱን በሰዓቱ ይጀምራል እና ያጠናቅቃል።' },
  { evaluatorType: 'peer', targetRole: 'instructor', category: 'Professionalism', key: 'collaboration', en: 'Collaborates effectively with colleagues.', am: 'ከባልደረቦቹ ጋር በብቃት ይተባበራል።' },
  { evaluatorType: 'peer', targetRole: 'instructor', category: 'Professionalism', key: 'responsibility', en: 'Fulfills assigned academic responsibilities.', am: 'የተመደቡትን የአካዳሚክ ኃላፊነቶች ይወጣል።' },
  { evaluatorType: 'dept_head', targetRole: 'instructor', category: 'Instruction', key: 'assessment_quality', en: 'Uses fair and appropriate assessment methods.', am: 'ፍትሃዊ እና ተገቢ የምዘና ዘዴዎችን ይጠቀማል።' },
  { evaluatorType: 'dept_head', targetRole: 'instructor', category: 'Professionalism', key: 'department_participation', en: 'Participates in departmental activities.', am: 'በዲፓርትመንት ተግባራት ይሳተፋል።' },
  { evaluatorType: 'dean', targetRole: 'dept_head', category: 'Leadership', key: 'leadership', en: 'Provides effective academic leadership.', am: 'ውጤታማ የአካዳሚክ አመራር ይሰጣል።' },
];

const getColumns = async (connection, tableName) => {
  const [rows] = await connection.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name));
};

const insertIfMissing = async (connection, tableName, values, matchColumns, optional = false) => {
  const columns = await getColumns(connection, tableName);
  if (!columns.size) {
    if (optional) return null;
    throw new Error(`Required table ${tableName} is missing. Run database migrations first.`);
  }

  const lookupColumns = matchColumns.filter((column) => columns.has(column) && values[column] !== undefined);
  if (lookupColumns.length) {
    const predicates = lookupColumns.map((column) => `\`${column}\` = ?`).join(' AND ');
    const [existing] = await connection.query(
      `SELECT id FROM \`${tableName}\` WHERE ${predicates} LIMIT 1`,
      lookupColumns.map((column) => values[column])
    );
    if (existing[0]) return Number(existing[0].id);
  }

  const entries = Object.entries(values).filter(([column, value]) => columns.has(column) && value !== undefined);
  if (!entries.length) return null;
  const columnSql = entries.map(([column]) => `\`${column}\``).join(', ');
  const placeholders = entries.map(() => '?').join(', ');
  const [result] = await connection.query(
    `INSERT INTO \`${tableName}\` (${columnSql}) VALUES (${placeholders})`,
    entries.map(([, value]) => value)
  );
  return Number(result.insertId || 0) || null;
};

const getSeedUser = async (connection, email, allowedRoles) => {
  const [rows] = await connection.query(
    `SELECT u.id AS user_id, u.role, u.email,
       i.id AS instructor_id, i.department_id AS instructor_department_id,
       i.first_name AS instructor_first_name, i.last_name AS instructor_last_name,
       s.id AS student_id, s.department_id AS student_department_id,
       s.first_name AS student_first_name, s.last_name AS student_last_name,
       s.year_level, s.section, s.semester AS student_semester, s.program_type
     FROM users u
     LEFT JOIN instructors i ON i.user_id = u.id
     LEFT JOIN students s ON s.user_id = u.id
     WHERE LOWER(u.email) = ? AND LOWER(COALESCE(u.status, 'active')) = 'active'
     LIMIT 1`,
    [email.toLowerCase()]
  );
  const user = rows[0];
  if (!user || !allowedRoles.includes(String(user.role).toLowerCase())) {
    throw new Error(`Seed account ${email} is missing. Run npm run seed:users first or configure its SEED_*_EMAIL value.`);
  }
  return user;
};

const main = async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to insert test evaluation records while NODE_ENV=production.');
  }
  if (!process.argv.includes('--confirm')) {
    throw new Error('This adds test records. Re-run with: npm run seed:evaluations -- --confirm');
  }

  const pool = require('../config/db');
  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const student = await getSeedUser(connection, process.env.SEED_STUDENT_EMAIL || 'student@ipes.edu.et', ['student']);
    const instructor = await getSeedUser(connection, process.env.SEED_INSTRUCTOR_EMAIL || 'instructor@ipes.edu.et', ['instructor']);
    const departmentHead = await getSeedUser(connection, process.env.SEED_DEPT_HEAD_EMAIL || 'depthead@ipes.edu.et', ['dept_head', 'department_head']);
    const dean = await getSeedUser(connection, process.env.SEED_DEAN_EMAIL || 'dean@ipes.edu.et', ['college_dean', 'dean']);

    if (!student.student_id || !instructor.instructor_id || !departmentHead.instructor_id || !dean.instructor_id) {
      throw new Error('Seed accounts need matching student/instructor profiles. Run npm run seed:users after creating a department.');
    }
    const departmentId = Number(instructor.instructor_department_id);
    if (!departmentId || Number(student.student_department_id) !== departmentId) {
      throw new Error('Seed student and instructor must belong to the same department. Set SEED_DEPARTMENT_ID before running seed:users.');
    }
    if (Number(departmentHead.instructor_department_id) !== departmentId) {
      throw new Error('Seed Department Head must be assigned to the test instructor department.');
    }

    const [existingCourses] = await connection.query('SELECT id, department_id FROM courses WHERE code = ? LIMIT 1', [COURSE_CODE]);
    let courseId;
    if (existingCourses[0]) {
      if (Number(existingCourses[0].department_id) !== departmentId) {
        throw new Error(`Course code ${COURSE_CODE} already belongs to a different department.`);
      }
      courseId = Number(existingCourses[0].id);
    } else {
      const [courseResult] = await connection.query(
        `INSERT INTO courses (code, name, year_level, semester, credit_hours, department_id)
         VALUES (?, 'IPES Evaluation Seed Course', ?, ?, 3, ?)`,
        [COURSE_CODE, student.year_level || '1', student.student_semester || SEMESTER, departmentId]
      );
      courseId = Number(courseResult.insertId);
    }

    const assignmentId = await insertIfMissing(connection, 'course_assignments', {
      department_id: departmentId,
      course_id: courseId,
      instructor_id: Number(instructor.instructor_id),
      student_id: Number(student.student_id),
      program_type: student.program_type || 'Regular',
      year_level: student.year_level || '1',
      semester: student.student_semester || SEMESTER,
      section: student.section || 'A',
      academic_year: ACADEMIC_YEAR,
      is_published: 1,
      is_student_published: 1,
      is_peer_published: 1,
      publish_target: 'both',
      status: 'Assigned',
    }, ['course_id', 'instructor_id', 'student_id', 'academic_year', 'semester', 'section']);
    if (!assignmentId) throw new Error('Unable to create or find the test course assignment.');

    const templateData = {
      version: 1,
      title: 'Standard Instructor Evaluation Template',
      criteria: criteria.map(({ category, key, en, am }) => ({ category, key, text: { en, am } })),
    };
    const templateId = await insertIfMissing(connection, 'evaluation_templates', {
      name: TEMPLATE_NAME,
      template_data: JSON.stringify(templateData),
      created_by: Number(departmentHead.user_id),
    }, ['name']);

    for (const [position, item] of criteria.entries()) {
      await insertIfMissing(connection, 'template_criteria', {
        template_id: templateId,
        category: item.category,
        position: position + 1,
        criteria_key: item.key,
        text_en: item.en,
        text_am: item.am,
        meta: JSON.stringify({ evaluator_type: item.evaluatorType, target_role: item.targetRole }),
      }, ['template_id', 'criteria_key'], true);

      await insertIfMissing(connection, 'evaluation_criteria', {
        evaluator_type: item.evaluatorType,
        target_role: item.targetRole,
        criterion_text: item.en,
        criterion_text_am: item.am,
        category: item.category,
        weight: 5,
        is_active: 1,
      }, ['evaluator_type', 'target_role', 'criterion_text'], true);
    }

    for (const form of [
      { form_type: 'student', target_role: 'instructor' },
      { form_type: 'peer', target_role: 'instructor' },
      { form_type: 'dept_head', target_role: 'instructor' },
      { form_type: 'dean', target_role: 'dept_head' },
    ]) {
      await insertIfMissing(connection, 'evaluation_forms', {
        department_id: departmentId,
        academic_year: ACADEMIC_YEAR,
        semester: SEMESTER,
        form_type: form.form_type,
        target_role: form.target_role,
        is_published: 1,
        created_by: Number(departmentHead.user_id),
        published_by: Number(departmentHead.user_id),
      }, ['department_id', 'academic_year', 'semester', 'form_type', 'target_role'], true);
    }

    const dispatchId = await insertIfMissing(connection, 'evaluation_dispatches', {
      template_id: templateId,
      student_id: Number(student.student_id),
      student_identifier: process.env.SEED_STUDENT_ID || 'MAU0000001',
      course_id: courseId,
      assignment_id: assignmentId,
      course_code: COURSE_CODE,
      course_name: 'IPES Evaluation Seed Course',
      academic_year: ACADEMIC_YEAR,
      semester: student.student_semester || SEMESTER,
      year_level: student.year_level || '1',
      student_group: student.section || 'A',
      student_identifier_text: process.env.SEED_STUDENT_ID || 'MAU0000001',
      department_id: departmentId,
      created_by: Number(departmentHead.user_id),
      payload: JSON.stringify({ target_role: 'instructor' }),
      evaluation_type: 'student',
      target_type: 'instructor',
      target_user_id: Number(instructor.user_id),
      status: 'active',
    }, ['assignment_id', 'student_id', 'evaluation_type'], true);
    if (dispatchId) {
      await insertIfMissing(connection, 'student_evaluation_submissions', {
        dispatch_id: dispatchId,
        student_id: Number(student.student_id),
        student_name: `${student.student_first_name} ${student.student_last_name}`.trim(),
        score: 88,
        feedback: 'Test feedback: clear course explanations and useful examples.',
        strengths: 'Clear explanations and organized lessons.',
        improvements: 'Add more practice exercises.',
        responses: JSON.stringify({ clarity: 5, knowledge: 4, punctuality: 5 }),
        status: 'submitted',
      }, ['dispatch_id', 'student_id'], true);
    }

    const peerEvaluationId = await insertIfMissing(connection, 'peer_evaluations', {
      evaluator_id: Number(departmentHead.instructor_id),
      department_id: departmentId,
      evaluatee_id: Number(instructor.instructor_id),
      deadline: '2099-06-30',
      status: 'submitted',
    }, ['evaluator_id', 'evaluatee_id'], true);
    if (peerEvaluationId) {
      await insertIfMissing(connection, 'peer_evaluation_submissions', {
        peer_evaluation_id: peerEvaluationId,
        evaluator_id: Number(departmentHead.user_id),
        evaluatee_id: Number(instructor.instructor_id),
        score: 91,
        strengths: 'Collaborates effectively with colleagues.',
        suggestions: 'Continue sharing teaching resources.',
        responses: JSON.stringify({ collaboration: 5, responsibility: 4 }),
        status: 'submitted',
      }, ['peer_evaluation_id', 'evaluator_id'], true);
    }

    const deptHeadEvaluationId = await insertIfMissing(connection, 'dept_head_evaluations', {
      evaluator_id: Number(departmentHead.user_id),
      dept_head_id: Number(departmentHead.user_id),
      instructor_id: Number(instructor.instructor_id),
      evaluatee_id: Number(instructor.instructor_id),
      target_role: 'instructor',
      department_id: departmentId,
      academic_year: ACADEMIC_YEAR,
      semester: SEMESTER,
      criteria_scores: JSON.stringify({ assessment_quality: 5, department_participation: 4 }),
      responses: JSON.stringify({ assessment_quality: 5, department_participation: 4 }),
      total_score: 86,
      feedback: 'Test Department Head evaluation.',
      strengths: 'Strong subject knowledge.',
      weaknesses: 'Increase student practice opportunities.',
      status: 'submitted',
    }, ['evaluator_id', 'target_role', 'evaluatee_id'], true);

    const directorEvaluatorId = Number(departmentHead.user_id);
    await insertIfMissing(connection, 'directorate_evaluations', {
      evaluator_id: directorEvaluatorId,
      dean_id: Number(dean.user_id),
      ratings: JSON.stringify({ leadership: 5, quality_assurance: 4, communication: 4 }),
      strengths: 'Test leadership strengths.',
      weaknesses: 'Test leadership improvement area.',
      total_score: 90,
      status: 'completed',
    }, ['evaluator_id', 'dean_id'], true);

    await insertIfMissing(connection, 'evaluation_results', {
      instructor_id: Number(instructor.instructor_id),
      department_id: departmentId,
      academic_year: ACADEMIC_YEAR,
      semester: SEMESTER,
      student_average: 88,
      student_score: 88,
      peer_average: 91,
      peer_score: 91,
      dept_head_score: 86,
      total_score: 88,
      final_score: 88,
    }, ['instructor_id', 'academic_year', 'semester'], true);

    await insertIfMissing(connection, 'evaluation_summaries', {
      instructor_id: Number(instructor.instructor_id),
      department_id: departmentId,
      student_raw_percentage: 88,
      student_weighted_score: 44,
      dept_head_raw_percentage: 86,
      dept_head_weighted_score: 25.8,
      peer_raw_percentage: 91,
      peer_weighted_score: 18.2,
      total_weighted_score: 88,
      is_published: 1,
      published_at: new Date(),
    }, ['instructor_id'], true);

    await insertIfMissing(connection, 'evaluations', {
      assignment_id: assignmentId,
      evaluator_id: Number(student.user_id),
      evaluator_role: 'student',
      target_user_id: Number(instructor.user_id),
      target_type: 'instructor',
      department_id: departmentId,
      academic_year: ACADEMIC_YEAR,
      semester: SEMESTER,
      score: 88,
      feedback: 'Test flexible evaluation submission.',
      criteria_scores: JSON.stringify({ clarity: 5, knowledge: 4 }),
      strengths: 'Clear explanations.',
      improvements: 'More practice exercises.',
      comments: 'Seed test record.',
      responses: JSON.stringify({ clarity: 5, knowledge: 4, punctuality: 5 }),
      status: 'COMPLETED',
      is_updated: 0,
    }, ['evaluator_id', 'target_user_id', 'target_type', 'evaluator_role', 'academic_year', 'semester'], true);

    const tableNames = ['evaluation_submissions', 'student_evaluations', 'peer_evaluation_publications'];
    for (const tableName of tableNames) {
      if (!(await getColumns(connection, tableName)).size) continue;
      if (tableName === 'evaluation_submissions') {
        await insertIfMissing(connection, tableName, {
          assignment_id: assignmentId,
          student_id: Number(student.student_id),
          score: 88,
          feedback: 'Legacy seed test feedback.',
          responses: JSON.stringify({ clarity: 5, knowledge: 4 }),
        }, ['assignment_id', 'student_id'], true);
      } else if (tableName === 'student_evaluations') {
        await insertIfMissing(connection, tableName, {
          student_id: Number(student.student_id),
          course_id: courseId,
          target_user_id: Number(instructor.user_id),
          target_type: 'instructor',
          evaluator_role: 'student_to_instructor',
          score: 88,
          feedback: 'Legacy flexible student evaluation seed record.',
          strengths: 'Clear explanations.',
          improvements: 'More practice exercises.',
          responses: JSON.stringify({ clarity: 5, knowledge: 4 }),
          status: 'submitted',
        }, ['student_id', 'course_id', 'target_user_id', 'target_type'], true);
      } else {
        await insertIfMissing(connection, tableName, {
          department_id: departmentId,
          academic_year: ACADEMIC_YEAR,
          semester: SEMESTER,
          status: 'published',
          started_at: new Date(),
          created_by: Number(departmentHead.user_id),
          published_by: Number(departmentHead.user_id),
        }, ['department_id', 'academic_year', 'semester'], true);
      }
    }

    await connection.commit();
    transactionStarted = false;
    console.log(`Seeded evaluation test data for ${student.email}, ${instructor.email}, ${departmentHead.email}, and ${dean.email}.`);
    console.log(`Course: ${COURSE_CODE}; term: ${ACADEMIC_YEAR} ${SEMESTER}.`);
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Evaluation seed rollback failed:', rollbackError.message);
      }
    }
    console.error('Evaluation data seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    connection?.release();
    await pool.end();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error('Evaluation data seed failed:', error.message);
    process.exitCode = 1;
  });
}
