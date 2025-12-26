-- Migration: Enforce unique keys within collections
-- Created: 2025-05-22

-- 1. Delete duplicate entries within collections (keeping the oldest)
DELETE FROM key_value_entries
WHERE collection_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM key_value_entries
    WHERE collection_id IS NOT NULL
    GROUP BY collection_id, key
  );

-- 2. Create unique index to enforce constraint
-- SQLite treats NULLs as distinct, so multiple (NULL, key) rows are allowed,
-- matching the requirement that duplicates are fine if no collection.
CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_collection_key_unique ON key_value_entries(collection_id, key);
