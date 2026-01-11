import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { env, applyD1Migrations, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../../src/worker';

describe('User Management API', () => {
  let adminSessionId: string;
  let userSessionId: string;
  let adminUser: any;
  let regularUser: any;

  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    // Clear database
    await env.DB.prepare('DELETE FROM sessions').run();
    await env.DB.prepare('DELETE FROM users').run();

    // Create admin user
    const adminRes = await env.DB.prepare(
      `INSERT INTO users (email, name, user_type, created_at, updated_at) VALUES (?, ?, 'ADMIN', datetime('now'), datetime('now')) RETURNING *`
    )
      .bind('admin@example.com', 'Admin User')
      .first<any>();
    adminUser = adminRes;

    // Create regular user
    const userRes = await env.DB.prepare(
      `INSERT INTO users (email, name, user_type, created_at, updated_at) VALUES (?, ?, 'STANDARD', datetime('now'), datetime('now')) RETURNING *`
    )
      .bind('user@example.com', 'Regular User')
      .first<any>();
    regularUser = userRes;

    // Create sessions
    adminSessionId = 'admin-session';
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))`
    )
      .bind(adminSessionId, adminUser.id)
      .run();

    userSessionId = 'user-session';
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))`
    )
      .bind(userSessionId, regularUser.id)
      .run();
  });

  it('allows admin to list users', async () => {
    const ctx = createExecutionContext();
    const request = new Request('http://localhost/api/users', {
      headers: { Cookie: `storage_session=${adminSessionId}` },
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const users = await response.json<any[]>();
    expect(users.length).toBe(2);
  });

  it('forbids regular user from listing users', async () => {
    const ctx = createExecutionContext();
    const request = new Request('http://localhost/api/users', {
      headers: { Cookie: `storage_session=${userSessionId}` },
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(403);
  });

  it('allows admin to create a user', async () => {
    const ctx = createExecutionContext();
    const newUser = {
      email: 'new@example.com',
      name: 'New User',
      is_admin: false,
    };
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      headers: {
        Cookie: `storage_session=${adminSessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newUser),
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    if (response.status !== 201) {
        console.error("Create User API Error:", await response.text());
    }
    expect(response.status).toBe(201);
    const created = await response.json<any>();
    expect(created.email).toBe(newUser.email);
    expect(created.id).toBeDefined();

    // Verify in DB
    const dbUser = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
      .bind(newUser.email)
      .first();
    expect(dbUser).toBeDefined();
  });

  it('allows admin to update a user', async () => {
    const ctx = createExecutionContext();
    const updates = {
      name: 'Updated Name',
      is_admin: true,
    };
    const request = new Request(`http://localhost/api/users/${regularUser.id}`, {
      method: 'PUT',
      headers: {
        Cookie: `storage_session=${adminSessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const updated = await response.json<any>();
    expect(updated.name).toBe(updates.name);
    expect(updated.is_admin).toBe(true);

    // Verify in DB
    const dbUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(regularUser.id)
      .first<any>();
    expect(dbUser.name).toBe(updates.name);
    expect(dbUser.user_type).toBe('ADMIN');
  });

  it('allows admin to delete a user', async () => {
    const ctx = createExecutionContext();
    const request = new Request(`http://localhost/api/users/${regularUser.id}`, {
      method: 'DELETE',
      headers: {
        Cookie: `storage_session=${adminSessionId}`,
      },
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);

    // Verify in DB
    const dbUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(regularUser.id)
      .first();
    expect(dbUser).toBeNull();

    // Verify sessions deleted (cascade)
    const dbSession = await env.DB.prepare('SELECT * FROM sessions WHERE user_id = ?')
      .bind(regularUser.id)
      .first();
    expect(dbSession).toBeNull();
  });

  it('forbids regular user from creating users', async () => {
    const ctx = createExecutionContext();
    const newUser = {
      email: 'hacker@example.com',
      name: 'Hacker',
    };
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      headers: {
        Cookie: `storage_session=${userSessionId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newUser),
    });
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(403);
  });
});
