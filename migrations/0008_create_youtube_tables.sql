-- Create YouTube Channels table
CREATE TABLE youtube_channels (
  youtube_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  custom_url TEXT,
  thumbnail_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  statistics TEXT NOT NULL, -- JSON
  raw_json TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Create YouTube Videos table
CREATE TABLE youtube_videos (
  youtube_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  published_at TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  duration TEXT NOT NULL,
  statistics TEXT NOT NULL, -- JSON
  raw_json TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
