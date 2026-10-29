ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS is_system_locked TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lock_reason VARCHAR(500) NOT NULL DEFAULT 'System temporarily locked by System Admin';

INSERT INTO system_settings (setting_key, setting_value, is_system_locked, lock_reason)
VALUES ('system_access_control', NULL, 0, 'System temporarily locked by System Admin')
ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key);
