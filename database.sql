-- IPES Complete Database Schema & Initial Data
CREATE DATABASE IF NOT EXISTS ipes_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ipes_db;

-- --------------------------------------------------------
-- 1. Colleges Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS colleges (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  code VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 2. Departments Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  college_id INT UNSIGNED NOT NULL,
  department_name VARCHAR(100) NOT NULL,
  department_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL UNIQUE,
  code VARCHAR(64) NULL,
  CONSTRAINT fk_departments_college FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 2. Base Users Table (authentication and account metadata only)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NULL UNIQUE,
  first_name VARCHAR(128) NULL,
  last_name VARCHAR(128) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'student', 'instructor', 'dept_head', 'department_head', 'college_dean', 'dean', 'academic_directorate', 'academic_director', 'directorate', 'academic_vice_president', 'lab_assistant') NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    is_first_login BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    telegram_chat_id BIGINT NULL,
    language ENUM('en', 'am') NOT NULL DEFAULT 'am',
    phone_number VARCHAR(32) NULL,
    profile_picture VARCHAR(255) NULL,
    active_system_admin_slot TINYINT GENERATED ALWAYS AS (
      CASE WHEN LOWER(role) IN ('admin', 'systemadmin', 'system_admin')
        AND LOWER(COALESCE(status, 'active')) = 'active' THEN 1 ELSE NULL END
    ) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_single_active_system_admin (active_system_admin_slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 3. Instructors & Department Heads Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS instructors (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    employee_id VARCHAR(64) NOT NULL UNIQUE,
    first_name VARCHAR(128) NOT NULL,
    last_name VARCHAR(128) NOT NULL,
    department_id INT UNSIGNED NOT NULL,
    gender VARCHAR(10) NULL,
    phone_number VARCHAR(32) NULL,
    profile_picture VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_instructors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_instructors_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lab_assistants (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    employee_id VARCHAR(64) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NULL,
    department_id INT UNSIGNED NOT NULL,
  gender VARCHAR(10) NULL,
  phone_number VARCHAR(32) NULL,
  profile_picture VARCHAR(255) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lab_assistants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_lab_assistants_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 4. Students Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    student_id VARCHAR(64) NOT NULL UNIQUE,
    first_name VARCHAR(128) NOT NULL,
    last_name VARCHAR(128) NOT NULL,
    department_id INT UNSIGNED NOT NULL,
    semester VARCHAR(32) NOT NULL,
    year_level VARCHAR(32) NOT NULL,
    section VARCHAR(32) NOT NULL,
    gender VARCHAR(10) NULL,
    phone_number VARCHAR(32) NULL,
    profile_picture VARCHAR(255) NULL,
    program_type VARCHAR(64) DEFAULT 'Regular',
    registration_date VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_students_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS student_id VARCHAR(50) NULL,
  ADD CONSTRAINT fk_users_students
  FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE;

-- --------------------------------------------------------
-- 5. Courses Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    year_level VARCHAR(32) DEFAULT NULL,
    semester VARCHAR(32) DEFAULT NULL,
    credit_hours INT NOT NULL DEFAULT 3,
    department_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_courses_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  action_title VARCHAR(255) NOT NULL,
  description TEXT,
  performed_by VARCHAR(255),
  ip_address VARCHAR(64),
  actor_user_id INT UNSIGNED DEFAULT NULL,
  actor_email VARCHAR(255) DEFAULT NULL,
  actor_role VARCHAR(64) DEFAULT NULL,
  category VARCHAR(64) DEFAULT NULL,
  target_details TEXT,
  route_path VARCHAR(512) DEFAULT NULL,
  http_method VARCHAR(12) DEFAULT NULL,
  status_code SMALLINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS evaluation_results (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instructor_id INT UNSIGNED NOT NULL,
  department_id INT UNSIGNED DEFAULT NULL,
  academic_year VARCHAR(64) NOT NULL DEFAULT '',
  semester VARCHAR(64) NOT NULL DEFAULT '',
  student_average DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  peer_average DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  dept_head_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  total_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  student_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  peer_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  final_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_evaluation_results_instructor FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluation_results_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  UNIQUE KEY uk_evaluation_results_instructor_term (instructor_id, academic_year, semester)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS evaluation_summaries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instructor_id INT UNSIGNED NOT NULL UNIQUE,
  department_id INT UNSIGNED DEFAULT NULL,
  student_raw_percentage DECIMAL(6,2) NOT NULL DEFAULT 0,
  student_weighted_score DECIMAL(6,2) NOT NULL DEFAULT 0,
  dept_head_raw_percentage DECIMAL(6,2) NOT NULL DEFAULT 0,
  dept_head_weighted_score DECIMAL(6,2) NOT NULL DEFAULT 0,
  peer_raw_percentage DECIMAL(6,2) NOT NULL DEFAULT 0,
  peer_weighted_score DECIMAL(6,2) NOT NULL DEFAULT 0,
  total_weighted_score DECIMAL(6,2) NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  published_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_evaluation_summaries_instructor FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE CASCADE,
  INDEX idx_evaluation_summaries_department (department_id, is_published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dept_head_evaluations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dept_head_id INT UNSIGNED DEFAULT NULL,
  evaluator_id INT UNSIGNED NOT NULL,
  instructor_id INT UNSIGNED NOT NULL,
  evaluatee_id INT UNSIGNED DEFAULT NULL,
  target_role VARCHAR(32) NOT NULL DEFAULT 'instructor',
  academic_year VARCHAR(20) DEFAULT '2025/2026',
  semester VARCHAR(20) DEFAULT 'Semester II',
  criteria_scores JSON DEFAULT NULL,
  responses JSON DEFAULT NULL,
  total_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  feedback TEXT NULL,
  strengths TEXT NULL,
  weaknesses TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dept_head_eval_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_dept_head_eval_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  UNIQUE KEY uk_dept_head_eval_unique (evaluator_id, target_role, evaluatee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(128) PRIMARY KEY,
  setting_value TEXT NULL,
  is_system_locked TINYINT(1) NOT NULL DEFAULT 0,
  lock_reason VARCHAR(500) NOT NULL DEFAULT 'System temporarily locked by System Admin',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS evaluation_deadline_settings (
  department_id INT UNSIGNED PRIMARY KEY,
  deadline_at DATETIME NULL,
  auto_lock TINYINT(1) NOT NULL DEFAULT 1,
  updated_by INT UNSIGNED NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_deadline_settings_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  CONSTRAINT fk_deadline_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS evaluation_deadline_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id INT UNSIGNED NOT NULL,
  deadline_at DATETIME NULL,
  auto_lock TINYINT(1) NOT NULL DEFAULT 1,
  changed_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_deadline_history_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  CONSTRAINT fk_deadline_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_deadline_history_department (department_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO system_settings (setting_key, setting_value)
VALUES ('system_lock_enabled', '0')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);

INSERT INTO system_settings (setting_key, setting_value, is_system_locked, lock_reason)
VALUES ('system_access_control', NULL, 0, 'System temporarily locked by System Admin')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);

INSERT INTO system_settings (setting_key, setting_value)
VALUES
  ('home_hero_images', '["/uploads/landing/hero1.jpg", "/uploads/landing/hero2.jpg"]'),
  ('about_page_image', '/uploads/landing/about_banner.jpg'),
  ('system_logo', '/uploads/landing/system-logo.png'),
  ('university_logo', '/uploads/landing/university-logo.png'),
  ('contact_email', 'kindufikad085@gmail.com'),
  ('contact_phone', '+251 961806188'),
  ('contact_office_hours', 'Monday-Saturday, 2:00 - 11:00')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);

-- --------------------------------------------------------
-- 6. Evaluation Templates Table (id Fixed to INT UNSIGNED)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  template_data JSON NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_evaluation_templates_updated_at (updated_at),
  CONSTRAINT fk_templates_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 7. Dynamic Evaluation Criteria Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evaluator_type ENUM('student', 'peer', 'dept_head', 'dean', 'dean_evaluates_dept_head') NOT NULL,
  target_role VARCHAR(50) DEFAULT 'instructor',
  criterion_text VARCHAR(255) NOT NULL,
  criterion_text_am VARCHAR(255) DEFAULT NULL,
  category VARCHAR(100) DEFAULT 'General',
  weight INT DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 8. Template Criteria Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS template_criteria (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id INT UNSIGNED NOT NULL,
  category VARCHAR(255) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  criteria_key VARCHAR(255) NULL,
  text_en TEXT NULL,
  text_am TEXT NULL,
  meta JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_template_criteria_template FOREIGN KEY (template_id) REFERENCES evaluation_templates(id) ON DELETE CASCADE,
  INDEX idx_template_criteria_template_id (template_id),
  INDEX idx_template_criteria_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 8. Course Assignments Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS course_assignments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    department_id INT UNSIGNED NOT NULL,
    course_id INT UNSIGNED NOT NULL,
    instructor_id INT UNSIGNED DEFAULT NULL,
    lab_assistant_id INT UNSIGNED DEFAULT NULL,
    staff_id INT UNSIGNED DEFAULT NULL,
    assigned_role VARCHAR(32) NOT NULL DEFAULT 'instructor',
    student_id INT UNSIGNED DEFAULT NULL,
    program_type VARCHAR(64) DEFAULT NULL,
    year_level VARCHAR(32) NOT NULL,
    semester VARCHAR(32) NOT NULL,
    section VARCHAR(32) NOT NULL,
    academic_year VARCHAR(32) NOT NULL DEFAULT '2026',
    is_published TINYINT(1) NOT NULL DEFAULT 0,
    is_student_published TINYINT(1) NOT NULL DEFAULT 0,
    is_peer_published TINYINT(1) NOT NULL DEFAULT 0,
    publish_target VARCHAR(32) DEFAULT 'both',
    status VARCHAR(32) DEFAULT 'Assigned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_assign_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_instructor FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE SET NULL,
    CONSTRAINT fk_assign_lab_assistant FOREIGN KEY (lab_assistant_id) REFERENCES lab_assistants(id) ON DELETE SET NULL,
    CONSTRAINT fk_assign_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 9. Evaluation Dispatches Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_dispatches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id INT UNSIGNED DEFAULT NULL,
  student_id INT UNSIGNED DEFAULT NULL,
  student_identifier VARCHAR(255) DEFAULT NULL,
  course_id INT UNSIGNED DEFAULT NULL,
  assignment_id INT UNSIGNED DEFAULT NULL,
  course_code VARCHAR(64) DEFAULT NULL,
  course_name VARCHAR(255) DEFAULT NULL,
  academic_year VARCHAR(64) DEFAULT NULL,
  semester VARCHAR(64) DEFAULT NULL,
  year_level VARCHAR(64) DEFAULT NULL,
  student_group VARCHAR(255) DEFAULT NULL,
  student_identifier_text VARCHAR(255) DEFAULT NULL,
  department_id INT UNSIGNED DEFAULT NULL,
  created_by INT UNSIGNED DEFAULT NULL,
  payload JSON DEFAULT NULL,
  evaluation_type VARCHAR(32) NOT NULL DEFAULT 'student',
  deadline VARCHAR(128) DEFAULT NULL,
  status ENUM('pending', 'active', 'submitted', 'closed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evaluation_dispatches_template FOREIGN KEY (template_id) REFERENCES evaluation_templates(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluation_dispatches_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluation_dispatches_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_evaluation_dispatches_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS peer_evaluations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluator_id INT UNSIGNED NOT NULL,
  department_id INT UNSIGNED NOT NULL,
  evaluatee_id INT UNSIGNED DEFAULT NULL,
  course_id INT UNSIGNED DEFAULT NULL,
  dispatch_id INT UNSIGNED DEFAULT NULL,
  deadline VARCHAR(64) DEFAULT NULL,
  status ENUM('pending', 'active', 'submitted') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_evaluator_evaluatee_pair (evaluator_id, evaluatee_id),
  CONSTRAINT fk_peer_evaluations_evaluator FOREIGN KEY (evaluator_id) REFERENCES instructors(id) ON DELETE CASCADE,
  CONSTRAINT fk_peer_evaluations_evaluatee FOREIGN KEY (evaluatee_id) REFERENCES instructors(id) ON DELETE CASCADE,
  CONSTRAINT fk_peer_evaluations_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
  CONSTRAINT fk_peer_evaluations_dispatch FOREIGN KEY (dispatch_id) REFERENCES evaluation_dispatches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS peer_evaluation_submissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  peer_evaluation_id INT UNSIGNED NOT NULL,
  evaluator_id INT UNSIGNED NOT NULL,
  evaluatee_id INT UNSIGNED DEFAULT NULL,
  score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  strengths TEXT DEFAULT NULL,
  suggestions TEXT DEFAULT NULL,
  responses JSON DEFAULT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_peer_submission_evaluation FOREIGN KEY (peer_evaluation_id) REFERENCES peer_evaluations(id) ON DELETE CASCADE,
  CONSTRAINT fk_peer_submission_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_peer_submission_evaluatee FOREIGN KEY (evaluatee_id) REFERENCES instructors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE student_evaluation_submissions
  ADD COLUMN IF NOT EXISTS submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY);

CREATE TABLE IF NOT EXISTS peer_evaluation_publications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id INT UNSIGNED NOT NULL,
  academic_year VARCHAR(64) NOT NULL,
  semester VARCHAR(64) NOT NULL,
  status ENUM('published', 'unpublished') NOT NULL DEFAULT 'unpublished',
  started_at DATETIME DEFAULT NULL,
  created_by INT UNSIGNED NOT NULL,
  published_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_peer_publication_term (department_id, academic_year, semester),
  CONSTRAINT fk_peer_publication_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  CONSTRAINT fk_peer_publication_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 10. Student Evaluation Submissions Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_evaluation_submissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dispatch_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED DEFAULT NULL,
  student_name VARCHAR(255) DEFAULT NULL,
  score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  feedback TEXT DEFAULT NULL,
  strengths TEXT DEFAULT NULL,
  improvements TEXT DEFAULT NULL,
  responses JSON DEFAULT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_evaluation_submissions_dispatch FOREIGN KEY (dispatch_id) REFERENCES evaluation_dispatches(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_evaluation_submissions_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- 11. Legacy Evaluation Submissions Table
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluation_submissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT UNSIGNED NOT NULL,
    student_id INT UNSIGNED NOT NULL,
    score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    feedback TEXT NULL,
    responses JSON NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sub_assignment FOREIGN KEY (assignment_id) REFERENCES course_assignments(id) ON DELETE CASCADE,
    CONSTRAINT fk_sub_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  -- --------------------------------------------------------
  -- 12. Flexible Evaluations Table
  -- --------------------------------------------------------
  CREATE TABLE IF NOT EXISTS evaluations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT UNSIGNED DEFAULT NULL,
    evaluator_id INT UNSIGNED NOT NULL,
    evaluator_role VARCHAR(32) NOT NULL DEFAULT 'student',
    target_user_id INT UNSIGNED DEFAULT NULL,
    target_type VARCHAR(32) NOT NULL DEFAULT 'instructor',
    department_id INT UNSIGNED DEFAULT NULL,
    academic_year VARCHAR(64) DEFAULT NULL,
    semester VARCHAR(64) DEFAULT NULL,
    score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    feedback TEXT DEFAULT NULL,
    criteria_scores JSON DEFAULT NULL,
    strengths TEXT DEFAULT NULL,
    improvements TEXT DEFAULT NULL,
    comments TEXT DEFAULT NULL,
    responses JSON DEFAULT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY),
    is_updated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_evaluations_assignment FOREIGN KEY (assignment_id) REFERENCES course_assignments(id) ON DELETE CASCADE,
    CONSTRAINT fk_evaluations_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_evaluations_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_evaluations_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
