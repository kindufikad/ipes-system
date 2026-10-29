USE ipes_db;

CREATE TABLE IF NOT EXISTS peer_evaluation_publications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id INT UNSIGNED NOT NULL,
  academic_year VARCHAR(64) NOT NULL,
  semester VARCHAR(64) NOT NULL,
  status ENUM('published', 'unpublished') NOT NULL DEFAULT 'unpublished',
  started_at DATETIME NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_peer_publication_term (department_id, academic_year, semester),
  CONSTRAINT fk_peer_publication_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  CONSTRAINT fk_peer_publication_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
