-- Move profile data out of users while preserving existing values.
-- Run once against the IPES database before deploying the refactored API.

START TRANSACTION;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(255) NULL;

ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS profile_picture VARCHAR(255) NULL;

UPDATE students s
INNER JOIN users u ON u.id = s.user_id
SET s.gender = COALESCE(s.gender, u.gender),
    s.phone_number = COALESCE(s.phone_number, u.phone_number),
    s.profile_picture = COALESCE(s.profile_picture, u.profile_picture);

UPDATE instructors i
INNER JOIN users u ON u.id = i.user_id
SET i.gender = COALESCE(i.gender, u.gender),
    i.phone_number = COALESCE(i.phone_number, u.phone_number),
    i.profile_picture = COALESCE(i.profile_picture, u.profile_picture);

ALTER TABLE users
  DROP COLUMN IF EXISTS student_id,
  DROP COLUMN IF EXISTS college_id,
  DROP COLUMN IF EXISTS department_id,
  DROP COLUMN IF EXISTS gender,
  DROP COLUMN IF EXISTS phone_number,
  DROP COLUMN IF EXISTS profile_picture,
  DROP COLUMN IF EXISTS username,
  DROP COLUMN IF EXISTS full_name,
  DROP COLUMN IF EXISTS department,
  DROP COLUMN IF EXISTS department_name,
  DROP COLUMN IF EXISTS college,
  DROP COLUMN IF EXISTS academic_year,
  DROP COLUMN IF EXISTS semester,
  DROP COLUMN IF EXISTS year,
  DROP COLUMN IF EXISTS section,
  DROP COLUMN IF EXISTS specialization,
  DROP COLUMN IF EXISTS learning_level,
  DROP COLUMN IF EXISTS employee_id,
  DROP COLUMN IF EXISTS program_type,
  DROP COLUMN IF EXISTS updated_at;

COMMIT;