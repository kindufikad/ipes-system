USE ipes_db;

-- A submitted assignment without a submission has no score and must be re-opened.
UPDATE peer_evaluations pe
LEFT JOIN peer_evaluation_submissions pes ON pes.peer_evaluation_id = pe.id
SET pe.status = 'pending', pe.submitted_at = NULL
WHERE pe.status IN ('submitted', 'completed')
  AND pes.id IS NULL;
