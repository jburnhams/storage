-- Add password_salt and password_hash columns to users table
ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- Backfill salt for existing users with random hex string (32 chars = 16 bytes)
UPDATE users SET password_salt = hex(randomblob(16)) WHERE password_salt IS NULL;
