-- Migration: Create key_value_entries table
-- Created: 2025-12-16

CREATE TABLE IF NOT EXISTS key_value_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    string_value TEXT,
    blob_value BLOB,
    secret TEXT NOT NULL,
    type TEXT NOT NULL,
    filename TEXT,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CHECK ((string_value IS NOT NULL AND blob_value IS NULL) OR (string_value IS NULL AND blob_value IS NOT NULL))
);

CREATE INDEX idx_entries_key ON key_value_entries(key);
CREATE INDEX idx_entries_user_id ON key_value_entries(user_id);
CREATE INDEX idx_entries_key_secret ON key_value_entries(key, secret);
