// ===== Database Models =====

export interface User {
  id: number;
  email: string;
  name: string;
  profile_picture: string | null;
  is_admin: number; // SQLite uses INTEGER for boolean (0 or 1)
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface Session {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  last_used_at: string;
}

export interface KeyValueCollection {
  id: number;
  name: string;
  description: string | null;
  secret: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  metadata: string | null;
  origin: string | null;
}

export interface ValueEntry {
    id: number;
    hash: string;
    string_value: string | null;
    blob_value: unknown | null;
    type: string;
    is_multipart: number;
    size: number;
    created_at: string;
}

export interface KeyValueEntry {
  id: number;
  key: string;
  value_id: number;
  filename: string | null;
  user_id: number;
  collection_id: number | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
  origin: string | null;
}

// Joined representation for API
export interface KeyValueEntryJoined extends KeyValueEntry {
    hash: string;
    string_value: string | null;
    blob_value: unknown | null;
    type: string;
    is_multipart: number;
    size: number;
}

// ===== API Response Types =====

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

export interface KeyValueCollectionResponse {
  id: number;
  name: string;
  description: string | null;
  secret: string;
  user_id: number;
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
  secret: string; // Map hash to secret for API compatibility
  type: string;
  filename: string | null;
  user_id: number;
  collection_id: number | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
  origin: string | null;
}

// ===== API Request Types =====

export interface CreateEntryRequest {
  key: string;
  value: string; // If type implies blob (e.g. multipart upload), this might be handled differently
  type: string;
  filename?: string;
  collection_id?: number | null;
  metadata?: string;
  // For JSON API usage, we might accept base64 for blobs or rely on multipart/form-data
}

// ===== OAuth Types =====

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
  given_name: string;
  family_name: string;
}

// ===== Environment Bindings =====

export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  YOUTUBE_API_KEY: string;
  YOUTUBE_API_BASE_URL?: string; // Optional for testing
}

// ===== YouTube Models =====

export interface YoutubeChannel {
  youtube_id: string;
  title: string;
  description: string;
  custom_url: string | null;
  thumbnail_url: string;
  published_at: string;
  statistics: string; // JSON
  raw_json: string; // JSON
  created_at: string;
  updated_at: string;
}

export interface YoutubeVideo {
  youtube_id: string;
  title: string;
  description: string;
  published_at: string;
  channel_id: string;
  thumbnail_url: string;
  duration: string;
  statistics: string; // JSON
  raw_json: string; // JSON
  created_at: string;
  updated_at: string;
}

// ===== YouTube API Response Types (Partial) =====

export interface YoutubeThumbnail {
  url: string;
  width: number;
  height: number;
}

export interface YoutubeThumbnails {
  default?: YoutubeThumbnail;
  medium?: YoutubeThumbnail;
  high?: YoutubeThumbnail;
  standard?: YoutubeThumbnail;
  maxres?: YoutubeThumbnail;
}

export interface YoutubeChannelSnippet {
  title: string;
  description: string;
  customUrl?: string;
  publishedAt: string;
  thumbnails: YoutubeThumbnails;
  country?: string;
}

export interface YoutubeChannelStatistics {
  viewCount: string;
  subscriberCount: string; // hiddenSubscriberCount
  hiddenSubscriberCount: boolean;
  videoCount: string;
}

export interface YoutubeChannelResource {
  kind: "youtube#channel";
  etag: string;
  id: string;
  snippet: YoutubeChannelSnippet;
  statistics: YoutubeChannelStatistics;
}

export interface YoutubeVideoSnippet {
  publishedAt: string;
  channelId: string;
  title: string;
  description: string;
  thumbnails: YoutubeThumbnails;
  channelTitle: string;
  tags?: string[];
  categoryId: string;
  liveBroadcastContent: string;
}

export interface YoutubeVideoContentDetails {
  duration: string;
  dimension: string;
  definition: string;
  caption: string;
  licensedContent: boolean;
  contentRating: any;
  projection: string;
}

export interface YoutubeVideoStatistics {
  viewCount: string;
  likeCount: string;
  favoriteCount: string;
  commentCount: string;
}

export interface YoutubeVideoResource {
  kind: "youtube#video";
  etag: string;
  id: string;
  snippet: YoutubeVideoSnippet;
  contentDetails: YoutubeVideoContentDetails;
  statistics: YoutubeVideoStatistics;
}

export interface YoutubeListResponse<T> {
  kind: string;
  etag: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: T[];
}

// ===== Admin Operations =====

export interface PromoteAdminRequest {
  email: string;
}

export interface YoutubeSearchResource {
  kind: "youtube#searchResult";
  etag: string;
  id: {
    kind: string;
    videoId?: string;
    channelId?: string;
    playlistId?: string;
  };
  snippet: YoutubeVideoSnippet;
}
