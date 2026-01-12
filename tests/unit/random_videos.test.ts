import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../../src/worker';
import { createExecutionContext } from 'cloudflare:test';
// @ts-ignore
import { applyD1Migrations } from 'cloudflare:test';

describe('YouTube Random Videos API', () => {
  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    // Clean database
    await env.DB.prepare('DELETE FROM youtube_videos').run();
    await env.DB.prepare('DELETE FROM youtube_channels').run();
    await env.DB.prepare('DELETE FROM sessions').run();
    await env.DB.prepare('DELETE FROM users').run();

    // Create a user and session
    await env.DB.prepare('INSERT INTO users (id, email, name, user_type, created_at, updated_at) VALUES (1, "test@example.com", "Test User", "ADMIN", "2023-01-01", "2023-01-01")').run();
    await env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, last_used_at) VALUES ("test-session", 1, "2023-01-01", "2099-01-01", "2023-01-01")').run();

    // Create a channel
    await env.DB.prepare(`
      INSERT INTO youtube_channels (youtube_id, title, description, thumbnail_url, published_at, created_at, updated_at, statistics, raw_json)
      VALUES ('UCchannel1', 'Channel 1', 'Description', 'http://example.com/c1.jpg', '2023-01-01', '2023-01-01', '2023-01-01', '{}', '{}')
    `).run();

    // Create multiple videos with different durations
    const videos = [
      { id: 'v1', duration: 60, title: 'Short Video' },
      { id: 'v2', duration: 300, title: 'Medium Video' },
      { id: 'v3', duration: 600, title: 'Long Video' },
      { id: 'v4', duration: 1200, title: 'Very Long Video' },
    ];

    for (const v of videos) {
      await env.DB.prepare(`
        INSERT INTO youtube_videos (
          youtube_id, channel_id, title, description, thumbnail_url,
          published_at, created_at, updated_at, duration, duration_seconds, view_count, statistics, raw_json
        ) VALUES (
          ?, 'UCchannel1', ?, 'Description', 'http://example.com/v.jpg',
          '2023-01-01', '2023-01-01', '2023-01-01', 'PT${v.duration}S', ?, 100, '{}', '{}'
        )
      `).bind(v.id, v.title, v.duration).run();
    }
  });

  it('should return random videos', async () => {
    const req = new Request('http://localhost/api/youtube/videos/random?count=2', {
      headers: { Cookie: 'storage_session=test-session' },
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.videos).toBeDefined();
    expect(body.videos.length).toBe(2);
    expect(body.videos[0]).toHaveProperty('id');
    expect(body.videos[0]).toHaveProperty('title');
    expect(body.videos[0]).toHaveProperty('channel_title');
  });

  it('should filter by min_duration', async () => {
    const req = new Request('http://localhost/api/youtube/videos/random?min_duration=400', {
      headers: { Cookie: 'storage_session=test-session' },
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.videos.length).toBeGreaterThan(0);
    for (const v of body.videos) {
      expect(v.duration_seconds).toBeGreaterThanOrEqual(400);
    }
  });

  it('should filter by max_duration', async () => {
    const req = new Request('http://localhost/api/youtube/videos/random?max_duration=400', {
      headers: { Cookie: 'storage_session=test-session' },
    });
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.videos.length).toBeGreaterThan(0);
    for (const v of body.videos) {
      expect(v.duration_seconds).toBeLessThanOrEqual(400);
    }
  });

  it('should return 401 if not authenticated', async () => {
    const req = new Request('http://localhost/api/youtube/videos/random');
    const ctx = createExecutionContext();
    const res = await app.fetch(req, env, ctx);

    expect(res.status).toBe(401);
  });
});
