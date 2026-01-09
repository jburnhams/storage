import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import {
  createMiniflareInstance,
  seedTestData,
  cleanDatabase,
  bundleWorker,
} from './setup';

describe('YouTube Random Videos Integration', () => {
  let mf: Miniflare;
  let db: D1Database;
  let workerScript: string;
  let persistPath: string;

  beforeAll(async () => {
    workerScript = await bundleWorker();

    const result = await createMiniflareInstance({
      script: workerScript,
      isolate: true,
    });
    mf = result.mf;
    persistPath = result.persistPath;
  });

  beforeEach(async () => {
    db = await mf.getD1Database('DB');
    await cleanDatabase(db);
    await seedTestData(db);

    // Seed specific YouTube data
    await db.prepare(`
      INSERT INTO youtube_channels (youtube_id, title, description, thumbnail_url, published_at, raw_json, statistics, created_at, updated_at)
      VALUES
        ('C1', 'Channel 1', 'Desc 1', 'http://thumb1', '2023-01-01', '{}', '{}', datetime('now'), datetime('now')),
        ('C2', 'Channel 2', 'Desc 2', 'http://thumb2', '2023-01-01', '{}', '{}', datetime('now'), datetime('now'));
    `).run();

    await db.prepare(`
      INSERT INTO youtube_videos (youtube_id, title, description, thumbnail_url, duration, duration_seconds, channel_id, published_at, raw_json, statistics, created_at, updated_at)
      VALUES
        ('V1', 'Video 1', 'Desc', 'http://thumb', 'PT1M', 60, 'C1', '2023-01-01', '{}', '{}', datetime('now'), datetime('now')),
        ('V2', 'Video 2', 'Desc', 'http://thumb', 'PT1M', 60, 'C1', '2023-01-01', '{}', '{}', datetime('now'), datetime('now')),
        ('V3', 'Video 3', 'Desc', 'http://thumb', 'PT1M', 60, 'C2', '2023-01-01', '{}', '{}', datetime('now'), datetime('now'));
    `).run();
  });

  afterAll(async () => {
    if (mf) await mf.dispose();
    try {
      const { rmSync } = await import('fs');
      if (persistPath) rmSync(persistPath, { recursive: true, force: true });
    } catch (e) {
      console.error('Failed to clean up D1 persistence:', e);
    }
  });

  it('should return random videos without filter', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/videos/random?count=10', {
      headers: { 'Cookie': 'storage_session=test-session-admin' }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.videos.length).toBeGreaterThan(0);
    expect(body.videos.length).toBeLessThanOrEqual(3); // We have 3 videos total
  });

  it('should filter random videos by channel_id', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/videos/random?channel_id=C1', {
      headers: { 'Cookie': 'storage_session=test-session-admin' }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.videos.length).toBe(2);

    for (const video of body.videos) {
        expect(video.channel_id).toBe('C1');
    }
  });

  it('should filter random videos by another channel_id', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/videos/random?channel_id=C2', {
      headers: { 'Cookie': 'storage_session=test-session-admin' }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.videos.length).toBe(1);
    expect(body.videos[0].channel_id).toBe('C2');
  });

  it('should return empty list if channel has no videos', async () => {
      await db.prepare(`
        INSERT INTO youtube_channels (youtube_id, title, description, thumbnail_url, published_at, raw_json, statistics, created_at, updated_at)
        VALUES ('C3', 'Channel 3', 'Desc 3', 'http://thumb3', '2023-01-01', '{}', '{}', datetime('now'), datetime('now'));
      `).run();

      const res = await mf.dispatchFetch('http://localhost/api/youtube/videos/random?channel_id=C3', {
        headers: { 'Cookie': 'storage_session=test-session-admin' }
      });

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.videos.length).toBe(0);
  });
});
