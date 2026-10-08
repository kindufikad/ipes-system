const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const connectionConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ipes_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const expectedSchema = {
  users: {
    password_hash: 'varchar(255)',
    role: "enum('admin','dept_head','instructor','student')",
    status: 'varchar(32)',
    email: 'varchar(255)',
    is_first_login: 'tinyint(1)',
    must_change_password: 'tinyint(1)',
    telegram_chat_id: 'bigint',
  },
  instructors: {
    user_id: 'int(10) unsigned',
    employee_id: 'varchar(64)',
    first_name: 'varchar(128)',
    last_name: 'varchar(128)',
    department_id: 'int(10) unsigned',
    gender: 'varchar(10)',
    phone_number: 'varchar(32)',
    profile_picture: 'varchar(255)',
  },
  students: {
    user_id: 'int(10) unsigned',
    student_id: 'varchar(64)',
    first_name: 'varchar(128)',
    last_name: 'varchar(128)',
    gender: 'varchar(10)',
    phone_number: 'varchar(32)',
    profile_picture: 'varchar(255)',
    department_id: 'int(10) unsigned',
    semester: 'varchar(32)',
    year_level: 'varchar(64)',
    section: 'varchar(64)',
    program_type: 'varchar(64)',
    registration_date: 'varchar(64)',
  },
  lab_assistants: {
    gender: 'varchar(10)',
    phone_number: 'varchar(32)',
  },
  departments: {
    name: 'varchar(255)',
    code: 'varchar(64)',
  },
  courses: {
    code: 'varchar(100)',
    name: 'varchar(255)',
    credit_hours: 'int(11)',
    department_id: 'int(10) unsigned',
  },
  evaluation_dispatches: {
    template_id: 'int(10) unsigned',
    student_id: 'int(10) unsigned',
    department_id: 'int(10) unsigned',
    student_identifier: 'varchar(255)',
    course_id: 'int(10) unsigned',
    course_name: 'varchar(255)',
    academic_year: 'varchar(64)',
    semester: 'varchar(64)',
    year_level: 'varchar(64)',
    student_group: 'varchar(255)',
    created_by: 'int(10) unsigned',
    payload: 'json',
    evaluation_type: 'varchar(32)',
    deadline: 'varchar(128)',
    status: "enum('pending','submitted','closed')",
    target_type: 'varchar(32)',
    target_user_id: 'int(10) unsigned',
    target_first_name: 'varchar(100)',
    target_last_name: 'varchar(100)',
    target_employee_id: 'varchar(64)',
    evaluation_template: 'varchar(32)',
  },
  evaluation_criteria: {
    evaluator_type: "enum('student','peer','dept_head','dean')",
    target_role: 'varchar(50)',
    criterion_text: 'varchar(255)',
    criterion_text_am: 'varchar(255)',
    category: 'varchar(100)',
    weight: 'int(11)',
    is_active: 'tinyint(1)',
  },
  student_evaluation_submissions: {
    dispatch_id: 'int(10) unsigned',
    student_id: 'int(10) unsigned',
    student_name: 'varchar(255)',
    score: 'decimal(5,2)',
    feedback: 'text',
    responses: 'json',
    status: 'varchar(32)',
    submitted_at: 'datetime',
    editable_until: 'datetime',
  },
  dept_head_evaluations: {
    dept_head_id: 'int(10) unsigned',
    evaluator_id: 'int(10) unsigned',
    instructor_id: 'int(10) unsigned',
    evaluatee_id: 'int(10) unsigned',
    target_role: 'varchar(32)',
    department_id: 'int(10) unsigned',
    academic_year: 'varchar(20)',
    semester: 'varchar(20)',
    criteria_scores: 'json',
    responses: 'json',
    total_score: 'decimal(5,2)',
    feedback: 'text',
    submitted_at: 'datetime',
  },
  evaluation_forms: {
    department_id: 'int(10) unsigned',
    academic_year: 'varchar(64)',
    semester: 'varchar(64)',
    form_type: 'varchar(50)',
    target_role: 'varchar(50)',
    published_at: 'timestamp',
    expires_at: 'timestamp',
    is_published: 'tinyint(1)',
    created_by: 'int(10) unsigned',
    published_by: 'int(10) unsigned',
    created_at: 'timestamp',
    updated_at: 'timestamp',
  },
  notifications: {
    user_id: 'int(10) unsigned',
    title: 'varchar(255)',
    message: 'text',
    type: 'varchar(50)',
    is_read: 'tinyint(1)',
    created_at: 'timestamp',
  },
  password_resets: {
    user_id: 'int(10) unsigned',
    code_hash: 'varchar(255)',
    expires_at: 'datetime',
    created_at: 'timestamp',
  },
};

const getColumns = async (conn, table) => {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.reduce((acc, row) => {
    acc[row.COLUMN_NAME] = row;
    return acc;
  }, {});
};

const tableExists = async (conn, table) => {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
};

const addMissingColumn = async (conn, table, column, type) => {
  console.log(`Adding missing column \`${column}\` to table \`${table}\``);
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type} DEFAULT NULL`);
};

const createTable = async (conn, table) => {
  switch (table) {
    case 'users':
      await conn.query(`CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) DEFAULT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','dept_head','instructor','student') NOT NULL DEFAULT 'student',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        is_first_login BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
        telegram_chat_id BIGINT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'departments':
      await conn.query(`CREATE TABLE departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'courses':
      await conn.query(`CREATE TABLE courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        credit_hours INT NOT NULL DEFAULT 3,
        department_id INT(10) unsigned DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_courses_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'instructors':
      await conn.query(`CREATE TABLE instructors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT(10) unsigned NOT NULL,
        employee_id VARCHAR(64) DEFAULT NULL,
        first_name VARCHAR(128) DEFAULT NULL,
        last_name VARCHAR(128) DEFAULT NULL,
        department_id INT(10) unsigned DEFAULT NULL,
        gender VARCHAR(10) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_instructor_user (user_id),
        CONSTRAINT fk_instructors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_instructors_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'students':
      await conn.query(`CREATE TABLE students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT(10) unsigned NOT NULL,
        student_id VARCHAR(64) DEFAULT NULL,
        first_name VARCHAR(128) DEFAULT NULL,
        last_name VARCHAR(128) DEFAULT NULL,
        gender VARCHAR(10) DEFAULT NULL,
        department_id INT(10) unsigned DEFAULT NULL,
        semester VARCHAR(32) DEFAULT NULL,
        year_level VARCHAR(64) DEFAULT NULL,
        section VARCHAR(64) DEFAULT NULL,
        program_type VARCHAR(64) DEFAULT NULL,
        registration_date VARCHAR(64) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_student_user (user_id),
        CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_students_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'evaluation_dispatches':
      await conn.query(`CREATE TABLE evaluation_dispatches (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        template_id INT UNSIGNED DEFAULT NULL,
        student_id INT UNSIGNED DEFAULT NULL,
        student_identifier VARCHAR(255) DEFAULT NULL,
        course_id INT UNSIGNED DEFAULT NULL,
        course_name VARCHAR(255) DEFAULT NULL,
        academic_year VARCHAR(64) DEFAULT NULL,
        semester VARCHAR(64) DEFAULT NULL,
        year_level VARCHAR(64) DEFAULT NULL,
        student_group VARCHAR(255) DEFAULT NULL,
        created_by INT UNSIGNED DEFAULT NULL,
        payload JSON DEFAULT NULL,
        status ENUM('pending','submitted','closed') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_evaluation_dispatches_template FOREIGN KEY (template_id) REFERENCES evaluation_templates(id) ON DELETE SET NULL,
        CONSTRAINT fk_evaluation_dispatches_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
        CONSTRAINT fk_evaluation_dispatches_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_evaluation_dispatches_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'evaluation_criteria':
      await conn.query(`CREATE TABLE evaluation_criteria (
        id INT AUTO_INCREMENT PRIMARY KEY,
        evaluator_type ENUM('student', 'peer', 'dept_head', 'dean') NOT NULL,
        target_role VARCHAR(50) DEFAULT 'instructor',
        criterion_text VARCHAR(255) NOT NULL,
        criterion_text_am VARCHAR(255) DEFAULT NULL,
        category VARCHAR(100) DEFAULT 'General',
        weight INT DEFAULT 5,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'student_evaluation_submissions':
      await conn.query(`CREATE TABLE student_evaluation_submissions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        dispatch_id INT UNSIGNED NOT NULL,
        student_id INT UNSIGNED DEFAULT NULL,
        student_name VARCHAR(255) DEFAULT NULL,
        score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        feedback TEXT DEFAULT NULL,
        responses JSON DEFAULT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'submitted',
        submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_student_evaluation_submissions_dispatch FOREIGN KEY (dispatch_id) REFERENCES evaluation_dispatches(id) ON DELETE CASCADE,
        CONSTRAINT fk_student_evaluation_submissions_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'dept_head_evaluations':
      await conn.query(`CREATE TABLE dept_head_evaluations (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        dept_head_id INT UNSIGNED DEFAULT NULL,
        evaluator_id INT UNSIGNED NOT NULL,
        instructor_id INT UNSIGNED NOT NULL,
        evaluatee_id INT UNSIGNED DEFAULT NULL,
        target_role VARCHAR(32) NOT NULL DEFAULT 'instructor',
        department_id INT UNSIGNED NOT NULL,
        academic_year VARCHAR(20) DEFAULT '2025/2026',
        semester VARCHAR(20) DEFAULT 'Semester II',
        criteria_scores JSON DEFAULT NULL,
        responses JSON DEFAULT NULL,
        total_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        feedback TEXT DEFAULT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'Pending',
        submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_dept_head_eval_unique (evaluator_id, target_role, evaluatee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'evaluation_forms':
      await conn.query(`CREATE TABLE evaluation_forms (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        department_id INT UNSIGNED NOT NULL,
        academic_year VARCHAR(64) NOT NULL,
        semester VARCHAR(64) NOT NULL,
        form_type VARCHAR(50) NOT NULL DEFAULT 'student',
        target_role VARCHAR(50) DEFAULT 'instructor',
        published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL DEFAULT NULL,
        is_published TINYINT(1) NOT NULL DEFAULT 1,
        created_by INT UNSIGNED DEFAULT NULL,
        published_by INT UNSIGNED DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_evaluation_forms_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
        CONSTRAINT fk_evaluation_forms_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_evaluation_forms_publisher FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE KEY uk_evaluation_form_term (department_id, academic_year, semester, form_type, target_role),
        INDEX idx_evaluation_forms_published (is_published),
        INDEX idx_evaluation_forms_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'notifications':
      await conn.query(`CREATE TABLE notifications (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'reminder',
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_notifications_user_read (user_id, is_read, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    case 'password_resets':
      await conn.query(`CREATE TABLE password_resets (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NOT NULL,
        code_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_password_resets_user (user_id, expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      break;
    default:
      throw new Error(`Unhandled schema creation for table: ${table}`);
  }
};

const run = async () => {
  const conn = await mysql.createConnection(connectionConfig);
  try {
    console.log('Connected to', connectionConfig.database);

    for (const [table, columns] of Object.entries(expectedSchema)) {
      if (!(await tableExists(conn, table))) {
        console.log(`Creating missing table: ${table}`);
        await createTable(conn, table);
        continue;
      }

      const existingColumns = await getColumns(conn, table);
      for (const [column, expectedType] of Object.entries(columns)) {
        const existing = existingColumns[column];
        if (!existing) {
          if (table === 'users' && column === 'must_change_password') {
            console.log('Adding missing column `must_change_password` to table `users`');
            await conn.query('ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT TRUE');
          } else {
            await addMissingColumn(conn, table, column, expectedType);
          }
          continue;
        }

        const actualType = existing.COLUMN_TYPE.toLowerCase();
        if (!actualType.includes(expectedType.toLowerCase())) {
          console.warn(`Column type mismatch for ${table}.${column}: actual=${actualType} expected=${expectedType}. Skipping automatic ALTER TABLE.`);
        }
      }
    }

    if (await tableExists(conn, 'course_assignments')) {
      const courseAssignmentColumns = await getColumns(conn, 'course_assignments');
      if (!courseAssignmentColumns.lab_assistant_id) {
        await conn.query('ALTER TABLE course_assignments ADD COLUMN lab_assistant_id INT UNSIGNED NULL AFTER instructor_id');
      }
      try {
        await conn.query('ALTER TABLE course_assignments ADD CONSTRAINT fk_assign_lab_assistant FOREIGN KEY (lab_assistant_id) REFERENCES lab_assistants(id) ON DELETE SET NULL');
      } catch (error) {
        if (!['ER_DUP_KEY', 'ER_DUP_CONSTRAINT', 'ER_CANT_CREATE_TABLE'].includes(error?.code)) throw error;
      }
    }

    const instructorColumns = await getColumns(conn, 'instructors');
    for (const column of ['program_type', 'registration_date']) {
      if (instructorColumns[column]) {
        await conn.query(`ALTER TABLE instructors DROP COLUMN \`${column}\``);
      }
    }

    // ARA peer evaluations use dispatch_id to identify lab assistant targets.
    if (await tableExists(conn, 'peer_evaluations')) {
      await conn.query('ALTER TABLE peer_evaluations MODIFY COLUMN evaluatee_id INT UNSIGNED DEFAULT NULL');
    }

    await conn.query(`ALTER TABLE system_settings
      ADD COLUMN IF NOT EXISTS is_system_locked TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS lock_reason VARCHAR(500) NOT NULL DEFAULT 'System temporarily locked by System Admin'`);
    await conn.query(`
      INSERT INTO system_settings (setting_key, setting_value, is_system_locked, lock_reason)
      VALUES ('system_access_control', NULL, 0, 'System temporarily locked by System Admin')
      ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)
    `);

    await conn.query("UPDATE evaluation_criteria SET criterion_text_am = CONCAT('የግምገማ መስፈርት፦ ', criterion_text) WHERE criterion_text_am IS NULL OR TRIM(criterion_text_am) = ''");
    await conn.query(`
      INSERT INTO system_settings (setting_key, setting_value)
      VALUES
        ('contact_email', 'kindufikad085@gmail.com'),
        ('contact_phone', '+251 961806188'),
        ('contact_office_hours', 'Monday-Saturday, 2:00 - 11:00')
      ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)
    `);
    const seedCriteria = [
      ['student', 'instructor', 'The instructor communicates clearly and supports learning.', 'መምህሩ በግልጽ ይገልጻል እና ትምህርትን ይደግፋል።', 'Teaching'],
      ['student', 'lab_assistant', 'Explains detailed objectives of each session', 'እያንዳንዱ ክፍለ ጊዜ ዓላማዎችን በዝርዝር ያብራራል', 'Teaching'],
      ['student', 'lab_assistant', 'Prepares well for practical sessions', 'ለተግባራዊ ክፍለ ጊዜዎች በደንብ ያዘጋጃል', 'Teaching'],
      ['student', 'lab_assistant', 'Teaches as per the course content', 'ኮርስ ይዘቱን በሚያስፈልገው መንገድ ያስተምራል', 'Teaching'],
      ['student', 'lab_assistant', 'Delivers the course in such a way that the students understand', 'ኮርሱን ተማሪዎች የሚረዱበት መንገድ ያቀርባል', 'Teaching'],
      ['student', 'lab_assistant', 'Use of additional teaching aids', 'ተጨማሪ የመማሪያ መሳሪያዎችን ይጠቀማል', 'Teaching'],
      ['student', 'lab_assistant', 'Answers questions raised by students', 'በተማሪዎች የሚነሱ ጥያቄዎችን ይመልሳል', 'Teaching'],
      ['student', 'lab_assistant', 'Impartiality based on ethnic, religion or gender', 'በዘር፣ በሃይማኖት ወይም በፆታ ላይ የማይወስን ፍትሃዊነት', 'Teaching'],
      ['student', 'lab_assistant', 'Use class time appropriately for practical sessions', 'የክፍል ጊዜን ለተግባራዊ ክፍለ ጊዜዎች በተገቢው መንገድ ይጠቀማል', 'Teaching'],
      ['peer', 'instructor', 'The instructor demonstrates professional competence.', 'መምህሩ ሙያዊ ብቃት ያሳያል።', 'Professional Competency'],
      ['peer', 'lab_assistant', 'Continuous update of the subject matter', 'የትምህርቱን ይዘት በተከታታይ ያዘምናል', 'Professional Competency'],
      ['peer', 'lab_assistant', 'Level of his/her subject matter knowledge and practical skill', 'የተካሄደውን ርዕሰ ጉዳይ እውቀት እና ተግባራዊ ክህሎት', 'Professional Competency'],
      ['peer', 'lab_assistant', 'Participation in seminars/workshop/research at department/college/university level', 'በዲፓርትመንት/ኮሌጅ/ዩኒቨርሲቲ ደረጃ ላይ በሴሚናር/ስልጠና/ምርምር የሚካፈል', 'Professional Competency'],
      ['peer', 'lab_assistant', 'Guidance and counseling role to students during practical sessions', 'በተግባራዊ ክፍለ ጊዜዎች የተማሪዎችን መመሪያ እና ምክር ሚና', 'Professional Competency'],
      ['peer', 'lab_assistant', 'Assist faculty and students in the analysis of samples, maintenance, upkeep of instruments', 'ለመምህራን እና ተማሪዎች ናሙናዎችን በመተንተን፣ መሣሪያዎችን በጥገና እና አጠባበቅ ረገድ እገዛ ይሰጣል', 'Professional Competency'],
      ['peer', 'lab_assistant', 'Implementation of different teaching methods in his discipline', 'በስልጠናው ውስጥ የተለያዩ የመማሪያ ዘዴዎችን ይተግብራል', 'Professional Competency'],
      ['peer', 'lab_assistant', 'Willingness to help colleagues during laboratory work/workshop', 'በላብራቶሪ እና የስራ እንቅስቃሴ ጊዜ አቻዎችን ለመርዳት ዝግጁነት ያሳያል', 'Professional Competency'],
      ['peer', 'lab_assistant', 'Time utilization of class sessions (laboratory, workshop)', 'የክፍል እና አውቶማቲክ ሰአቶች ጊዜ አጠቃቀም', 'Professional Competency'],
      ['dept_head', 'instructor', 'The instructor fulfills departmental responsibilities.', 'መምህሩ የዲፓርትመንቱን ኃላፊነቶች ይወጣል።', 'Departmental Responsibility'],
      ['dean', 'instructor', 'The instructor contributes to college goals.', 'መምህሩ ለኮሌጁ ግቦች አስተዋጽኦ ያደርጋል።', 'College Contribution'],
    ];
    for (const [evaluatorType, targetRole, englishText, amharicText, category] of seedCriteria) {
      await conn.query(
        'INSERT INTO evaluation_criteria (evaluator_type, target_role, criterion_text, criterion_text_am, category, weight, is_active) SELECT ?, ?, ?, ?, ?, 5, 1 WHERE NOT EXISTS (SELECT 1 FROM evaluation_criteria WHERE evaluator_type = ? AND target_role = ? AND criterion_text = ?)',
        [evaluatorType, targetRole, englishText, amharicText, category, evaluatorType, targetRole, englishText]
      );
    }

    console.log('Schema migration completed successfully.');
  } catch (error) {
    console.error('Schema migration failed:', error);
    process.exit(1);
  } finally {
    await conn.end();
  }
};

run().catch((error) => {
  console.error('Migration execution error:', error);
  process.exit(1);
});
