-- Link student authentication records to their student profile.
-- Run after the users and students tables have been created.

START TRANSACTION;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS student_id VARCHAR(50) NULL;

UPDATE users u
INNER JOIN students s ON s.user_id = u.id
SET u.email = s.student_id,
    u.student_id = s.student_id
WHERE u.role = 'student';

ALTER TABLE users
  ADD CONSTRAINT fk_users_students
  FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE;

COMMIT;