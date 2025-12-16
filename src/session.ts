import type { Env, Session, User, UserResponse, SessionResponse } from "./types";

const SESSION_DURATION_DAYS = 7;
const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

// Master list of admin emails
const MASTER_ADMIN_EMAILS = [
  // Add your admin emails here when you have them
  // Example: "admin@jonathanburnhams.com"
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
  const now = new Date().toISOString();

  const result = await env.DB.prepare(
    `INSERT INTO users (email, name, profile_picture, is_admin, created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(email, name, profilePicture, isAdmin, now, now, now)
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
  return user.is_admin === 1 || MASTER_ADMIN_EMAILS.includes(user.email);
}

/**
 * Promote user to admin
 */
export async function promoteUserToAdmin(
  email: string,
  env: Env
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users SET is_admin = 1, updated_at = ? WHERE email = ?`
  )
    .bind(now, email)
    .run();
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
  const result = await env.DB.prepare(
    `SELECT
       s.id, s.user_id, s.created_at, s.expires_at, s.last_used_at,
       u.id as user_id, u.email, u.name, u.profile_picture, u.is_admin,
       u.created_at as user_created_at, u.updated_at, u.last_login_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.expires_at > datetime('now')
     ORDER BY s.created_at DESC`
  ).all();

  const sessions: SessionResponse[] = [];
  for (const row of result.results || []) {
    sessions.push({
      id: (row as any).id,
      user_id: (row as any).user_id,
      created_at: (row as any).created_at,
      expires_at: (row as any).expires_at,
      last_used_at: (row as any).last_used_at,
      user: userToResponse({
        id: (row as any).user_id,
        email: (row as any).email,
        name: (row as any).name,
        profile_picture: (row as any).profile_picture,
        is_admin: (row as any).is_admin,
        created_at: (row as any).user_created_at,
        updated_at: (row as any).updated_at,
        last_login_at: (row as any).last_login_at,
      }),
    });
  }

  return sessions;
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
    is_admin: user.is_admin === 1 || MASTER_ADMIN_EMAILS.includes(user.email),
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login_at: user.last_login_at,
  };
}
