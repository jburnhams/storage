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
}

// ===== API Request Types =====

export interface CreateEntryRequest {
  key: string;
  value: string; // If type implies blob (e.g. multipart upload), this might be handled differently
  type: string;
  filename?: string;
  collection_id?: number | null;
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
}

// ===== Admin Operations =====

export interface PromoteAdminRequest {
  email: string;
}
