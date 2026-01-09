import type {
  Env,
  YoutubeChannel,
  YoutubeVideo,
  YoutubeListResponse,
  YoutubeChannelResource,
  YoutubeVideoResource,
  YoutubeThumbnails,
  YoutubeThumbnail
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

  // Helper to parse ISO 8601 duration to seconds
  // Supports P1DT1H1M1S format
  private parseDuration(duration: string): number {
    const regex = /P(?:([0-9]+)D)?T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?/;
    const matches = duration.match(regex);
    if (!matches) return 0;

    const days = parseInt(matches[1] || '0');
    const hours = parseInt(matches[2] || '0');
    const minutes = parseInt(matches[3] || '0');
    const seconds = parseInt(matches[4] || '0');

    return (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
  }

  // Helper to find the largest thumbnail
  private findBestThumbnail(thumbnails: YoutubeThumbnails): { url: string; width: number; height: number } | null {
    if (!thumbnails) return null;

    // Check keys in order of preference if width/height are reliable,
    // but the user said "don't rely on names", so we should check all keys that exist
    // and sort by width * height.

    let best: YoutubeThumbnail | null = null;
    let maxPixels = 0;

    const keys = ['maxres', 'standard', 'high', 'medium', 'default'] as const;

    // First pass: try standard keys
    for (const key of keys) {
        if (thumbnails[key]) {
             const t = thumbnails[key]!;
             const pixels = t.width * t.height;
             if (pixels > maxPixels) {
                 maxPixels = pixels;
                 best = t;
             }
        }
    }

    // Fallback: If for some reason we missed something (unlikely with typed keys),
    // or if we just want to be safe, the above loop covers the known types.
    // If no dimensions are provided (0x0), we might just fallback to 'maxres' or 'high' URL.
    // Assuming width/height are present.

    if (best) {
        return { url: best.url, width: best.width, height: best.height };
    }

    // If we have urls but no dimensions, fallback to priority list
    for (const key of keys) {
        if (thumbnails[key]) {
            return {
                url: thumbnails[key]!.url,
                width: thumbnails[key]!.width || 0,
                height: thumbnails[key]!.height || 0
            };
        }
    }

    return null;
  }

  async resolveChannelId(input: string): Promise<string> {
    if (input.startsWith('UC') && input.length === 24) {
      return input;
    }
    try {
        const listRes = await this.fetchFromApi<YoutubeListResponse<YoutubeChannelResource>>('channels', {
            forHandle: input,
            part: 'id'
        });

        if (listRes.items && listRes.items.length > 0) {
            return listRes.items[0].id;
        }
    } catch (e: any) {
        const msg = e.message || '';
        // Only log unexpected errors, silence expected 404s
        if (!msg.includes('404') && !msg.includes('Not Found')) {
            console.error("Error resolving handle:", e);
        }
    }
    throw new Error(`Channel not found for: ${input}`);
  }

  async getChannel(idOrHandle: string): Promise<YoutubeChannel> {
    let id = idOrHandle;

    // 1. Check DB by ID
    // We fetch raw first, then cast to remove 'statistics' property if present (it will be present in DB row)
    let cached = await this.env.DB.prepare(
      'SELECT * FROM youtube_channels WHERE youtube_id = ?'
    ).bind(id).first<YoutubeChannel & { statistics?: string }>();

    if (cached) {
      if ('statistics' in cached) delete cached.statistics;
      return cached;
    }

    // 2. Check DB by custom_url
    cached = await this.env.DB.prepare(
      'SELECT * FROM youtube_channels WHERE custom_url = ? OR custom_url = ?'
    ).bind(idOrHandle, idOrHandle.toLowerCase()).first<YoutubeChannel & { statistics?: string }>();

    if (cached) {
      if ('statistics' in cached) delete cached.statistics;
      return cached;
    }

    // 3. Resolve ID if needed
    if (!id.startsWith('UC') || id.length !== 24) {
      try {
        id = await this.resolveChannelId(idOrHandle);
        cached = await this.env.DB.prepare(
          'SELECT * FROM youtube_channels WHERE youtube_id = ?'
        ).bind(id).first<YoutubeChannel & { statistics?: string }>();
        if (cached) {
           if ('statistics' in cached) delete cached.statistics;
           return cached;
        }
      } catch (e) {
        throw e;
      }
    }

    // 4. Fetch from API
    // Added 'snippet,statistics,contentDetails' (kept same for now)
    // We should add country if we want it. 'snippet' contains country.
    const data = await this.fetchFromApi<YoutubeListResponse<YoutubeChannelResource>>('channels', {
      id: id,
      part: 'snippet,statistics,contentDetails'
    });

    if (!data.items || data.items.length === 0) {
      throw new Error(`Channel not found: ${id}`);
    }

    const item = data.items[0];
    const now = new Date().toISOString();
    const contentDetails = item.contentDetails as any;
    const uploadPlaylistId = contentDetails?.relatedPlaylists?.uploads || null;

    const bestThumb = this.findBestThumbnail(item.snippet.thumbnails);
    const statisticsJson = JSON.stringify(item.statistics);

    const channel: YoutubeChannel = {
      youtube_id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      custom_url: item.snippet.customUrl || null,
      thumbnail_url: bestThumb?.url || '',
      published_at: item.snippet.publishedAt,
      // statistics: statisticsJson, // Removed from object, still used for DB
      raw_json: JSON.stringify(item),
      created_at: now,
      updated_at: now,
      upload_playlist_id: uploadPlaylistId,
      last_sync_token: null,
      // New Fields
      view_count: parseInt(item.statistics.viewCount || '0'),
      subscriber_count: parseInt(item.statistics.subscriberCount || '0'),
      video_count: parseInt(item.statistics.videoCount || '0'),
      country: item.snippet.country || null,
      best_thumbnail_url: bestThumb?.url || null,
      best_thumbnail_width: bestThumb?.width || null,
      best_thumbnail_height: bestThumb?.height || null
    };

    // 5. Store in DB
    await this.env.DB.prepare(
      `INSERT INTO youtube_channels
       (youtube_id, title, description, custom_url, thumbnail_url, published_at, statistics, raw_json, created_at, updated_at, upload_playlist_id,
        view_count, subscriber_count, video_count, country, best_thumbnail_url, best_thumbnail_width, best_thumbnail_height)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(youtube_id) DO UPDATE SET
       title=excluded.title,
       description=excluded.description,
       custom_url=excluded.custom_url,
       thumbnail_url=excluded.thumbnail_url,
       statistics=excluded.statistics,
       raw_json=excluded.raw_json,
       updated_at=excluded.updated_at,
       upload_playlist_id=excluded.upload_playlist_id,
       view_count=excluded.view_count,
       subscriber_count=excluded.subscriber_count,
       video_count=excluded.video_count,
       country=excluded.country,
       best_thumbnail_url=excluded.best_thumbnail_url,
       best_thumbnail_width=excluded.best_thumbnail_width,
       best_thumbnail_height=excluded.best_thumbnail_height`
    ).bind(
      channel.youtube_id,
      channel.title,
      channel.description,
      channel.custom_url,
      channel.thumbnail_url,
      channel.published_at,
      statisticsJson, // Using local variable
      channel.raw_json,
      channel.created_at,
      channel.updated_at,
      channel.upload_playlist_id,
      channel.view_count,
      channel.subscriber_count,
      channel.video_count,
      channel.country,
      channel.best_thumbnail_url,
      channel.best_thumbnail_width,
      channel.best_thumbnail_height
    ).run();

    return channel;
  }

  async getVideo(id: string): Promise<YoutubeVideo> {
    // 1. Check DB
    const cached = await this.env.DB.prepare(
      'SELECT * FROM youtube_videos WHERE youtube_id = ?'
    ).bind(id).first<YoutubeVideo & { statistics?: string }>();

    if (cached) {
       if ('statistics' in cached) delete cached.statistics;
       return cached;
    }

    // 2. Fetch from API
    // Added 'status' to part
    const data = await this.fetchFromApi<YoutubeListResponse<YoutubeVideoResource>>('videos', {
      id: id,
      part: 'snippet,contentDetails,statistics,status'
    });

    if (!data.items || data.items.length === 0) {
      throw new Error(`Video not found: ${id}`);
    }

    const item = data.items[0];
    const now = new Date().toISOString();
    const bestThumb = this.findBestThumbnail(item.snippet.thumbnails);
    const statisticsJson = JSON.stringify(item.statistics);

    const video: YoutubeVideo = {
      youtube_id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      published_at: item.snippet.publishedAt,
      channel_id: item.snippet.channelId,
      thumbnail_url: bestThumb?.url || '',
      duration: item.contentDetails.duration,
      // statistics: statisticsJson, // Removed from object, still used for DB
      raw_json: JSON.stringify(item),
      created_at: now,
      updated_at: now,
      // New Fields
      duration_seconds: this.parseDuration(item.contentDetails.duration),
      view_count: parseInt(item.statistics.viewCount || '0'),
      like_count: parseInt(item.statistics.likeCount || '0'),
      comment_count: parseInt(item.statistics.commentCount || '0'),
      best_thumbnail_url: bestThumb?.url || null,
      best_thumbnail_width: bestThumb?.width || null,
      best_thumbnail_height: bestThumb?.height || null,
      definition: item.contentDetails.definition || null,
      dimension: item.contentDetails.dimension || null,
      licensed_content: item.contentDetails.licensedContent ? 1 : 0,
      caption: item.contentDetails.caption === 'true' ? 1 : 0,
      privacy_status: item.status?.privacyStatus || null,
      embeddable: item.status?.embeddable ? 1 : 0,
      made_for_kids: item.status?.madeForKids ? 1 : 0
    };

    // 3. Store in DB
    await this.env.DB.prepare(
      `INSERT INTO youtube_videos
       (youtube_id, title, description, published_at, channel_id, thumbnail_url, duration, statistics, raw_json, created_at, updated_at,
        duration_seconds, view_count, like_count, comment_count, best_thumbnail_url, best_thumbnail_width, best_thumbnail_height,
        definition, dimension, licensed_content, caption, privacy_status, embeddable, made_for_kids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      video.youtube_id,
      video.title,
      video.description,
      video.published_at,
      video.channel_id,
      video.thumbnail_url,
      video.duration,
      statisticsJson, // Using local variable
      video.raw_json,
      video.created_at,
      video.updated_at,
      video.duration_seconds,
      video.view_count,
      video.like_count,
      video.comment_count,
      video.best_thumbnail_url,
      video.best_thumbnail_width,
      video.best_thumbnail_height,
      video.definition,
      video.dimension,
      video.licensed_content,
      video.caption,
      video.privacy_status,
      video.embeddable,
      video.made_for_kids
    ).run();

    return video;
  }

  async syncChannelVideos(channelId: string): Promise<{
    count: number;
    range_start: string | null;
    range_end: string | null;
    sample_video: YoutubeVideo | null;
    is_complete: boolean;
  }> {
    // 1. Get Channel (ensure we have upload_playlist_id)
    let channel = await this.getChannel(channelId);

    // If upload_playlist_id is missing (old record), force refresh
    if (!channel.upload_playlist_id) {
         const data = await this.fetchFromApi<YoutubeListResponse<YoutubeChannelResource>>('channels', {
            id: channelId,
            part: 'snippet,statistics,contentDetails'
         });
         if (data.items && data.items.length > 0) {
             const item = data.items[0];
             const contentDetails = item.contentDetails as any;
             channel.upload_playlist_id = contentDetails?.relatedPlaylists?.uploads || null;

             await this.env.DB.prepare('UPDATE youtube_channels SET upload_playlist_id = ? WHERE youtube_id = ?')
                .bind(channel.upload_playlist_id, channelId).run();
         }
    }

    if (!channel.upload_playlist_id) {
        throw new Error("Could not determine upload playlist ID for channel");
    }

    const playlistId = channel.upload_playlist_id;
    const lastSyncToken = channel.last_sync_token;

    let sampleVideo: YoutubeVideo | null = null;
    let savedCount = 0;
    let minDate: string | null = null;
    let maxDate: string | null = null;

    const videoIdsToFetch = new Set<string>();
    let newBackfillToken: string | null = lastSyncToken || null;

    // --- Phase 1: Latest ---
    const latestRes = await this.fetchFromApi<YoutubeListResponse<any>>('playlistItems', {
        playlistId: playlistId,
        part: 'snippet',
        maxResults: '50'
    });

    if (latestRes.items) {
        for (const item of latestRes.items) {
            const vid = item.snippet?.resourceId?.videoId;
            if (vid) videoIdsToFetch.add(vid);
        }
    }

    if (!lastSyncToken && latestRes.nextPageToken) {
        newBackfillToken = latestRes.nextPageToken;
    }

    // --- Phase 2: Backfill ---
    if (lastSyncToken) {
        try {
            const backfillRes = await this.fetchFromApi<YoutubeListResponse<any>>('playlistItems', {
                playlistId: playlistId,
                part: 'snippet',
                maxResults: '50',
                pageToken: lastSyncToken
            });

            if (backfillRes.items) {
                for (const item of backfillRes.items) {
                    const vid = item.snippet?.resourceId?.videoId;
                    if (vid) videoIdsToFetch.add(vid);
                }
            }

            newBackfillToken = backfillRes.nextPageToken || null;
        } catch (e: any) {
            if (e.message && e.message.includes('400')) {
                console.warn("Invalid page token, resetting backfill token.");
                newBackfillToken = null;
            } else {
                throw e;
            }
        }
    }

    // --- Processing ---
    const uniqueIds = Array.from(videoIdsToFetch);
    const idsToFetchDetails: string[] = [];

    if (uniqueIds.length > 0) {
        for (let i = 0; i < uniqueIds.length; i += 50) {
            const batch = uniqueIds.slice(i, i + 50);
            const placeholders = batch.map(() => '?').join(',');
            const existing = await this.env.DB.prepare(
                `SELECT youtube_id FROM youtube_videos WHERE youtube_id IN (${placeholders})`
            ).bind(...batch).all<{youtube_id: string}>();

            const existingSet = new Set(existing.results.map(r => r.youtube_id));

            for (const id of batch) {
                if (!existingSet.has(id)) {
                    idsToFetchDetails.push(id);
                }
            }
        }
    }

    // Fetch Details for missing videos
    if (idsToFetchDetails.length > 0) {
        for (let i = 0; i < idsToFetchDetails.length; i += 50) {
            const batchIds = idsToFetchDetails.slice(i, i + 50);
            // Added 'status' here too
            const videosRes = await this.fetchFromApi<YoutubeListResponse<YoutubeVideoResource>>('videos', {
                id: batchIds.join(','),
                part: 'snippet,contentDetails,statistics,status'
            });

            if (videosRes.items) {
                const insertStmt = this.env.DB.prepare(
                    `INSERT OR REPLACE INTO youtube_videos
                     (youtube_id, title, description, published_at, channel_id, thumbnail_url, duration, statistics, raw_json, created_at, updated_at,
                      duration_seconds, view_count, like_count, comment_count, best_thumbnail_url, best_thumbnail_width, best_thumbnail_height,
                      definition, dimension, licensed_content, caption, privacy_status, embeddable, made_for_kids)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                );

                const batch = [];
                const nowIso = new Date().toISOString();

                for (const item of videosRes.items) {
                     const bestThumb = this.findBestThumbnail(item.snippet.thumbnails);
                     const statisticsJson = JSON.stringify(item.statistics);
                     const v: YoutubeVideo = {
                        youtube_id: item.id,
                        title: item.snippet.title,
                        description: item.snippet.description,
                        published_at: item.snippet.publishedAt,
                        channel_id: item.snippet.channelId,
                        thumbnail_url: bestThumb?.url || '',
                        duration: item.contentDetails.duration,
                        // statistics: statisticsJson, // Removed from object, still used for DB
                        raw_json: JSON.stringify(item),
                        created_at: nowIso,
                        updated_at: nowIso,
                        duration_seconds: this.parseDuration(item.contentDetails.duration),
                        view_count: parseInt(item.statistics.viewCount || '0'),
                        like_count: parseInt(item.statistics.likeCount || '0'),
                        comment_count: parseInt(item.statistics.commentCount || '0'),
                        best_thumbnail_url: bestThumb?.url || null,
                        best_thumbnail_width: bestThumb?.width || null,
                        best_thumbnail_height: bestThumb?.height || null,
                        definition: item.contentDetails.definition || null,
                        dimension: item.contentDetails.dimension || null,
                        licensed_content: item.contentDetails.licensedContent ? 1 : 0,
                        caption: item.contentDetails.caption === 'true' ? 1 : 0,
                        privacy_status: item.status?.privacyStatus || null,
                        embeddable: item.status?.embeddable ? 1 : 0,
                        made_for_kids: item.status?.madeForKids ? 1 : 0
                     };

                     if (!minDate || v.published_at < minDate) minDate = v.published_at;
                     if (!maxDate || v.published_at > maxDate) maxDate = v.published_at;

                     if (!sampleVideo) sampleVideo = v;

                     batch.push(insertStmt.bind(
                        v.youtube_id, v.title, v.description, v.published_at, v.channel_id,
                        v.thumbnail_url, v.duration, statisticsJson, v.raw_json, v.created_at, v.updated_at,
                        v.duration_seconds, v.view_count, v.like_count, v.comment_count, v.best_thumbnail_url, v.best_thumbnail_width, v.best_thumbnail_height,
                        v.definition, v.dimension, v.licensed_content, v.caption, v.privacy_status, v.embeddable, v.made_for_kids
                     ));
                }

                if (batch.length > 0) {
                    await this.env.DB.batch(batch);
                    savedCount += batch.length;
                }
            }
        }
    }

    // Update Channel State
    const nowIso = new Date().toISOString();
    await this.env.DB.prepare(
        `UPDATE youtube_channels
         SET last_sync_token = ?, last_sync_at = ?
         WHERE youtube_id = ?`
    ).bind(
        newBackfillToken,
        nowIso,
        channelId
    ).run();

    const totalStored = await this.env.DB.prepare(
      'SELECT COUNT(*) as count FROM youtube_videos WHERE channel_id = ?'
    ).bind(channelId).first<number>('count');

    if (sampleVideo) {
        sampleVideo.channel_title = channel.title;
    }

    return {
        count: savedCount,
        range_start: minDate,
        range_end: maxDate,
        sample_video: sampleVideo,
        is_complete: newBackfillToken === null,
        total_stored_videos: totalStored || 0
    };
  }
}
