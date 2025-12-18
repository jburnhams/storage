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
