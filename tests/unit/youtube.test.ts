import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YoutubeService } from '../../src/services/youtube';
import type { Env } from '../../src/types';

describe('YoutubeService', () => {
  let env: Env;
  let service: YoutubeService;

  beforeEach(() => {
    env = {
      DB: {
        prepare: vi.fn().mockReturnThis(),
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(),
        run: vi.fn(),
      } as any,
      YOUTUBE_API_KEY: 'test-key',
      YOUTUBE_API_BASE_URL: 'https://mock.api',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      SESSION_SECRET: '',
    };
    service = new YoutubeService(env);

    // Reset global fetch mock
    global.fetch = vi.fn();
  });

  it('should return cached channel if present in DB', async () => {
    const mockChannel = { youtube_id: 'UC1234567890abcdefghijkl', title: 'Test Channel' };
    (env.DB.prepare('query').bind('id').first as any).mockResolvedValue(mockChannel);

    const result = await service.getChannel('UC1234567890abcdefghijkl');

    expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM youtube_channels'));
    expect(result).toEqual(mockChannel);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should fetch channel from API if not in DB', async () => {
    (env.DB.prepare('query').bind('id').first as any).mockResolvedValue(null);

    const validId = 'UC1234567890abcdefghijkl';

    const apiResponse = {
      items: [{
        id: validId,
        snippet: {
          title: 'New Channel',
          description: 'Desc',
          thumbnails: { high: { url: 'http://img.com' } },
          publishedAt: '2023-01-01',
        },
        statistics: { viewCount: '100' },
      }]
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => apiResponse,
    });

    const result = await service.getChannel(validId);

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('https://mock.api/channels'), expect.anything());

    // Verify INSERT binds include stats
    const insertCall = (env.DB.prepare as any).mock.calls.find((call: any[]) => call[0].includes('INSERT INTO youtube_channels'));
    expect(insertCall).toBeTruthy();
    // Check that bind was called on the result of prepare
    // In this mock setup: env.DB.prepare returns object with bind.
    // We can check the mockBind (which is returned by prepare)
    // But since prepare mocks return 'this', we check the bind calls on the shared mock object if it was shared,
    // OR we need to access the spy on the result.
    // The current setup: prepare = vi.fn().mockReturnThis()
    // So env.DB.prepare IS the object having bind.
    // Wait, env.DB.prepare is a function, it returns 'this' (env.DB).
    // So env.DB.bind is what we check.

    // The setup is:
    // prepare: vi.fn().mockReturnThis(),
    // bind: vi.fn().mockReturnThis(),

    // So we check env.DB.bind calls.
    // We need to find the call corresponding to the INSERT.
    // Since getChannel calls prepare(SELECT)...bind...first AND prepare(SELECT custom)...bind...first THEN prepare(INSERT)...bind...run
    // It's hard to isolate based on order without strict indexing.
    // But we know the values we expect.

    expect(env.DB.bind).toHaveBeenCalledWith(
        validId,
        'New Channel',
        'Desc',
        null, // custom_url
        'http://img.com',
        '2023-01-01',
        '{"viewCount":"100"}', // statistics string
        expect.any(String), // raw_json
        expect.any(String), // created_at
        expect.any(String), // updated_at
        null, // upload_playlist_id
        100, // view_count
        0, // subscriber_count
        0, // video_count
        null, // country (missing in mock response)
        'http://img.com',
        null, // width
        null // height
    );

    expect(result.title).toBe('New Channel');
    expect(result.youtube_id).toBe(validId);
  });

  it('should return cached video if present in DB', async () => {
    const mockVideo = { youtube_id: 'V123', title: 'Test Video' };
    (env.DB.prepare('query').bind('id').first as any).mockResolvedValue(mockVideo);

    const result = await service.getVideo('V123');

    expect(result).toEqual(mockVideo);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should fetch video from API if not in DB', async () => {
    (env.DB.prepare('query').bind('id').first as any).mockResolvedValue(null);

    const apiResponse = {
      items: [{
        id: 'V123',
        snippet: {
          title: 'New Video',
          description: 'Desc',
          channelId: 'UC123',
          thumbnails: { default: { url: 'http://img.com' } },
          publishedAt: '2023-01-01',
        },
        contentDetails: { duration: 'PT1M' },
        statistics: { viewCount: '50' },
      }]
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => apiResponse,
    });

    const result = await service.getVideo('V123');

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('https://mock.api/videos'), expect.anything());
    expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO youtube_videos'));

    // Verify INSERT binds include stats
    expect(env.DB.bind).toHaveBeenCalledWith(
        'V123',
        'New Video',
        'Desc',
        '2023-01-01',
        'UC123',
        'http://img.com',
        'PT1M',
        '{"viewCount":"50"}',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        60, // duration_seconds (PT1M = 60s)
        50, // view_count
        0, // like_count
        0, // comment_count
        'http://img.com',
        null,
        null,
        null, // definition
        null, // dimension
        0, // licensed
        0, // caption
        null, // privacy
        0, // embeddable
        0  // made_for_kids
    );

    expect(result.title).toBe('New Video');
    expect(result.duration).toBe('PT1M');
  });

  it('should throw error if API returns empty items', async () => {
    (env.DB.prepare('query').bind('id').first as any).mockResolvedValue(null);

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });

    await expect(service.getChannel('INVALID')).rejects.toThrow('Channel not found');
  });
});
