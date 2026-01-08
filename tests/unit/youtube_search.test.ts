import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerYoutubeRoutes } from '../../src/routes/youtube';
import { OpenAPIHono } from '@hono/zod-openapi';

// Mock DB
const mockBind = vi.fn().mockReturnThis();
const mockAll = vi.fn();
const mockFirst = vi.fn();
const mockPrepare = vi.fn(() => ({
  bind: mockBind,
  all: mockAll,
  first: mockFirst,
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

  it('calls DB with correct SQL for simple search', async () => {
    mockAll.mockResolvedValue({ results: [] });
    mockFirst.mockResolvedValue({ total: 0 });

    const res = await app.request('/api/youtube/videos?title_contains=test', {
       method: 'GET',
    }, mockEnv as any);

    expect(res.status).toBe(200);
    expect(mockPrepare).toHaveBeenCalled();
    // We can't easily check calls[0] because Promise.all might run them in parallel/any order
    // But we expect both queries to be prepared.
    const calls = mockPrepare.mock.calls.map(c => c[0]);
    const mainQuery = calls.find(sql => sql.includes('LIMIT ? OFFSET ?'));
    const countQuery = calls.find(sql => sql.includes('COUNT(*)'));

    expect(mainQuery).toBeDefined();
    expect(countQuery).toBeDefined();

    // Updated expectations for JOIN query
    expect(mainQuery).toContain('SELECT');
    expect(mainQuery).toContain('FROM youtube_videos v');
    expect(mainQuery).toContain('LEFT JOIN youtube_channels c ON v.channel_id = c.youtube_id');
    expect(mainQuery).toContain('WHERE v.title LIKE ?');

    // Check bind args roughly
    // The bind mock is shared, so it collects all calls.
    const bindCalls = mockBind.mock.calls;
    const hasCorrectBind = bindCalls.some(args => args[0] === '%test%' && args[1] === 50 && args[2] === 0);
    expect(hasCorrectBind).toBe(true);
  });

  it('handles sorting by random', async () => {
    mockAll.mockResolvedValue({ results: [] });
    mockFirst.mockResolvedValue({ total: 0 });

    const res = await app.request('/api/youtube/videos?sort_by=random', {
       method: 'GET',
    }, mockEnv as any);

    expect(res.status).toBe(200);
    const calls = mockPrepare.mock.calls.map(c => c[0]);
    const mainQuery = calls.find(sql => sql.includes('LIMIT ? OFFSET ?'));
    expect(mainQuery).toContain('ORDER BY RANDOM()');
  });

  it('handles limit and offset', async () => {
    mockAll.mockResolvedValue({ results: [] });
    mockFirst.mockResolvedValue({ total: 0 });

    await app.request('/api/youtube/videos?limit=10&offset=20', {
       method: 'GET',
    }, mockEnv as any);

    const bindCalls = mockBind.mock.calls;
    const hasCorrectBind = bindCalls.some(args => args[args.length - 2] === 10 && args[args.length - 1] === 20);
    expect(hasCorrectBind).toBe(true);
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

  it('filters by channel_id', async () => {
    mockAll.mockResolvedValue({ results: [] });
    mockFirst.mockResolvedValue({ total: 0 });

    const res = await app.request('/api/youtube/videos?channel_id=UC123', {
       method: 'GET',
    }, mockEnv as any);

    expect(res.status).toBe(200);
    const calls = mockPrepare.mock.calls.map(c => c[0]);
    const mainQuery = calls.find(sql => sql.includes('LIMIT ? OFFSET ?'));
    expect(mainQuery).toContain('WHERE v.channel_id = ?');
  });

  it('returns video statistics fields', async () => {
    const mockVideo = {
        youtube_id: 'vid1',
        title: 'Video 1',
        description: 'Desc',
        published_at: '2023-01-01',
        channel_id: 'UC123',
        thumbnail_url: 'thumb',
        duration: 'PT1M',
        raw_json: '{}',
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        view_count: 1000,
        like_count: 50,
        comment_count: 10,
        channel_title: 'Channel 1'
    };
    mockAll.mockResolvedValue({ results: [mockVideo] });

    const res = await app.request('/api/youtube/videos', {
       method: 'GET',
    }, mockEnv as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.videos[0]).toEqual(mockVideo);

    // Verify SQL selects the new columns
    const sqlArg = mockPrepare.mock.calls[0][0];
    expect(sqlArg).toContain('v.view_count');
    expect(sqlArg).toContain('v.like_count');
    expect(sqlArg).toContain('v.comment_count');
  });
});
