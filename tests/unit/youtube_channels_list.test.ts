import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerYoutubeRoutes } from '../../src/routes/youtube';
import { OpenAPIHono } from '@hono/zod-openapi';

// Mock DB
const mockBind = vi.fn().mockReturnThis();
const mockAll = vi.fn();
const mockPrepare = vi.fn(() => ({
  bind: mockBind,
  all: mockAll,
}));

const mockEnv = {
  DB: {
    prepare: mockPrepare,
  },
};

describe('YouTube Channels List Endpoint', () => {
  let app: OpenAPIHono<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new OpenAPIHono();

    // Middleware mock
    app.use('*', async (c, next) => {
      c.set('session', { user: { id: 'test-user' } }); // Simulate auth
      await next();
    });

    registerYoutubeRoutes(app as any);
  });

  it('GET /api/youtube/channels returns list of channels with all fields', async () => {
    const mockChannels = [
      {
          youtube_id: 'UC123',
          title: 'Test Channel 1',
          description: 'Desc 1',
          custom_url: null,
          thumbnail_url: 'http://thumb1',
          published_at: '2023-01-01',
          statistics: '{}',
          created_at: '2023-01-01',
          updated_at: '2023-01-01',
          upload_playlist_id: null,
          last_sync_token: null,
          view_count: 100,
          subscriber_count: 10,
          video_count: 5,
          country: 'US',
          best_thumbnail_url: null,
          best_thumbnail_width: null,
          best_thumbnail_height: null
      },
      {
          youtube_id: 'UC456',
          title: 'Test Channel 2',
          description: 'Desc 2',
          custom_url: null,
          thumbnail_url: 'http://thumb2',
          published_at: '2023-01-02',
          statistics: '{}',
          created_at: '2023-01-02',
          updated_at: '2023-01-02',
          upload_playlist_id: null,
          last_sync_token: null,
          view_count: 200,
          subscriber_count: 20,
          video_count: 10,
          country: 'UK',
          best_thumbnail_url: null,
          best_thumbnail_width: null,
          best_thumbnail_height: null
      }
    ];
    mockAll.mockResolvedValue({ results: mockChannels });

    const res = await app.request('/api/youtube/channels', {
       method: 'GET',
    }, mockEnv as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.channels).toHaveLength(2);
    expect(body.channels[0]).toEqual(mockChannels[0]);

    // Check if the query selects all fields except raw_json
    const expectedQuery = `
                SELECT
                    youtube_id, title, description, custom_url, thumbnail_url,
                    published_at, statistics, created_at, updated_at,
                    upload_playlist_id, last_sync_token,
                    view_count, subscriber_count, video_count, country,
                    best_thumbnail_url, best_thumbnail_width, best_thumbnail_height
                FROM youtube_channels
                ORDER BY title ASC
            `.trim().replace(/\s+/g, ' ');

    const actualQuery = mockPrepare.mock.calls[0][0].trim().replace(/\s+/g, ' ');
    expect(actualQuery).toBe(expectedQuery);
  });

  it('GET /api/youtube/channels returns 500 on db error', async () => {
    mockAll.mockRejectedValue(new Error('DB Fail'));

    const res = await app.request('/api/youtube/channels', {
       method: 'GET',
    }, mockEnv as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('INTERNAL_ERROR');
  });
});
