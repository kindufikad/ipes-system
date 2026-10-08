-- Lab assistant peer evaluations are identified by dispatch_id rather than
-- the instructor-only evaluatee_id foreign key.
ALTER TABLE peer_evaluations
  MODIFY COLUMN evaluatee_id INT UNSIGNED DEFAULT NULL;