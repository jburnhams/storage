
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { createExecutionContext, waitOnExecutionContext, env } from 'cloudflare:test';
import { applyD1Migrations } from 'cloudflare:test';
import worker from '../../src/worker';

// Helper to seed test data without importing from integration/setup.ts
async function seedTestDataLocal(db: D1Database) {
  // Create users
  await db.prepare(
    `INSERT INTO users (id, email, name, is_admin, created_at, updated_at) VALUES
     (1, 'admin@example.com', 'Admin User', 1, datetime('now'), datetime('now')),
     (2, 'user@example.com', 'Normal User', 0, datetime('now'), datetime('now'))`
  ).run();

  // Create sessions
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_used_at) VALUES
     ('test-session-admin', 1, ?, ?, ?),
     ('test-session-user', 2, ?, ?, ?)`
  ).bind(now, expires, now, now, expires, now).run();
}

describe('User Profile Blob Tests', () => {
  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    await seedTestDataLocal(env.DB);
  });

  it('should upload a profile picture blob and serve it', async () => {
    // 1. Create FormData with file
    const formData = new FormData();
    formData.append('email', 'newuser@example.com');
    formData.append('name', 'New User');
    formData.append('is_admin', 'false');

    const imageContent = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const blob = new Blob([imageContent], { type: 'image/jpeg' });
    formData.append('profile_pic_blob', blob, 'avatar.jpg');

    // 2. Send POST request
    const req = new Request('http://localhost/api/users', {
      method: 'POST',
      headers: {
        'Cookie': 'storage_session=test-session-admin',
      },
      body: formData,
    });

    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(201);
    const user = await res.json();
    expect(user.email).toBe('newuser@example.com');
    expect(user.profile_picture).toBe(`/api/users/${user.id}/avatar`);

    // 3. Fetch the avatar
    const avatarReq = new Request(`http://localhost/api/users/${user.id}/avatar`, {
      method: 'GET',
      headers: {
        'Cookie': 'storage_session=test-session-admin',
      },
    });
    const avatarRes = await worker.fetch(avatarReq, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(avatarRes.status).toBe(200);
    expect(avatarRes.headers.get('Content-Type')).toBe('image/jpeg');

    // 4. Verify content
    const resBlob = await avatarRes.arrayBuffer();
    const resultBytes = new Uint8Array(resBlob);

    if (resultBytes.length !== imageContent.length) {
        console.log('Received bytes:', Array.from(resultBytes));
        console.log('Expected bytes:', Array.from(imageContent));
        console.log('Received as string:', new TextDecoder().decode(resultBytes));
    }

    expect(resultBytes.length).toBe(imageContent.length);
    for(let i=0; i<resultBytes.length; i++) {
        expect(resultBytes[i]).toBe(imageContent[i]);
    }
  });

  it('should update an existing user with a profile picture blob', async () => {
    const formData = new FormData();
    formData.append('name', 'Updated Name');

    const imageContent = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const blob = new Blob([imageContent], { type: 'image/jpeg' });
    formData.append('profile_pic_blob', blob, 'new_avatar.jpg');

    const req = new Request('http://localhost/api/users/2', {
      method: 'PUT',
      headers: {
        'Cookie': 'storage_session=test-session-admin',
      },
      body: formData,
    });

    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    const user = await res.json();
    expect(user.name).toBe('Updated Name');
    expect(user.profile_picture).toBe(`/api/users/2/avatar`);

    // Fetch avatar
    const avatarReq = new Request(`http://localhost/api/users/2/avatar`, {
      headers: {
        'Cookie': 'storage_session=test-session-admin',
      },
    });
    const avatarRes = await worker.fetch(avatarReq, env, ctx);
    expect(avatarRes.status).toBe(200);

    const resBlob = await avatarRes.arrayBuffer();
    const resultBytes = new Uint8Array(resBlob);

    expect(resultBytes.length).toBe(imageContent.length);
    for(let i=0; i<resultBytes.length; i++) {
        expect(resultBytes[i]).toBe(imageContent[i]);
    }
  });
});
