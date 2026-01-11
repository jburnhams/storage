-- Migration: Add user_type enum column
-- Created: 2024-05-22

-- Add user_type column
ALTER TABLE users ADD COLUMN user_type TEXT NOT NULL DEFAULT 'STANDARD';

-- Migrate existing admins
UPDATE users SET user_type = 'ADMIN' WHERE is_admin = 1;
