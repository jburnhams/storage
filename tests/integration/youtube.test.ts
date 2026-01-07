import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import { createServer, Server } from 'http';
import {
  createMiniflareInstance,
  seedTestData,
  cleanDatabase,
  bundleWorker,
} from './setup';

describe('YouTube Integration', () => {
  let mf: Miniflare;
  let db: D1Database;
  let workerScript: string;
  let persistPath: string;
  let mockServer: Server;
  let mockServerUrl: string;
  let apiCallCount = 0;

  beforeAll(async () => {
    // Start mock YouTube server
    await new Promise<void>((resolve) => {
      mockServer = createServer((req, res) => {
        apiCallCount++;
        const url = new URL(req.url!, `http://${req.headers.host}`);

        if (url.pathname === '/channels') {
          const id = url.searchParams.get('id');
          if (id === 'UC1234567890abcdefghijkl') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              items: [{
                id: 'UC1234567890abcdefghijkl',
                snippet: {
                  title: 'Mock Channel',
                  description: 'Mock Desc',
                  thumbnails: { high: { url: 'http://mock.img/high.jpg' } },
                  publishedAt: '2023-01-01T00:00:00Z',
                },
                statistics: { viewCount: '1000' }
              }]
            }));
            return;
          }
        }

        if (url.pathname === '/videos') {
          const id = url.searchParams.get('id');
          if (id === 'V123') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              items: [{
                id: 'V123',
                snippet: {
                  title: 'Mock Video',
                  description: 'Mock Video Desc',
                  channelId: 'UC123',
                  thumbnails: { default: { url: 'http://mock.img/def.jpg' } },
                  publishedAt: '2023-01-02T00:00:00Z',
                },
                contentDetails: { duration: 'PT5M' },
                statistics: { viewCount: '500' }
              }]
            }));
            return;
          }
        }

        res.writeHead(404);
        res.end(JSON.stringify({ items: [] }));
      });
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        mockServerUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    workerScript = await bundleWorker();

    const result = await createMiniflareInstance({
      secrets: {
        YOUTUBE_API_KEY: 'test-key',
        YOUTUBE_API_BASE_URL: mockServerUrl,
      },
      script: workerScript,
    });
    mf = result.mf;
    persistPath = result.persistPath;
  });

  beforeEach(async () => {
    db = await mf.getD1Database('DB');
    await cleanDatabase(db);
    await seedTestData(db);
    apiCallCount = 0;
  });

  afterAll(async () => {
    if (mockServer) mockServer.close();
    if (mf) await mf.dispose();
    try {
      const { rmSync } = await import('fs');
      if (persistPath) rmSync(persistPath, { recursive: true, force: true });
    } catch (e) {
      console.error('Failed to clean up D1 persistence:', e);
    }
  });

  it('should fetch channel from API on first request and cache it', async () => {
    const validId = 'UC1234567890abcdefghijkl';
    const res1 = await mf.dispatchFetch(`http://localhost/api/youtube/channel/${validId}`, {
      headers: { 'Cookie': 'storage_session=test-session-admin' }
    });

    expect(res1.status).toBe(200);
    const body1 = await res1.json() as any;
    expect(body1.title).toBe('Mock Channel');
    expect(body1.youtube_id).toBe(validId);
    expect(apiCallCount).toBe(1);

    // Second request should hit cache
    const res2 = await mf.dispatchFetch(`http://localhost/api/youtube/channel/${validId}`, {
        headers: { 'Cookie': 'storage_session=test-session-admin' }
    });
    expect(res2.status).toBe(200);
    expect(apiCallCount).toBe(1); // Should not increase
  });

  it('should fetch video from API on first request and cache it', async () => {
    const res1 = await mf.dispatchFetch('http://localhost/api/youtube/video/V123', {
      headers: { 'Cookie': 'storage_session=test-session-admin' }
    });

    expect(res1.status).toBe(200);
    const body1 = await res1.json() as any;
    expect(body1.title).toBe('Mock Video');
    expect(body1.duration).toBe('PT5M');
    expect(apiCallCount).toBe(1);

    // Second request should hit cache
    const res2 = await mf.dispatchFetch('http://localhost/api/youtube/video/V123', {
        headers: { 'Cookie': 'storage_session=test-session-admin' }
    });
    expect(res2.status).toBe(200);
    expect(apiCallCount).toBe(1); // Should not increase
  });

  it('should return 404 if not found in API', async () => {
    const res = await mf.dispatchFetch('http://localhost/api/youtube/channel/INVALID', {
      headers: { 'Cookie': 'storage_session=test-session-admin' }
    });

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe('NOT_FOUND');
    expect(apiCallCount).toBe(1);
  });
});
