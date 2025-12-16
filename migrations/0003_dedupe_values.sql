-- Migration: Extract values to deduplicate
-- Created: 2025-12-16

-- 1. Create new value_entries table
CREATE TABLE IF NOT EXISTS value_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL,
    string_value TEXT,
    blob_value BLOB,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ((string_value IS NOT NULL AND blob_value IS NULL) OR (string_value IS NULL AND blob_value IS NOT NULL))
);

CREATE INDEX idx_values_hash ON value_entries(hash);

-- 2. Migrate existing unique values
-- We group by hash, type, string_value, blob_value to dedupe
INSERT INTO value_entries (hash, string_value, blob_value, type, created_at)
SELECT secret, string_value, blob_value, type, MIN(created_at)
FROM key_value_entries
GROUP BY secret, type, string_value, blob_value;

-- 3. Create new key_value_entries table
CREATE TABLE IF NOT EXISTS key_value_entries_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value_id INTEGER NOT NULL,
    filename TEXT,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (value_id) REFERENCES value_entries(id) ON DELETE RESTRICT
);

-- 4. Migrate entries linking to values
-- We join back to find the value_id.
-- Note: logic assumes (secret, type, content) is unique in value_entries due to the GROUP BY above.
INSERT INTO key_value_entries_new (id, key, value_id, filename, user_id, created_at, updated_at)
SELECT
    k.id,
    k.key,
    v.id,
    k.filename,
    k.user_id,
    k.created_at,
    k.updated_at
FROM key_value_entries k
JOIN value_entries v ON
    v.hash = k.secret AND
    v.type = k.type AND
    (v.string_value IS k.string_value) AND
    (v.blob_value IS k.blob_value);
-- Note: IS operator handles NULL comparisons correctly in SQLite

-- 5. Swap tables
DROP TABLE key_value_entries;
ALTER TABLE key_value_entries_new RENAME TO key_value_entries;

CREATE INDEX idx_entries_key ON key_value_entries(key);
CREATE INDEX idx_entries_user_id ON key_value_entries(user_id);
CREATE INDEX idx_entries_value_id ON key_value_entries(value_id);
