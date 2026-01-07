import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMiniflareInstance, createTestSession, seedTestData, applyWranglerMigrations, bundleWorker } from './setup';
import { Miniflare } from 'miniflare';
import { Response } from 'undici';

describe('YouTube Search Integration', () => {
  let mf: Miniflare;
  let sessionCookie: string;
  let persistencePath: string;

  beforeAll(async () => {
    // 0. Bundle the worker code
    const script = await bundleWorker();

    // 1. Create instance (db starts empty)
    const instance = await createMiniflareInstance({ script });
    mf = instance.mf;
    persistencePath = instance.persistencePath;

    // 2. Apply migrations (createMiniflareInstance does this, but good to be explicit or rely on it)
    // Actually createMiniflareInstance already called applyWranglerMigrations(persistPath) inside it.

    // 3. Seed data
    const db = await mf.getD1Database('DB');
    await seedTestData(db);

    // 4. Seed extra YouTube data for searching
    await db.prepare(`
      INSERT INTO youtube_channels (youtube_id, title, description, thumbnail_url, published_at, statistics, raw_json, created_at, updated_at)
      VALUES ('UC_TEST', 'Test Channel', 'Desc', 'http://thumb', '2023-01-01', '{}', '{}', '2023-01-01', '2023-01-01')
    `).run();

    await db.prepare(`
      INSERT INTO youtube_videos (youtube_id, title, description, published_at, channel_id, thumbnail_url, duration, statistics, raw_json, created_at, updated_at)
      VALUES
      ('VID_1', 'React Tutorial', 'Learn React', '2023-01-01', 'UC_TEST', 'http://thumb', 'PT10M', '{"viewCount": "100", "likeCount": "10"}', '{}', '2023-01-01', '2023-01-01'),
      ('VID_2', 'Vue Tutorial', 'Learn Vue', '2023-02-01', 'UC_TEST', 'http://thumb', 'PT20M', '{"viewCount": "200", "likeCount": "20"}', '{}', '2023-02-01', '2023-02-01'),
      ('VID_3', 'Angular Tutorial', 'Learn Angular', '2023-03-01', 'UC_TEST', 'http://thumb', 'PT30M', '{"viewCount": "300", "likeCount": "30"}', '{}', '2023-03-01', '2023-03-01')
    `).run();

    // 5. Get auth cookie (using one of the users seeded by seedTestData)
    // seedTestData creates 'test-user' with session 'test-session-user'
    // createTestSession helper might create a NEW session or return a cookie for an existing user.
    // Let's use the helper to get a valid cookie header.
    // However, createTestSession in setup.ts doesn't exist in the file content I read earlier?
    // Wait, I saw `createTestSession` in the imports of my previous test file, but when I read `tests/integration/setup.ts` in the memory/previous turn, I didn't see `createTestSession` exported.
    // I saw `seedTestData`.
    // Let me check `tests/integration/setup.ts` again or just manually construct the cookie since I know the session ID.

    sessionCookie = 'storage_session=test-session-user';
  });

  afterAll(async () => {
    await mf.dispose();
    const fs = await import('fs');
    if (persistencePath) {
        fs.rmSync(persistencePath, { recursive: true, force: true });
    }
  });

  it('requires authentication', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/videos');
    expect(res.status).toBe(401);
  });

  it('returns all videos by default', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/videos', {
      headers: { Cookie: sessionCookie },
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.videos.length).toBe(3);
  });

  it('filters by title contains', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/videos?title_contains=Vue', {
      headers: { Cookie: sessionCookie },
    });
    const body: any = await res.json();
    expect(body.videos.length).toBe(1);
    expect(body.videos[0].title).toBe('Vue Tutorial');
  });

  it('filters by published_at greater than', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/videos?published_at_gt=2023-02-15', {
      headers: { Cookie: sessionCookie },
    });
    const body: any = await res.json();
    expect(body.videos.length).toBe(1); // Only Angular (March)
    expect(body.videos[0].title).toBe('Angular Tutorial');
  });

  it('sorts by published_at desc', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/videos?sort_by=published_at&sort_order=desc', {
      headers: { Cookie: sessionCookie },
    });
    const body: any = await res.json();
    expect(body.videos[0].title).toBe('Angular Tutorial');
    expect(body.videos[2].title).toBe('React Tutorial');
  });

  it('filters by JSON field (viewCount > 150)', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/videos?statistics.viewCount_gt=150', {
      headers: { Cookie: sessionCookie },
    });
    const body: any = await res.json();
    expect(body.videos.length).toBe(2);
    // Sort logic might not be guaranteed in response without explicit sort, but let's check contents
    const titles = body.videos.map((v: any) => v.title).sort();
    expect(titles).toEqual(['Angular Tutorial', 'Vue Tutorial']);
  });

  it('sorts by JSON field', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/videos?sort_by=statistics.viewCount&sort_order=desc', {
      headers: { Cookie: sessionCookie },
    });
    const body: any = await res.json();
    expect(body.videos[0].title).toBe('Angular Tutorial'); // 300
    expect(body.videos[2].title).toBe('React Tutorial'); // 100
  });

  it('limits results', async () => {
     const res = await mf.dispatchFetch('http://localhost/api/youtube/videos?limit=1', {
      headers: { Cookie: sessionCookie },
    });
    const body: any = await res.json();
    expect(body.videos.length).toBe(1);
  });
});
