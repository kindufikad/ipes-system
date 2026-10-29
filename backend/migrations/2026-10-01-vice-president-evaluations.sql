ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'admin', 'student', 'instructor', 'dept_head', 'department_head',
    'college_dean', 'dean', 'academic_directorate', 'academic_director',
    'directorate', 'academic_vice_president', 'lab_assistant'
  ) NOT NULL DEFAULT 'student';

CREATE TABLE IF NOT EXISTS vice_president_evaluations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluator_id INT UNSIGNED NOT NULL,
  academic_directorate_id INT UNSIGNED NOT NULL,
  ratings JSON NOT NULL,
  score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  weighted_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  strengths TEXT NULL,
  weaknesses TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_vice_president_eval (evaluator_id, academic_directorate_id),
  CONSTRAINT fk_vice_president_eval_evaluator FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_vice_president_eval_directorate FOREIGN KEY (academic_directorate_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;