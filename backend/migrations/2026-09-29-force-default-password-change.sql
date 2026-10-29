ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;

-- Apply once: this intentionally resets every existing account to the shared initial password.
UPDATE users
SET password_hash = '$2a$12$QI1zxJ2kv5mE4b7eFiaruOPio2Sko5PVStrAD5oxBymsoDyBksKUy',
    must_change_password = TRUE,
    is_first_login = TRUE;