import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YoutubeService } from '../../src/services/youtube';
// @ts-ignore
import { env, applyD1Migrations } from 'cloudflare:test';

// Mock the global fetch
const globalFetch = vi.fn();
global.fetch = globalFetch;

describe('YoutubeService Sync Logic', () => {
  let service: YoutubeService;

  beforeEach(async () => {
    // @ts-ignore - applyD1Migrations is needed for the test environment
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    service = new YoutubeService(env);
    // Clear DB tables
    await env.DB.prepare('DELETE FROM youtube_channels').run();
    await env.DB.prepare('DELETE FROM youtube_videos').run();
    vi.clearAllMocks();
  });

  // Helper to seed a channel
  async function seedChannel(id: string, publishedAt: string, syncStart?: string, syncEnd?: string) {
    await env.DB.prepare(
      `INSERT INTO youtube_channels (youtube_id, title, description, thumbnail_url, published_at, statistics, raw_json, created_at, updated_at, sync_start_date, sync_end_date, last_sync_at)
       VALUES (?, 'Test Channel', 'Desc', 'http://thumb', ?, '{}', '{}', '2023-01-01', '2023-01-01', ?, ?, ?)`
    ).bind(id, publishedAt, syncStart || null, syncEnd || null, syncStart ? '2023-01-01' : null).run();
  }

  // Helper to mock YouTube API responses
  function mockYoutubeApi(searchResults: any[], videoResults: any[], channelVideoCount: string = '1000') {
    globalFetch.mockImplementation(async (url: string) => {
      if (url.includes('/channels')) {
          // Extract ID from URL if possible, otherwise use a default or assume the test caller handles the ID match
          // URL format: .../channels?id=...&...
          const urlObj = new URL(url);
          const requestedId = urlObj.searchParams.get('id') || 'UC_TEST';

          return {
              ok: true,
              json: async () => ({
                  items: [{
                      id: requestedId,
                      snippet: {
                          title: 'Test Channel',
                          description: 'Desc',
                          customUrl: '@test',
                          publishedAt: '2020-01-01T00:00:00Z',
                          thumbnails: { default: { url: 'thumb' } }
                      },
                      statistics: {
                          viewCount: '1000',
                          subscriberCount: '100',
                          hiddenSubscriberCount: false,
                          videoCount: channelVideoCount
                      }
                  }]
              })
          };
      }
      if (url.includes('/search')) {
        return {
          ok: true,
          json: async () => ({
            items: searchResults,
            nextPageToken: null,
            pageInfo: { totalResults: searchResults.length }
          })
        };
      }
      if (url.includes('/videos')) {
        return {
          ok: true,
          json: async () => ({
            items: videoResults,
             pageInfo: { totalResults: videoResults.length }
          })
        };
      }
      return { ok: false, status: 404 };
    });
  }

  it('performs first sync (backward from now)', async () => {
    const channelId = 'UC0123456789012345678901';
    // Channel created 1 year ago
    const publishedAt = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    await seedChannel(channelId, publishedAt);

    // Mock API
    const videoId = 'v1';
    mockYoutubeApi(
      [{ id: { videoId } }],
      [{
        id: videoId,
        snippet: {
          title: 'Video 1',
          description: 'Desc',
          publishedAt: new Date().toISOString(),
          channelId,
          thumbnails: { default: { url: 'thumb' } }
        },
        contentDetails: { duration: 'PT1M' },
        statistics: { viewCount: '100' }
      }]
    );

    const result = await service.syncChannelVideos(channelId);

    expect(result.count).toBe(1);
    expect(result.range_end).toBeDefined();
    expect(result.range_start).toBeDefined();
    // Should be backward
    expect(new Date(result.range_start) < new Date(result.range_end)).toBe(true);

    // Verify DB update
    const channel = await env.DB.prepare('SELECT * FROM youtube_channels WHERE youtube_id = ?').bind(channelId).first<any>();
    expect(channel.sync_start_date).not.toBeNull();
    expect(channel.sync_end_date).not.toBeNull();
    expect(channel.last_sync_at).not.toBeNull();
  });

  it('continues backward sync', async () => {
    const channelId = 'UC0123456789012345678902';
    const publishedAt = new Date('2020-01-01').toISOString();
    // Previously synced last month
    const syncStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const syncEnd = new Date().toISOString();

    await seedChannel(channelId, publishedAt, syncStart, syncEnd);

    // Mock API
    mockYoutubeApi([], []); // No videos found in this older window, just testing range logic

    const result = await service.syncChannelVideos(channelId);

    // Should have moved start date back
    const channel = await env.DB.prepare('SELECT * FROM youtube_channels WHERE youtube_id = ?').bind(channelId).first<any>();
    expect(new Date(channel.sync_start_date).getTime()).toBeLessThan(new Date(syncStart).getTime());
    // End date should stay same (unless it caught up forward, but we are assuming recently synced)
    expect(channel.sync_end_date).toBe(syncEnd);
  });

  it('detects completion when reaching published_at', async () => {
    const channelId = 'UC0123456789012345678903';
    const publishedAt = new Date('2020-01-01').toISOString();
    // Synced up to just after creation
    const syncStart = new Date('2020-01-01').toISOString();
    const syncEnd = new Date().toISOString();

    await seedChannel(channelId, publishedAt, syncStart, syncEnd);

    const result = await service.syncChannelVideos(channelId);

    expect(result.is_complete).toBe(true);
  });

  it('catches up forward if neglected', async () => {
    const channelId = 'UC0123456789012345678904';
    const publishedAt = new Date('2020-01-01').toISOString();
    // Last synced a year ago
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    await seedChannel(channelId, publishedAt, oneYearAgo, oneYearAgo); // Start=End=YearAgo

    mockYoutubeApi([], []);

    const result = await service.syncChannelVideos(channelId);

    // Should sync forward to NOW
    const channel = await env.DB.prepare('SELECT * FROM youtube_channels WHERE youtube_id = ?').bind(channelId).first<any>();
    const now = new Date();
    const newEnd = new Date(channel.sync_end_date);

    // Should be very close to now
    expect(now.getTime() - newEnd.getTime()).toBeLessThan(10000);

    // Start shouldn't move backwards yet because we prioritized forward
    expect(channel.sync_start_date).toBe(oneYearAgo);
  });

  it('stops sync if database has enough videos', async () => {
    const channelId = 'UC0123456789012345678905';
    const publishedAt = new Date('2020-01-01').toISOString();
    await seedChannel(channelId, publishedAt);

    // Mock DB having 5 videos
    for (let i = 0; i < 5; i++) {
        await env.DB.prepare(
            `INSERT INTO youtube_videos (youtube_id, title, description, published_at, channel_id, thumbnail_url, duration, statistics, raw_json, created_at, updated_at)
             VALUES (?, 'V', 'D', ?, ?, 't', 'PT1M', '{}', '{}', ?, ?)`
        ).bind(`v${i}`, new Date().toISOString(), channelId, new Date().toISOString(), new Date().toISOString()).run();
    }

    // Mock API saying channel has 5 videos total
    mockYoutubeApi([], [], '5');

    const result = await service.syncChannelVideos(channelId);

    expect(result.is_complete).toBe(true);
    expect(result.count).toBe(0); // Should not have fetched any new videos
  });
});
