import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Miniflare } from 'miniflare';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { rmSync } from 'fs';
import { bundleWorker, createMiniflareInstance, seedTestData } from './setup';

describe('YouTube Sync Integration', () => {
  let mf: Miniflare;
  let persistPath: string;
  let mockServer: any;
  let mockApiUrl: string;

  beforeEach(async () => {
    // 1. Start a local mock YouTube API server
    mockServer = createServer((req, res) => {
        const url = new URL(req.url!, `http://${req.headers.host}`);

        res.setHeader('Content-Type', 'application/json');

        if (url.pathname.includes('/channels')) {
             res.end(JSON.stringify({
                 items: [{
                     id: 'UC_TEST_1234567890abcdef',
                     snippet: {
                         title: 'Test Channel',
                         description: 'Test Desc',
                         publishedAt: new Date(Date.now() - 365*24*60*60*1000).toISOString(),
                         thumbnails: { default: { url: 'http://thumb' } }
                     },
                     statistics: { videoCount: '10' }
                 }]
             }));
             return;
        }

        if (url.pathname.includes('/search')) {
            // Return empty items to simulate end of range for simplicity, or 1 item
            res.end(JSON.stringify({
                items: [{
                    id: { videoId: 'VIDEO_1' }
                }],
                pageInfo: { totalResults: 1 },
                nextPageToken: null
            }));
            return;
        }

        if (url.pathname.includes('/videos')) {
            res.end(JSON.stringify({
                items: [{
                    id: 'VIDEO_1',
                    snippet: {
                        title: 'Video 1',
                        description: 'Desc',
                        publishedAt: new Date().toISOString(),
                        channelId: 'UC_TEST_1234567890abcdef',
                        thumbnails: { default: { url: 'http://thumb' } }
                    },
                    contentDetails: { duration: 'PT1M' },
                    statistics: { viewCount: '100' }
                }]
            }));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found' }));
    });

    await new Promise<void>((resolve) => mockServer.listen(0, resolve));
    const port = (mockServer.address() as AddressInfo).port;
    mockApiUrl = `http://localhost:${port}`;

    // 2. Setup Miniflare
    const script = await bundleWorker();
    const result = await createMiniflareInstance({
      script,
      secrets: {
        YOUTUBE_API_KEY: 'test-key',
        YOUTUBE_API_BASE_URL: mockApiUrl,
      },
      isolate: true // Use isolated instance to prevent poisoning shared instance with custom secrets
    });
    mf = result.mf;
    persistPath = result.persistPath;

    // Seed DB
    const db = await mf.getD1Database('DB');
    const { cleanDatabase } = await import('./setup');
    await cleanDatabase(db);
    await seedTestData(db);
  });

  afterEach(async () => {
    mockServer.close();
    // Singleton handles cleanup
  });

  it('syncs channel videos via API with authentication', async () => {
    // 1. Authenticate with session cookie from seed data
    const cookie = 'storage_session=test-session-admin';
    const validId = 'UC_TEST_1234567890abcdef';

    // 2. Call Sync Endpoint
    const res = await mf.dispatchFetch(`http://localhost:8787/api/youtube/channel/${validId}/sync`, {
        method: 'POST',
        headers: {
            'Cookie': cookie
        }
    });

    // 3. Verify Response
    expect(res.status).toBe(200);
    const body: any = await res.json();

    expect(body.count).toBe(1);
    expect(body.range_start).toBeDefined();
    expect(body.range_end).toBeDefined();
    expect(body.sample_video).toBeDefined();
    expect(body.sample_video.youtube_id).toBe('VIDEO_1');

    // 4. Verify DB State (Read-through)
    // We can query the DB directly via Miniflare to check if video was inserted
    const db = await mf.getD1Database('DB');
    const video = await db.prepare('SELECT * FROM youtube_videos WHERE youtube_id = ?').bind('VIDEO_1').first<any>();
    expect(video).toBeDefined();
    expect(video.title).toBe('Video 1');

    const channel = await db.prepare('SELECT * FROM youtube_channels WHERE youtube_id = ?').bind('UC_TEST_1234567890abcdef').first<any>();
    expect(channel).toBeDefined();
    expect(channel.sync_start_date).not.toBeNull();
  });
});
