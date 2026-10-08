USE ipes_db;

-- peer_evaluations stores evaluator_id/evaluatee_id as instructors.id.
-- Existing deployments may contain users.id values in evaluator_id from the old schema.
SET @missing_peer_instructor_ids = (
  SELECT COUNT(*)
  FROM peer_evaluations pe
  LEFT JOIN instructors evaluator ON evaluator.user_id = pe.evaluator_id
  WHERE evaluator.id IS NULL
);

SET @validation_sql = IF(
  @missing_peer_instructor_ids > 0,
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''peer_evaluations contains IDs that do not map to instructors''',
  'DO 0'
);
PREPARE validate_peer_ids FROM @validation_sql;
EXECUTE validate_peer_ids;
DEALLOCATE PREPARE validate_peer_ids;

SET @drop_evaluator_fk = IF(
  EXISTS (
    SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'peer_evaluations'
      AND CONSTRAINT_NAME = 'fk_peer_evaluations_evaluator'
  ),
  'ALTER TABLE peer_evaluations DROP FOREIGN KEY fk_peer_evaluations_evaluator',
  'DO 0'
);
PREPARE drop_evaluator_fk_stmt FROM @drop_evaluator_fk;
EXECUTE drop_evaluator_fk_stmt;
DEALLOCATE PREPARE drop_evaluator_fk_stmt;

SET @drop_evaluatee_fk = IF(
  EXISTS (
    SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'peer_evaluations'
      AND CONSTRAINT_NAME = 'fk_peer_evaluations_evaluatee'
  ),
  'ALTER TABLE peer_evaluations DROP FOREIGN KEY fk_peer_evaluations_evaluatee',
  'DO 0'
);
PREPARE drop_evaluatee_fk_stmt FROM @drop_evaluatee_fk;
EXECUTE drop_evaluatee_fk_stmt;
DEALLOCATE PREPARE drop_evaluatee_fk_stmt;

-- Convert legacy evaluator user IDs after removing the old users FK.
UPDATE peer_evaluations pe
INNER JOIN instructors evaluator ON evaluator.user_id = pe.evaluator_id
SET pe.evaluator_id = evaluator.id;

ALTER TABLE peer_evaluations
  ADD CONSTRAINT fk_peer_evaluations_evaluator
    FOREIGN KEY (evaluator_id) REFERENCES instructors(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_peer_evaluations_evaluatee
    FOREIGN KEY (evaluatee_id) REFERENCES instructors(id) ON DELETE CASCADE;
