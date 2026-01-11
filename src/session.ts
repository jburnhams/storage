import type { Env, Session, User, UserResponse, SessionResponse } from "./types";
import type { UpdateUserRequest, CreateUserRequest } from "./schemas";

const SESSION_DURATION_DAYS = 7;
const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

// Master list of admin emails
export const MASTER_ADMIN_EMAILS = [
  "jburnhams@gmail.com"
];

/**
 * Generate a cryptographically secure session ID
 */
export function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

/**
 * Create a new session for a user
 */
export async function createSession(
  userId: number,
  env: Env
): Promise<Session> {
  const sessionId = generateSessionId();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(sessionId, userId, now, expiresAt, now)
    .run();

  return {
    id: sessionId,
    user_id: userId,
    created_at: now,
    expires_at: expiresAt,
    last_used_at: now,
  };
}

/**
 * Get session by ID
 */
export async function getSession(
  sessionId: string,
  env: Env
): Promise<Session | null> {
  const result = await env.DB.prepare(
    `SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')`
  )
    .bind(sessionId)
    .first<Session>();

  return result;
}

/**
 * Update session last_used_at timestamp
 */
export async function updateSessionLastUsed(
  sessionId: string,
  env: Env
): Promise<void> {
  await env.DB.prepare(
    `UPDATE sessions SET last_used_at = datetime('now') WHERE id = ?`
  )
    .bind(sessionId)
    .run();
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(
  sessionId: string,
  env: Env
): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`)
    .bind(sessionId)
    .run();
}

/**
 * Delete all expired sessions (cleanup)
 */
export async function deleteExpiredSessions(env: Env): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM sessions WHERE expires_at <= datetime('now')`
  ).run();
}

/**
 * Get or create user from Google profile
 */
export async function getOrCreateUser(
  email: string,
  name: string,
  profilePicture: string,
  env: Env
): Promise<User> {
  // Check if user exists
  const existingUser = await env.DB.prepare(
    `SELECT * FROM users WHERE email = ?`
  )
    .bind(email)
    .first<User>();

  if (existingUser) {
    // Update user info and last login
    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE users
       SET name = ?, profile_picture = ?, updated_at = ?, last_login_at = ?
       WHERE id = ?`
    )
      .bind(name, profilePicture, now, now, existingUser.id)
      .run();

    return {
      ...existingUser,
      name,
      profile_picture: profilePicture,
      updated_at: now,
      last_login_at: now,
    };
  }

  // Create new user
  const isAdmin = MASTER_ADMIN_EMAILS.includes(email) ? 1 : 0;
  const userType = isAdmin ? 'ADMIN' : 'STANDARD';
  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    `INSERT INTO users (email, name, profile_picture, user_type, is_admin, created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(email, name, profilePicture, userType, isAdmin, now, now, now)
    .first<User>();

  if (!result) {
    throw new Error("Failed to create user");
  }

  return result;
}

/**
 * Get user by ID
 */
export async function getUserById(
  userId: number,
  env: Env
): Promise<User | null> {
  return await env.DB.prepare(`SELECT * FROM users WHERE id = ?`)
    .bind(userId)
    .first<User>();
}

/**
 * Get user by email
 */
export async function getUserByEmail(
  email: string,
  env: Env
): Promise<User | null> {
  return await env.DB.prepare(`SELECT * FROM users WHERE email = ?`)
    .bind(email)
    .first<User>();
}

/**
 * Check if user is admin (checks both master list and database)
 */
export function isUserAdmin(user: User): boolean {
  return user.user_type === 'ADMIN' || user.is_admin === 1 || MASTER_ADMIN_EMAILS.includes(user.email);
}

/**
 * Promote user to admin
 */
export async function promoteUserToAdmin(
  email: string,
  env: Env
): Promise<void> {
  // First check if user exists
  const user = await env.DB.prepare(
    `SELECT * FROM users WHERE email = ?`
  )
    .bind(email)
    .first<User>();

  if (!user) {
    throw new Error('User not found');
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users SET user_type = 'ADMIN', is_admin = 1, updated_at = ? WHERE email = ?`
  )
    .bind(now, email)
    .run();
}

/**
 * Update user details
 */
export async function updateUser(
  userId: number,
  updates: UpdateUserRequest,
  env: Env
): Promise<User | null> {
  const user = await getUserById(userId, env);
  if (!user) {
    return null;
  }

  const fields: string[] = [];
  const values: any[] = [];
  const now = new Date().toISOString();

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.email !== undefined) {
    fields.push("email = ?");
    values.push(updates.email);
  }

  // Handle user_type and is_admin legacy
  if (updates.user_type !== undefined) {
    fields.push("user_type = ?");
    values.push(updates.user_type);

    // Sync is_admin
    fields.push("is_admin = ?");
    values.push(updates.user_type === 'ADMIN' ? 1 : 0);
  } else if (updates.is_admin !== undefined) {
    fields.push("is_admin = ?");
    values.push(updates.is_admin ? 1 : 0);

    // Sync user_type
    fields.push("user_type = ?");
    values.push(updates.is_admin ? 'ADMIN' : 'STANDARD');
  }

  if (updates.profile_picture !== undefined) {
    fields.push("profile_picture = ?");
    values.push(updates.profile_picture);
  }

  if (fields.length === 0) {
    return user;
  }

  fields.push("updated_at = ?");
  values.push(now);

  values.push(userId);

  const query = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;
  await env.DB.prepare(query).bind(...values).run();

  return await getUserById(userId, env);
}

/**
 * Delete user and associated data
 */
export async function deleteUser(
  userId: number,
  env: Env
): Promise<void> {
  // Due to ON DELETE CASCADE constraints, this should remove sessions, entries, collections
  await env.DB.prepare(`DELETE FROM users WHERE id = ?`)
    .bind(userId)
    .run();
}

/**
 * Create a new user manually (e.g. by admin)
 */
export async function createUser(
  request: CreateUserRequest,
  env: Env
): Promise<User> {
  const existingUser = await getUserByEmail(request.email, env);
  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  const now = new Date().toISOString();

  // Determine user_type (prioritize explicit type, fallback to is_admin legacy flag, default to STANDARD)
  const userType = request.user_type || (request.is_admin ? 'ADMIN' : 'STANDARD');

  // Sync is_admin based on the final userType
  const isAdmin = userType === 'ADMIN' ? 1 : 0;

  const profilePicture = request.profile_picture || null;

  const result = await env.DB.prepare(
    `INSERT INTO users (email, name, profile_picture, user_type, is_admin, created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(request.email, request.name, profilePicture, userType, isAdmin, now, now, null)
    .first<User>();

  if (!result) {
    throw new Error("Failed to create user");
  }

  return result;
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers(env: Env): Promise<User[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM users ORDER BY created_at DESC`
  ).all<User>();

  return result.results || [];
}

/**
 * Get all sessions (admin only)
 */
export async function getAllSessions(env: Env): Promise<SessionResponse[]> {
  interface SessionWithUser {
    session_id: string;
    session_user_id: number;
    session_created_at: string;
    session_expires_at: string;
    session_last_used_at: string;
    user_id: number;
    user_email: string;
    user_name: string;
    user_profile_picture: string | null;
    user_type: string;
    user_is_admin: number;
    user_created_at: string;
    user_updated_at: string;
    user_last_login_at: string | null;
  }

  const result = await env.DB.prepare(
    `SELECT
       s.id as session_id,
       s.user_id as session_user_id,
       s.created_at as session_created_at,
       s.expires_at as session_expires_at,
       s.last_used_at as session_last_used_at,
       u.id as user_id,
       u.email as user_email,
       u.name as user_name,
       u.profile_picture as user_profile_picture,
       u.user_type as user_type,
       u.is_admin as user_is_admin,
       u.created_at as user_created_at,
       u.updated_at as user_updated_at,
       u.last_login_at as user_last_login_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.expires_at > datetime('now')
     ORDER BY s.created_at DESC`
  ).all<SessionWithUser>();

  return (result.results || []).map((row) => ({
    id: row.session_id,
    user_id: row.session_user_id,
    created_at: row.session_created_at,
    expires_at: row.session_expires_at,
    last_used_at: row.session_last_used_at,
    user: userToResponse({
      id: row.user_id,
      email: row.user_email,
      name: row.user_name,
      profile_picture: row.user_profile_picture,
      user_type: row.user_type as any,
      is_admin: row.user_is_admin,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
      last_login_at: row.user_last_login_at,
    }),
  }));
}

/**
 * Convert User to UserResponse (transform is_admin from number to boolean)
 */
export function userToResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    profile_picture: user.profile_picture,
    user_type: user.user_type,
    is_admin: user.user_type === 'ADMIN' || user.is_admin === 1 || MASTER_ADMIN_EMAILS.includes(user.email),
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_login_at,
  };
}
