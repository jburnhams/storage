-- Migration: Add support for multipart blobs
-- Created: 2025-12-16

-- 1. Create new value_entries table with is_multipart and size columns
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

-- 2. Copy existing data to value_entries_new
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

-- 3. Create temporary key_value_entries table pointing to value_entries_new
CREATE TABLE IF NOT EXISTS key_value_entries_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value_id INTEGER NOT NULL,
    filename TEXT,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (value_id) REFERENCES value_entries_new(id) ON DELETE RESTRICT
);

-- 4. Copy data to key_value_entries_new
INSERT INTO key_value_entries_new (id, key, value_id, filename, user_id, created_at, updated_at)
SELECT id, key, value_id, filename, user_id, created_at, updated_at
FROM key_value_entries;

-- 5. Drop old tables
DROP TABLE key_value_entries;
DROP TABLE value_entries;

-- 6. Rename new tables
ALTER TABLE value_entries_new RENAME TO value_entries;
ALTER TABLE key_value_entries_new RENAME TO key_value_entries;

-- 7. Recreate indices
CREATE INDEX idx_values_hash ON value_entries(hash);
CREATE INDEX idx_entries_key ON key_value_entries(key);
CREATE INDEX idx_entries_user_id ON key_value_entries(user_id);
CREATE INDEX idx_entries_value_id ON key_value_entries(value_id);

-- 8. Create blob_parts table (referencing the new value_entries)
CREATE TABLE IF NOT EXISTS blob_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value_id INTEGER NOT NULL,
    part_index INTEGER NOT NULL,
    data BLOB NOT NULL,
    FOREIGN KEY (value_id) REFERENCES value_entries(id) ON DELETE CASCADE
);

CREATE INDEX idx_blob_parts_value_id ON blob_parts(value_id);
CREATE INDEX idx_blob_parts_value_index ON blob_parts(value_id, part_index);
