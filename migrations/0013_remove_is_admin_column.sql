-- Migration to remove is_admin column from users table
-- We assume D1 supports ALTER TABLE DROP COLUMN (SQLite 3.35.0+)
-- Any legacy is_admin=1 should have been migrated to user_type='ADMIN' in 0012

-- Drop the index that depends on the column first
DROP INDEX IF EXISTS idx_users_is_admin;

-- Drop the column
ALTER TABLE users DROP COLUMN is_admin;
