import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YoutubeService } from '../../src/services/youtube';
import type { Env } from '../../src/types';

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mock D1 Database
const mockDb = {
  prepare: vi.fn(),
  batch: vi.fn(),
} as any;

const mockStmt = {
  bind: vi.fn().mockReturnThis(),
  first: vi.fn(),
  run: vi.fn(),
  all: vi.fn(),
} as any;

mockDb.prepare.mockReturnValue(mockStmt);

const env = {
  DB: mockDb,
  YOUTUBE_API_KEY: 'test-key',
  YOUTUBE_API_BASE_URL: 'https://api.test',
} as unknown as Env;

describe('YoutubeService Optimization', () => {
  let service: YoutubeService;

  beforeEach(() => {
    service = new YoutubeService(env);
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(mockStmt);
    mockStmt.bind.mockReturnThis();
  });

  describe('resolveChannelId', () => {
    it('should return input if it looks like a channel ID', async () => {
      // Exactly 24 characters: UC + 22 chars
      const input = 'UC1234567890123456789012';
      const result = await service.resolveChannelId(input);
      expect(result).toBe(input);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should use channels API with forHandle if input is not an ID', async () => {
      const handle = 'coolhandle';

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ id: 'UCresolvedID' }]
        })
      });

      const result = await service.resolveChannelId(handle);
      expect(result).toBe('UCresolvedID');

      const url = new URL(fetchMock.mock.calls[0][0]);
      expect(url.pathname).toContain('/channels');
      expect(url.searchParams.get('forHandle')).toBe(handle);
      expect(url.searchParams.get('part')).toBe('id');
    });

    it('should throw error if handle not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      });

      await expect(service.resolveChannelId('missing')).rejects.toThrow('Channel not found');
    });
  });

  describe('syncChannelVideos', () => {
    const channelId = 'UCtest';
    const playlistId = 'UUtest';

    beforeEach(() => {
      // Mock getChannel response
      // It calls DB first
      mockStmt.first.mockResolvedValueOnce({
        youtube_id: channelId,
        upload_playlist_id: playlistId,
        last_sync_token: 'token123'
      });
    });

    it('should fetch latest page and backfill page, filtering existing videos', async () => {
      // Mock playlistItems (Latest - Page 1)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { snippet: { resourceId: { videoId: 'vid_new' } } },
            { snippet: { resourceId: { videoId: 'vid_existing' } } }
          ],
          nextPageToken: 'token_new_next'
        })
      });

      // Mock playlistItems (Backfill - using token123)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { snippet: { resourceId: { videoId: 'vid_old' } } }
          ],
          nextPageToken: 'token456'
        })
      });

      // Mock DB check for existence
      // It will query for vid_new, vid_existing, vid_old
      mockStmt.all.mockResolvedValueOnce({
        results: [{ youtube_id: 'vid_existing' }]
      });

      // Mock videos details fetch (only for vid_new and vid_old)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'vid_new',
              snippet: { title: 'New Video', thumbnails: {}, channelId: channelId, publishedAt: '2023-01-01' },
              contentDetails: { duration: 'PT1M' },
              statistics: { viewCount: '100' }
            },
            {
              id: 'vid_old',
              snippet: { title: 'Old Video', thumbnails: {}, channelId: channelId, publishedAt: '2022-01-01' },
              contentDetails: { duration: 'PT2M' },
              statistics: { viewCount: '200' }
            }
          ]
        })
      });

      const result = await service.syncChannelVideos(channelId);

      // Verify playlistItems calls
      const calls = fetchMock.mock.calls;
      expect(calls.length).toBe(3); // 2 playlistItems + 1 videos

      // Call 1: Latest
      const url1 = new URL(calls[0][0]);
      expect(url1.pathname).toContain('/playlistItems');
      expect(url1.searchParams.get('playlistId')).toBe(playlistId);
      expect(url1.searchParams.has('pageToken')).toBe(false);

      // Call 2: Backfill
      const url2 = new URL(calls[1][0]);
      expect(url2.pathname).toContain('/playlistItems');
      expect(url2.searchParams.get('pageToken')).toBe('token123');

      // Call 3: Videos Details (filtered)
      const url3 = new URL(calls[2][0]);
      expect(url3.pathname).toContain('/videos');
      expect(url3.searchParams.get('id')).toContain('vid_new');
      expect(url3.searchParams.get('id')).toContain('vid_old');
      expect(url3.searchParams.get('id')).not.toContain('vid_existing');

      // Check DB Update for token
      // We check if ANY call matches the update structure by normalizing whitespaces
      const updateCalls = mockDb.prepare.mock.calls.map((c: any) => c[0].replace(/\s+/g, ' ').trim());
      const expectedUpdate = 'UPDATE youtube_channels SET last_sync_token = ?, last_sync_at = ? WHERE youtube_id = ?';
      expect(updateCalls).toContain(expectedUpdate);

      expect(mockStmt.bind).toHaveBeenCalledWith('token456', expect.any(String), channelId);

      expect(result.count).toBe(2);
    });
  });
});
