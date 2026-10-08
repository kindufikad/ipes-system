CREATE TABLE IF NOT EXISTS evaluation_periods (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academic_year VARCHAR(64) NOT NULL,
  semester VARCHAR(64) NOT NULL,
  deadline DATETIME NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_evaluation_period_term (academic_year, semester),
  INDEX idx_evaluation_period_status (status, deadline),
  CONSTRAINT fk_evaluation_period_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
