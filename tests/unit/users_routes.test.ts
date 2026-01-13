import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { env, applyD1Migrations, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../../src/worker';

describe('User Detail API (GET /api/users/:id)', () => {
  let adminSessionId: string;
  let userSessionId: string;
  let otherUserSessionId: string;
  let adminUser: any;
  let regularUser: any;
  let otherUser: any;

  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    // Clear database
    await env.DB.prepare('DELETE FROM sessions').run();
    await env.DB.prepare('DELETE FROM users').run();

    // Create admin user
    adminUser = await env.DB.prepare(
      `INSERT INTO users (email, name, user_type, created_at, updated_at) VALUES (?, ?, 'ADMIN', datetime('now'), datetime('now')) RETURNING *`
    )
      .bind('admin@example.com', 'Admin User')
      .first<any>();

    // Create regular user
    regularUser = await env.DB.prepare(
      `INSERT INTO users (email, name, user_type, created_at, updated_at) VALUES (?, ?, 'STANDARD', datetime('now'), datetime('now')) RETURNING *`
    )
      .bind('user@example.com', 'Regular User')
      .first<any>();

    // Create another regular user
    otherUser = await env.DB.prepare(
      `INSERT INTO users (email, name, user_type, created_at, updated_at) VALUES (?, ?, 'STANDARD', datetime('now'), datetime('now')) RETURNING *`
    )
      .bind('other@example.com', 'Other User')
      .first<any>();

    // Create sessions
    adminSessionId = 'admin-session';
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
    )
      .bind(adminSessionId, adminUser.id, new Date(Date.now() + 3600000).toISOString())
      .run();

    userSessionId = 'user-session';
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
    )
      .bind(userSessionId, regularUser.id, new Date(Date.now() + 3600000).toISOString())
      .run();

    otherUserSessionId = 'other-session';
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
    )
      .bind(otherUserSessionId, otherUser.id, new Date(Date.now() + 3600000).toISOString())
      .run();
  });

  it('allows admin to access any user data', async () => {
    const ctx = createExecutionContext();
    const request = new Request(`http://localhost/api/users/${regularUser.id}`, {
      method: 'GET',
      headers: { Cookie: `storage_session=${adminSessionId}` },
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const user = await response.json<any>();
    expect(user.id).toBe(regularUser.id);
    expect(user.email).toBe(regularUser.email);
  });

  it('allows user to access their own data', async () => {
    const ctx = createExecutionContext();
    const request = new Request(`http://localhost/api/users/${regularUser.id}`, {
      method: 'GET',
      headers: { Cookie: `storage_session=${userSessionId}` },
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const user = await response.json<any>();
    expect(user.id).toBe(regularUser.id);
    expect(user.email).toBe(regularUser.email);
  });

  it('forbids user from accessing other user data', async () => {
    const ctx = createExecutionContext();
    const request = new Request(`http://localhost/api/users/${otherUser.id}`, {
      method: 'GET',
      headers: { Cookie: `storage_session=${userSessionId}` },
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(403);
  });

  it('returns 404 for non-existent user (as admin)', async () => {
    const ctx = createExecutionContext();
    const request = new Request(`http://localhost/api/users/99999`, {
      method: 'GET',
      headers: { Cookie: `storage_session=${adminSessionId}` },
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
  });

  it('returns 403 when user tries to access non-existent user', async () => {
    // Because they can't access ANY user other than themselves
    const ctx = createExecutionContext();
    const request = new Request(`http://localhost/api/users/99999`, {
      method: 'GET',
      headers: { Cookie: `storage_session=${userSessionId}` },
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(403);
  });
});
