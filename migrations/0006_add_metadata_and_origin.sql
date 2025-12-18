-- Migration: Add metadata and origin columns to entries and collections
-- Created: 2025-05-23

-- 1. Add columns to key_value_entries
ALTER TABLE key_value_entries ADD COLUMN metadata TEXT;
ALTER TABLE key_value_entries ADD COLUMN origin TEXT;

-- 2. Add columns to key_value_collections
ALTER TABLE key_value_collections ADD COLUMN metadata TEXT;
ALTER TABLE key_value_collections ADD COLUMN origin TEXT;
