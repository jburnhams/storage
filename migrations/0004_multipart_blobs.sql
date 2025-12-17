-- Migration: Add support for multipart blobs
-- Created: 2025-12-16

-- 1. Create blob_parts table
CREATE TABLE IF NOT EXISTS blob_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value_id INTEGER NOT NULL,
    part_index INTEGER NOT NULL,
    data BLOB NOT NULL,
    FOREIGN KEY (value_id) REFERENCES value_entries(id) ON DELETE CASCADE
);

CREATE INDEX idx_blob_parts_value_id ON blob_parts(value_id);
CREATE INDEX idx_blob_parts_value_index ON blob_parts(value_id, part_index);

-- 2. Create new value_entries table with is_multipart and size columns
CREATE TABLE IF NOT EXISTS value_entries_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    string_value TEXT,
    blob_value BLOB,
    type TEXT NOT NULL,
    is_multipart INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        (is_multipart = 0 AND ((string_value IS NOT NULL AND blob_value IS NULL) OR (string_value IS NULL AND blob_value IS NOT NULL))) OR
        (is_multipart = 1 AND string_value IS NULL AND blob_value IS NULL)
    )
);

-- 3. Copy existing data
-- We assume existing data is not multipart.
-- We calculate size based on length of string or blob.
INSERT INTO value_entries_new (id, hash, string_value, blob_value, type, created_at, is_multipart, size)
SELECT
    id,
    hash,
    string_value,
    blob_value,
    type,
    created_at,
    0,
    CASE
        WHEN string_value IS NOT NULL THEN length(string_value)
        WHEN blob_value IS NOT NULL THEN length(blob_value)
        ELSE 0
    END
FROM value_entries;

-- 4. Swap tables
-- We need to handle foreign key constraints from key_value_entries
-- Since key_value_entries references value_entries(id), and we are preserving IDs, this should be fine
-- if we turn off FK checks momentarily or if SQLite handles rename correctly.
-- However, SQLite foreign keys are verified on commit. Rename usually tracks.

PRAGMA foreign_keys = OFF;

DROP TABLE value_entries;
ALTER TABLE value_entries_new RENAME TO value_entries;

PRAGMA foreign_keys = ON;

CREATE INDEX idx_values_hash ON value_entries(hash);
