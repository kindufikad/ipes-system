-- Lab assistant peer evaluators are users, not instructors.
ALTER TABLE peer_evaluations
  MODIFY COLUMN evaluator_id INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS evaluator_user_id INT UNSIGNED NULL AFTER evaluator_id;

CREATE INDEX IF NOT EXISTS idx_peer_evaluations_evaluator_user
  ON peer_evaluations(evaluator_user_id);

SET @evaluator_user_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'peer_evaluations'
    AND CONSTRAINT_NAME = 'fk_peer_evaluations_evaluator_user'
);
SET @add_evaluator_user_fk = IF(
  @evaluator_user_fk_exists = 0,
  'ALTER TABLE peer_evaluations ADD CONSTRAINT fk_peer_evaluations_evaluator_user FOREIGN KEY (evaluator_user_id) REFERENCES users(id) ON DELETE CASCADE',
  'DO 0'
);
PREPARE add_evaluator_user_fk_stmt FROM @add_evaluator_user_fk;
EXECUTE add_evaluator_user_fk_stmt;
DEALLOCATE PREPARE add_evaluator_user_fk_stmt;