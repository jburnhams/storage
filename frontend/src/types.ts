export type UserType = 'GUEST' | 'STANDARD' | 'ADMIN';

export interface UserResponse {
  id: number;
  email: string;
  name: string;
  profile_picture: string | null;
  user_type: UserType;
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

export type AccessLevel = 'READONLY' | 'READWRITE' | 'ADMIN';

export interface StorageAccess {
  id: number;
  user_id: number;
  collection_id: number | null;
  key_value_entry_id: number | null;
  access_level: AccessLevel;
  created_at: string;
  user_email?: string;
  user_name?: string;
  user_avatar?: string | null;
}

export interface YoutubeChannel {
  youtube_id: string;
  title: string;
  description: string;
  custom_url: string | null;
  thumbnail_url: string;
  published_at: string;
  raw_json: string; // JSON string
  created_at: string;
  updated_at: string;
  sync_start_date?: string | null;
  view_count?: number | null;
  subscriber_count?: number | null;
  video_count?: number | null;
  country?: string | null;
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
  raw_json: string; // JSON string
  created_at: string;
  updated_at: string;
  view_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  duration_seconds?: number | null;
}

export interface YoutubeSyncResponse {
  count: number;
  range_start: string | null;
  range_end: string | null;
  sample_video: YoutubeVideo | null;
  is_complete: boolean;
  total_stored_videos: number;
}
