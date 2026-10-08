-- ========================================
-- Migration: 2026-09-01
-- Purpose: Add flexible evaluation routing and form expiration support
-- ========================================

-- ========================================
-- 1. FLEXIBLE EVALUATIONS TABLE (replaces rigid dept_head_evaluations)
-- Supports: Instructors, Lab Assistants, Department Heads as targets
-- ========================================
CREATE TABLE IF NOT EXISTS evaluations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluator_id INT UNSIGNED NOT NULL,
  evaluator_role VARCHAR(32) NOT NULL DEFAULT 'dept_head',
  target_user_id INT UNSIGNED NOT NULL,
  target_type VARCHAR(32) NOT NULL DEFAULT 'instructor',
  department_id INT UNSIGNED DEFAULT NULL,
  academic_year VARCHAR(64) DEFAULT NULL,
  semester VARCHAR(64) DEFAULT NULL,
  score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
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
  CONSTRAINT fk_evaluations_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluations_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  UNIQUE KEY uk_evaluation_unique (evaluator_id, target_user_id, target_type, evaluator_role, academic_year, semester),
  INDEX idx_evaluation_target (target_user_id, target_type),
  INDEX idx_evaluation_evaluator_role (evaluator_role),
  INDEX idx_evaluation_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY),
  ADD COLUMN IF NOT EXISTS is_updated BOOLEAN NOT NULL DEFAULT FALSE;

-- ========================================
-- 2. EVALUATION FORMS TABLE (tracks published forms with expiration)
-- ========================================
CREATE TABLE IF NOT EXISTS evaluation_forms (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 3. STUDENT EVALUATION DUAL ROUTING TABLE
-- Tracks evaluation submissions for both instructor and lab assistant
-- ========================================
CREATE TABLE IF NOT EXISTS student_evaluations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  course_id INT UNSIGNED NOT NULL,
  target_user_id INT UNSIGNED NOT NULL,
  target_type VARCHAR(32) NOT NULL DEFAULT 'instructor',
  evaluator_role VARCHAR(32) NOT NULL DEFAULT 'student_to_instructor',
  score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  feedback TEXT DEFAULT NULL,
  strengths TEXT DEFAULT NULL,
  improvements TEXT DEFAULT NULL,
  responses JSON DEFAULT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_evaluations_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_evaluations_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_evaluations_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_student_evaluation (student_id, course_id, target_user_id, target_type),
  INDEX idx_student_evaluations_target (target_user_id, target_type),
  INDEX idx_student_evaluations_course (course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE student_evaluation_submissions
  ADD COLUMN IF NOT EXISTS submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS editable_until DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 3 DAY);

UPDATE student_evaluation_submissions
SET editable_until = DATE_ADD(submitted_at, INTERVAL 3 DAY)
WHERE submitted_at IS NOT NULL
  AND editable_until > DATE_ADD(submitted_at, INTERVAL 3 DAY);

CREATE TABLE IF NOT EXISTS dept_head_evaluations (
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
  strengths TEXT DEFAULT NULL,
  weaknesses TEXT DEFAULT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dept_head_eval_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_dept_head_eval_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  UNIQUE KEY uk_dept_head_eval_unique (evaluator_id, target_role, evaluatee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 4. COURSE ASSIGNMENTS - ADD LAB ASSISTANT FIELDS (if not exists)
-- ========================================
ALTER TABLE course_assignments
  ADD COLUMN IF NOT EXISTS lab_assistant_id INT UNSIGNED DEFAULT NULL AFTER instructor_id,
  ADD CONSTRAINT fk_assign_lab_assistant FOREIGN KEY (lab_assistant_id) REFERENCES lab_assistants(id) ON DELETE SET NULL;

-- ========================================
-- 5. EVALUATION DISPATCHES - ADD TARGET FIELDS FOR FLEXIBLE ROUTING
-- ========================================
ALTER TABLE evaluation_dispatches
  ADD COLUMN IF NOT EXISTS target_type VARCHAR(32) DEFAULT 'instructor' AFTER evaluation_type,
  ADD COLUMN IF NOT EXISTS target_user_id INT UNSIGNED DEFAULT NULL AFTER target_type;

-- ========================================
-- 6. SEED INITIAL EVALUATION CRITERIA (if empty)
-- ========================================
INSERT INTO evaluation_criteria (evaluator_type, target_role, criterion_text, criterion_text_am, category, weight)
VALUES
  ('student', 'instructor', 'Preparation and Organization', 'ዝግጅት እና ሥርዓት', 'Teaching Quality', 5),
  ('student', 'instructor', 'Communication Skills', 'የግንኙነት ሚና', 'Teaching Quality', 5),
  ('student', 'instructor', 'Course Content Knowledge', 'የሥርዓት ይዘት እውቀት', 'Knowledge', 5),
  ('student', 'instructor', 'Student Engagement', 'ተማሪ መሳተፍ', 'Engagement', 5),
  ('student', 'lab_assistant', 'Laboratory Supervision', 'ላቦራቶሪ ቁጥጥር', 'Lab Competency', 5),
  ('student', 'lab_assistant', 'Safety Practices', 'ደህንነት ልምዶች', 'Lab Competency', 5),
  ('dept_head', 'instructor', 'Professional Development', 'ሙያዊ ልማት', 'Professional', 5),
  ('dept_head', 'lab_assistant', 'Research Contribution', 'ምርምር አስተዋጽኦ', 'Research', 5)
ON DUPLICATE KEY UPDATE criterion_text = VALUES(criterion_text);
