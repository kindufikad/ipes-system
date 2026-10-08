ALTER TABLE evaluation_criteria
  ADD COLUMN target_role VARCHAR(50) DEFAULT 'instructor';

UPDATE evaluation_criteria
SET target_role = 'instructor'
WHERE target_role IS NULL OR TRIM(target_role) = '';
