USE ipes_db;

START TRANSACTION;

CREATE TEMPORARY TABLE peer_evaluation_keep (
  evaluator_id INT UNSIGNED NOT NULL,
  evaluatee_id INT UNSIGNED NOT NULL,
  keep_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (evaluator_id, evaluatee_id)
) ENGINE = InnoDB;

-- Keep the oldest submitted/completed record when one exists; otherwise keep the oldest record.
INSERT INTO peer_evaluation_keep (evaluator_id, evaluatee_id, keep_id)
SELECT pe.evaluator_id,
       pe.evaluatee_id,
       COALESCE(
         MIN(CASE
           WHEN LOWER(pe.status) IN ('submitted', 'completed', 'approved')
             OR EXISTS (
               SELECT 1
               FROM peer_evaluation_submissions pes
               WHERE pes.peer_evaluation_id = pe.id
             )
           THEN pe.id
         END),
         MIN(pe.id)
       ) AS keep_id
FROM peer_evaluations pe
WHERE pe.evaluatee_id IS NOT NULL
GROUP BY pe.evaluator_id, pe.evaluatee_id;

-- Remove submissions attached to duplicate assignment rows before deleting those rows.
DELETE pes
FROM peer_evaluation_submissions pes
INNER JOIN peer_evaluations pe ON pe.id = pes.peer_evaluation_id
INNER JOIN peer_evaluation_keep keep_row
  ON keep_row.evaluator_id = pe.evaluator_id
 AND keep_row.evaluatee_id = pe.evaluatee_id
WHERE pe.id <> keep_row.keep_id;

DELETE pe
FROM peer_evaluations pe
INNER JOIN peer_evaluation_keep keep_row
  ON keep_row.evaluator_id = pe.evaluator_id
 AND keep_row.evaluatee_id = pe.evaluatee_id
WHERE pe.id <> keep_row.keep_id;

DROP TEMPORARY TABLE peer_evaluation_keep;

ALTER TABLE peer_evaluations
  DROP INDEX uk_peer_eval,
  ADD CONSTRAINT unique_evaluator_evaluatee_pair
  UNIQUE (evaluator_id, evaluatee_id);

COMMIT;
