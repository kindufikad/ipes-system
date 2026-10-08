-- Consolidate duplicate evaluation_results rows for instructor 42.
-- Run this script once against the IPES database.

START TRANSACTION;

CREATE TEMPORARY TABLE tmp_evaluation_results_42 AS
SELECT
  instructor_id,
  MAX(department_id) AS department_id,
  academic_year,
  semester,
  COALESCE(MAX(NULLIF(student_average, 0)), 0.00) AS student_average,
  COALESCE(MAX(NULLIF(peer_average, 0)), 0.00) AS peer_average,
  COALESCE(MAX(NULLIF(dept_head_score, 0)), 0.00) AS dept_head_score,
  COALESCE(MAX(NULLIF(student_score, 0)), 0.00) AS student_score,
  COALESCE(MAX(NULLIF(peer_score, 0)), 0.00) AS peer_score,
  MAX(published_at) AS published_at
FROM evaluation_results
WHERE instructor_id = 42
GROUP BY instructor_id, academic_year, semester;

DELETE FROM evaluation_results
WHERE instructor_id = 42;

INSERT INTO evaluation_results (
  instructor_id,
  department_id,
  academic_year,
  semester,
  student_average,
  student_score,
  peer_average,
  peer_score,
  dept_head_score,
  total_score,
  final_score,
  published_at
)
SELECT
  instructor_id,
  department_id,
  academic_year,
  semester,
  student_average,
  student_score,
  peer_average,
  peer_score,
  dept_head_score,
  ROUND(
    (student_average * 0.50) +
    ((CASE
       WHEN dept_head_score BETWEEN 0.01 AND 30 THEN (dept_head_score / 30) * 100
       ELSE dept_head_score
     END) * 0.30) +
    (peer_average * 0.20),
    2
  ) AS total_score,
  ROUND(
    (student_average * 0.50) +
    ((CASE
       WHEN dept_head_score BETWEEN 0.01 AND 30 THEN (dept_head_score / 30) * 100
       ELSE dept_head_score
     END) * 0.30) +
    (peer_average * 0.20),
    2
  ) AS final_score,
  COALESCE(published_at, CURRENT_TIMESTAMP)
FROM tmp_evaluation_results_42;

DROP TEMPORARY TABLE tmp_evaluation_results_42;

-- Add the invariant after duplicates have been removed. This is safe to rerun.
SET @evaluation_results_unique_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'evaluation_results'
    AND index_name = 'uk_evaluation_results_instructor_term'
);

SET @add_evaluation_results_unique_index := IF(
  @evaluation_results_unique_index_exists = 0,
  'ALTER TABLE evaluation_results ADD UNIQUE KEY uk_evaluation_results_instructor_term (instructor_id, academic_year, semester)',
  'SELECT 1'
);

PREPARE add_evaluation_results_unique_index FROM @add_evaluation_results_unique_index;
EXECUTE add_evaluation_results_unique_index;
DEALLOCATE PREPARE add_evaluation_results_unique_index;

COMMIT;
