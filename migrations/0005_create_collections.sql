-- Migration: Create key_value_collections and link entries
-- Created: 2025-05-18

-- 1. Create key_value_collections table
CREATE TABLE IF NOT EXISTS key_value_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    secret TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_collections_user_id ON key_value_collections(user_id);
CREATE INDEX idx_collections_secret ON key_value_collections(secret);

-- 2. Add collection_id to key_value_entries
ALTER TABLE key_value_entries ADD COLUMN collection_id INTEGER REFERENCES key_value_collections(id) ON DELETE CASCADE;

CREATE INDEX idx_entries_collection_id ON key_value_entries(collection_id);
