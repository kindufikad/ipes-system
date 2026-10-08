ALTER TABLE users
  ADD COLUMN IF NOT EXISTS language ENUM('en', 'am') NOT NULL DEFAULT 'am' AFTER telegram_chat_id;