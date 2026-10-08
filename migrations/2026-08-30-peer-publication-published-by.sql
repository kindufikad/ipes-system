ALTER TABLE peer_evaluation_publications
  ADD COLUMN IF NOT EXISTS published_by INT UNSIGNED NULL AFTER created_by;