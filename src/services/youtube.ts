import type {
  Env,
  YoutubeChannel,
  YoutubeVideo,
  YoutubeListResponse,
  YoutubeChannelResource,
  YoutubeVideoResource,
  YoutubeSearchResource
} from '../types';

const DEFAULT_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

export class YoutubeService {
  private env: Env;
  private baseUrl: string;

  constructor(env: Env) {
    this.env = env;
    this.baseUrl = env.YOUTUBE_API_BASE_URL || DEFAULT_API_BASE_URL;
  }

  private async fetchFromApi<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    url.searchParams.set('key', this.env.YOUTUBE_API_KEY);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Referer': 'storage.jonathanburnhams.com'
      }
    });

    if (!response.ok) {
        if (response.status === 404) {
            // Mock server might return 404 for empty results
            throw new Error(`YouTube API error: ${response.status} Not Found`);
        }
        const text = await response.text();
        throw new Error(`YouTube API error: ${response.status} ${response.statusText} - ${text}`);
    }

    return await response.json() as T;
  }

  async resolveChannelId(input: string): Promise<string> {
    // 1. If it looks like a Channel ID (UC...) and length is 24, assume it is an ID.
    if (input.startsWith('UC') && input.length === 24) {
      return input;
    }

    // 2. Search
    const searchRes = await this.fetchFromApi<YoutubeListResponse<YoutubeSearchResource>>('search', {
      q: input,
      type: 'channel',
      part: 'id',
      maxResults: '1'
    });

    if (!searchRes.items || searchRes.items.length === 0) {
      throw new Error(`Channel not found for: ${input}`);
    }

    const channelId = searchRes.items[0].id.channelId;
    if (!channelId) {
        throw new Error(`Channel ID not found in search results for: ${input}`);
    }
    return channelId;
  }

  async getChannel(idOrHandle: string, forceRefresh: boolean = false): Promise<YoutubeChannel> {
    let id = idOrHandle;

    if (!forceRefresh) {
        // 1. Check DB by ID
        let cached = await this.env.DB.prepare(
          'SELECT * FROM youtube_channels WHERE youtube_id = ?'
        ).bind(id).first<YoutubeChannel>();

        if (cached) {
          return cached;
        }

        // 2. Check DB by custom_url (handle)
        // Note: custom_url stores the handle (e.g. @Handle)
        cached = await this.env.DB.prepare(
          'SELECT * FROM youtube_channels WHERE custom_url = ? OR custom_url = ?'
        ).bind(idOrHandle, idOrHandle.toLowerCase()).first<YoutubeChannel>();

        if (cached) {
          return cached;
        }
    }

    // 3. Resolve ID if needed
    if (!id.startsWith('UC') || id.length !== 24) {
      try {
        id = await this.resolveChannelId(idOrHandle);

        // Check DB again with resolved ID
        if (!forceRefresh) {
            let cached = await this.env.DB.prepare(
              'SELECT * FROM youtube_channels WHERE youtube_id = ?'
            ).bind(id).first<YoutubeChannel>();

            if (cached) {
              return cached;
            }
        }
      } catch (e) {
        // If resolution fails, maybe it IS a weird ID?
        // But for now, propagate error or fall through to try as ID (which will fail)
        // Let's propagate.
        throw e;
      }
    }

    // 4. Fetch from API using ID
    const data = await this.fetchFromApi<YoutubeListResponse<YoutubeChannelResource>>('channels', {
      id: id,
      part: 'snippet,statistics'
    });

    if (!data.items || data.items.length === 0) {
      throw new Error(`Channel not found: ${id}`);
    }

    const item = data.items[0];
    const now = new Date().toISOString();

    const channel: YoutubeChannel = {
      youtube_id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      custom_url: item.snippet.customUrl || null,
      thumbnail_url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
      published_at: item.snippet.publishedAt,
      statistics: JSON.stringify(item.statistics),
      total_video_count: parseInt(item.statistics.videoCount, 10),
      raw_json: JSON.stringify(item),
      created_at: now,
      updated_at: now
    };

    // 5. Store in DB (Upsert)
    // We use ON CONFLICT DO UPDATE to preserve fields we aren't updating if we wanted,
    // but here we are fetching fresh data, so we generally want to update everything except maybe created_at.
    await this.env.DB.prepare(
      `INSERT INTO youtube_channels
       (youtube_id, title, description, custom_url, thumbnail_url, published_at, statistics, total_video_count, raw_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(youtube_id) DO UPDATE SET
         title=excluded.title,
         description=excluded.description,
         custom_url=excluded.custom_url,
         thumbnail_url=excluded.thumbnail_url,
         published_at=excluded.published_at,
         statistics=excluded.statistics,
         total_video_count=excluded.total_video_count,
         raw_json=excluded.raw_json,
         updated_at=excluded.updated_at`
    ).bind(
      channel.youtube_id,
      channel.title,
      channel.description,
      channel.custom_url,
      channel.thumbnail_url,
      channel.published_at,
      channel.statistics,
      channel.total_video_count,
      channel.raw_json,
      channel.created_at,
      channel.updated_at
    ).run();

    return channel;
  }

  async getVideo(id: string): Promise<YoutubeVideo> {
    // 1. Check DB
    const cached = await this.env.DB.prepare(
      'SELECT * FROM youtube_videos WHERE youtube_id = ?'
    ).bind(id).first<YoutubeVideo>();

    if (cached) {
      return cached;
    }

    // 2. Fetch from API
    const data = await this.fetchFromApi<YoutubeListResponse<YoutubeVideoResource>>('videos', {
      id: id,
      part: 'snippet,contentDetails,statistics'
    });

    if (!data.items || data.items.length === 0) {
      throw new Error(`Video not found: ${id}`);
    }

    const item = data.items[0];
    const now = new Date().toISOString();

    const video: YoutubeVideo = {
      youtube_id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      published_at: item.snippet.publishedAt,
      channel_id: item.snippet.channelId,
      thumbnail_url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
      duration: item.contentDetails.duration,
      statistics: JSON.stringify(item.statistics),
      raw_json: JSON.stringify(item),
      created_at: now,
      updated_at: now
    };

    // 3. Store in DB (Upsert)
    await this.env.DB.prepare(
      `INSERT INTO youtube_videos
       (youtube_id, title, description, published_at, channel_id, thumbnail_url, duration, statistics, raw_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(youtube_id) DO UPDATE SET
         title=excluded.title,
         description=excluded.description,
         published_at=excluded.published_at,
         channel_id=excluded.channel_id,
         thumbnail_url=excluded.thumbnail_url,
         duration=excluded.duration,
         statistics=excluded.statistics,
         raw_json=excluded.raw_json,
         updated_at=excluded.updated_at`
    ).bind(
      video.youtube_id,
      video.title,
      video.description,
      video.published_at,
      video.channel_id,
      video.thumbnail_url,
      video.duration,
      video.statistics,
      video.raw_json,
      video.created_at,
      video.updated_at
    ).run();

    return video;
  }

  async syncChannelVideos(channelId: string): Promise<{
    count: number;
    range_start: string;
    range_end: string;
    sample_video: YoutubeVideo | null;
    is_complete: boolean;
  }> {
    // 1. Force update channel details (including total_video_count)
    await this.getChannel(channelId, true);

    // 2. Fetch full channel record from DB to ensure we have persisted sync state
    // (getChannel returns fresh API data which lacks sync_start_date/etc)
    const channel = await this.env.DB.prepare('SELECT * FROM youtube_channels WHERE youtube_id = ?').bind(channelId).first<YoutubeChannel>();

    if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Check if we already have enough videos
    if (channel.total_video_count !== undefined && channel.total_video_count !== null) {
        const countResult = await this.env.DB.prepare('SELECT COUNT(*) as count FROM youtube_videos WHERE channel_id = ?').bind(channelId).first<{ count: number }>();
        if (countResult && countResult.count >= channel.total_video_count) {
             return {
                count: 0,
                range_start: nowIso,
                range_end: nowIso,
                sample_video: null,
                is_complete: true
             };
        }
    }

    const oneDay = 24 * 60 * 60 * 1000;
    const oneMonth = 30 * oneDay;

    let searchStart: Date;
    let searchEnd: Date;
    let direction: 'forward' | 'backward' = 'backward';

    // Parse existing sync dates or defaults
    const currentSyncStart = channel.sync_start_date ? new Date(channel.sync_start_date) : null;
    const currentSyncEnd = channel.sync_end_date ? new Date(channel.sync_end_date) : null;
    const publishedAt = new Date(channel.published_at);

    // Determine strategy
    if (!currentSyncEnd || !currentSyncStart) {
      // First run: Check last month
      searchEnd = now;
      searchStart = new Date(now.getTime() - oneMonth);
      direction = 'backward';
    } else {
      // Check if we need to catch up forward (e.g., if last sync end is > 1 day ago)
      if (now.getTime() - currentSyncEnd.getTime() > oneDay) {
        searchStart = currentSyncEnd;
        searchEnd = now;
        direction = 'forward';
      } else {
        // Go backwards
        searchEnd = currentSyncStart;
        searchStart = new Date(searchEnd.getTime() - oneMonth);
        direction = 'backward';
      }
    }

    // Clamp searchStart to channel creation
    if (searchStart < publishedAt) {
      searchStart = publishedAt;
    }

    // Safety check: if start >= end (and not just same millisecond quirk), we might be done or overlapping
    if (searchStart >= searchEnd) {
        if (direction === 'backward' && searchStart.getTime() === publishedAt.getTime()) {
             return {
                count: 0,
                range_start: searchStart.toISOString(),
                range_end: searchEnd.toISOString(),
                sample_video: null,
                is_complete: true
             };
        }
        // Minimal window to ensure API validity
        searchStart = new Date(searchEnd.getTime() - 1000);
    }


    // Call Search API
    // Note: publishedAfter is inclusive, publishedBefore is exclusive usually, but RFC 3339
    const searchParams: Record<string, string> = {
      channelId: channelId,
      part: 'id,snippet',
      type: 'video',
      order: 'date',
      publishedAfter: searchStart.toISOString(),
      publishedBefore: searchEnd.toISOString(),
      maxResults: '50' // Max allowed
    };

    let videoIds: string[] = [];
    let nextPageToken: string | undefined;

    // We need to loop through pages within this date range because maxResults is 50
    // But to prevent timeouts, we limit the pages per sync call too.
    // Let's grab up to 500 videos (10 pages) per sync call.
    let pagesFetched = 0;
    const MAX_PAGES_PER_SYNC = 10;

    do {
      if (nextPageToken) searchParams.pageToken = nextPageToken;

      const searchRes = await this.fetchFromApi<YoutubeListResponse<YoutubeSearchResource>>('search', searchParams);

      if (searchRes.items) {
        searchRes.items.forEach(item => {
          if (item.id.videoId) videoIds.push(item.id.videoId);
        });
      }

      nextPageToken = searchRes.nextPageToken;
      pagesFetched++;
    } while (nextPageToken && pagesFetched < MAX_PAGES_PER_SYNC);

    let sampleVideo: YoutubeVideo | null = null;
    let savedCount = 0;

    if (videoIds.length > 0) {
      // Fetch details in batches of 50
      for (let i = 0; i < videoIds.length; i += 50) {
        const batchIds = videoIds.slice(i, i + 50);
        const videosRes = await this.fetchFromApi<YoutubeListResponse<YoutubeVideoResource>>('videos', {
          id: batchIds.join(','),
          part: 'snippet,contentDetails,statistics'
        });

        if (videosRes.items) {
           const insertStmt = this.env.DB.prepare(
            `INSERT INTO youtube_videos
             (youtube_id, title, description, published_at, channel_id, thumbnail_url, duration, statistics, raw_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(youtube_id) DO UPDATE SET
               title=excluded.title,
               description=excluded.description,
               published_at=excluded.published_at,
               channel_id=excluded.channel_id,
               thumbnail_url=excluded.thumbnail_url,
               duration=excluded.duration,
               statistics=excluded.statistics,
               raw_json=excluded.raw_json,
               updated_at=excluded.updated_at`
           );

           const batch = [];
           const nowIso = new Date().toISOString();

           for (const item of videosRes.items) {
             const v: YoutubeVideo = {
                youtube_id: item.id,
                title: item.snippet.title,
                description: item.snippet.description,
                published_at: item.snippet.publishedAt,
                channel_id: item.snippet.channelId,
                thumbnail_url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
                duration: item.contentDetails.duration,
                statistics: JSON.stringify(item.statistics),
                raw_json: JSON.stringify(item),
                created_at: nowIso, // In a replace, we ideally keep created_at, but simplistic replace overwrites. Accepted for cache.
                updated_at: nowIso
             };

             if (!sampleVideo) sampleVideo = v; // Grab first one as sample

             batch.push(insertStmt.bind(
                v.youtube_id, v.title, v.description, v.published_at, v.channel_id,
                v.thumbnail_url, v.duration, v.statistics, v.raw_json, v.created_at, v.updated_at
             ));
           }

           if (batch.length > 0) {
             await this.env.DB.batch(batch);
             savedCount += batch.length;
           }
        }
      }
    }

    // Update Channel Sync State
    let newSyncStart = currentSyncStart;
    let newSyncEnd = currentSyncEnd;

    if (!newSyncEnd || searchEnd > newSyncEnd) {
        newSyncEnd = searchEnd;
    }
    if (!newSyncStart || searchStart < newSyncStart) {
        newSyncStart = searchStart;
    }

    await this.env.DB.prepare(
        `UPDATE youtube_channels
         SET sync_start_date = ?, sync_end_date = ?, last_sync_at = ?
         WHERE youtube_id = ?`
    ).bind(
        newSyncStart?.toISOString(),
        newSyncEnd?.toISOString(),
        nowIso,
        channelId
    ).run();

    return {
        count: savedCount,
        range_start: searchStart.toISOString(),
        range_end: searchEnd.toISOString(),
        sample_video: sampleVideo,
        is_complete: (newSyncStart && newSyncStart.getTime() <= publishedAt.getTime()) || false
    };
  }
}
