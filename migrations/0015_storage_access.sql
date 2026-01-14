-- Migration number: 0015 	 2024-05-22T00:00:00.000Z

CREATE TABLE storage_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    collection_id INTEGER REFERENCES key_value_collections(id) ON DELETE CASCADE,
    key_value_entry_id INTEGER REFERENCES key_value_entries(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL CHECK (access_level IN ('READONLY', 'READWRITE', 'ADMIN')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_target CHECK (
        (collection_id IS NOT NULL AND key_value_entry_id IS NULL) OR
        (collection_id IS NULL AND key_value_entry_id IS NOT NULL)
    ),
    CONSTRAINT unique_collection_access UNIQUE (user_id, collection_id),
    CONSTRAINT unique_entry_access UNIQUE (user_id, key_value_entry_id)
);

CREATE INDEX idx_storage_access_user ON storage_access(user_id);
CREATE INDEX idx_storage_access_collection ON storage_access(collection_id);
CREATE INDEX idx_storage_access_entry ON storage_access(key_value_entry_id);
