export interface UserResponse {
  id: number;
  email: string;
  name: string;
  profile_picture: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface SessionResponse {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  last_used_at: string;
  user?: UserResponse;
}

export interface ErrorResponse {
  error: string;
  message: string;
}

export interface KeyValueCollection {
    id: number;
    name: string;
    description: string | null;
    secret: string;
    created_at: string;
    updated_at: string;
    metadata: string | null;
    origin: string | null;
}

export interface KeyValueEntryResponse {
  id: number;
  key: string;
  string_value: string | null;
  has_blob: boolean;
  secret: string;
  type: string;
  filename: string | null;
  user_id: number;
  collection_id: number | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
  origin: string | null;
}

export interface YoutubeChannel {
  youtube_id: string;
  title: string;
  description: string;
  custom_url: string | null;
  thumbnail_url: string;
  published_at: string;
  statistics: string; // JSON string
  raw_json: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface YoutubeVideo {
  youtube_id: string;
  title: string;
  description: string;
  published_at: string;
  channel_id: string;
  channel_title?: string;
  thumbnail_url: string;
  duration: string;
  statistics: string; // JSON string
  raw_json: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface YoutubeSyncResponse {
    count: number;
    range_start: string | null;
    range_end: string | null;
    sample_video: YoutubeVideo | null;
    is_complete: boolean;
}
