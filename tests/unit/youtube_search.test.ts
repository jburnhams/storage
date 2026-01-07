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

describe('YouTube Search Endpoint', () => {
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

  it('generates SQL with JOIN to fetch channel title', async () => {
    mockAll.mockResolvedValue({ results: [] });

    const res = await app.request('/api/youtube/videos?title_contains=test', {
       method: 'GET',
    }, mockEnv as any);

    expect(res.status).toBe(200);
    expect(mockPrepare).toHaveBeenCalled();
    const sqlArg = mockPrepare.mock.calls[0][0];

    // Check for JOIN
    expect(sqlArg).toContain('LEFT JOIN youtube_channels c ON v.channel_id = c.youtube_id');
    // Check for channel title selection
    expect(sqlArg).toContain('c.title as channel_title');
    // Check for WHERE clause correctness (aliased)
    expect(sqlArg).toContain('v.title LIKE ?');

    expect(mockBind).toHaveBeenCalledWith('%test%', 50, 0);
  });

  it('handles sorting by random', async () => {
    mockAll.mockResolvedValue({ results: [] });

    const res = await app.request('/api/youtube/videos?sort_by=random', {
       method: 'GET',
    }, mockEnv as any);

    expect(res.status).toBe(200);
    const sqlArg = mockPrepare.mock.calls[0][0];
    expect(sqlArg).toContain('ORDER BY RANDOM()');
  });

  it('handles limit and offset', async () => {
    mockAll.mockResolvedValue({ results: [] });

    await app.request('/api/youtube/videos?limit=10&offset=20', {
       method: 'GET',
    }, mockEnv as any);

    expect(mockBind).toHaveBeenCalledWith(10, 20);
  });

  it('correctly aliases ambiguous sort columns', async () => {
    mockAll.mockResolvedValue({ results: [] });

    await app.request('/api/youtube/videos?sort_by=title', {
       method: 'GET',
    }, mockEnv as any);

    const sqlArg = mockPrepare.mock.calls[0][0];
    // Should sort by v.title
    expect(sqlArg).toContain('ORDER BY v.title DESC');
  });

  it('returns 500 on db error', async () => {
    mockAll.mockRejectedValue(new Error('DB Boom'));

    const res = await app.request('/api/youtube/videos', {
       method: 'GET',
    }, mockEnv as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('INTERNAL_ERROR');
  });
});
