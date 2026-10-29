USE ipes_db;

ALTER TABLE peer_evaluations
  ADD COLUMN IF NOT EXISTS submitted_at DATETIME NULL AFTER status;
