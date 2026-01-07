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
    expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO youtube_channels'));
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
