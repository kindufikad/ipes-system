-- Run against ipes_db in phpMyAdmin.
-- Existing registration_date values are preserved for student-history compatibility;
-- new registrations use created_at automatically and no longer accept manual dates.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10) NULL;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10) NULL;

ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10) NULL;

ALTER TABLE instructors
  DROP COLUMN IF EXISTS program_type,
  DROP COLUMN IF EXISTS registration_date;
