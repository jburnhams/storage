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

  it('GET /api/youtube/channels returns list of channels', async () => {
    const mockChannels = [
      { youtube_id: 'UC123', title: 'Test Channel 1' },
      { youtube_id: 'UC456', title: 'Test Channel 2' }
    ];
    mockAll.mockResolvedValue({ results: mockChannels });

    const res = await app.request('/api/youtube/channels', {
       method: 'GET',
    }, mockEnv as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.channels).toHaveLength(2);
    expect(body.channels[0]).toEqual(mockChannels[0]);
    expect(mockPrepare).toHaveBeenCalledWith('SELECT youtube_id, title FROM youtube_channels ORDER BY title ASC');
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
