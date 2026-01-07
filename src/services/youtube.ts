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

    // 2. Try to resolve using forHandle
    // Note: input should be a handle, but if it doesn't start with @, maybe we prepend?
    // The user said "looking up channel id from a name".
    // If we assume strict handle resolution, we might want to ensure it works.
    // YouTube's forHandle takes the handle string.

    // Attempt resolution
    try {
        const listRes = await this.fetchFromApi<YoutubeListResponse<YoutubeChannelResource>>('channels', {
            forHandle: input,
            part: 'id'
        });

        if (listRes.items && listRes.items.length > 0) {
            return listRes.items[0].id;
        }
    } catch (e) {
        // Fall through or re-throw?
        console.error("Error resolving handle:", e);
    }

    // If forHandle failed, we throw. We removed the expensive 'search' fallback.
    throw new Error(`Channel not found for: ${input}`);
  }

  async getChannel(idOrHandle: string): Promise<YoutubeChannel> {
    let id = idOrHandle;

    // 1. Check DB by ID
    let cached = await this.env.DB.prepare(
      'SELECT * FROM youtube_channels WHERE youtube_id = ?'
    ).bind(id).first<YoutubeChannel>();

    if (cached) {
      return cached;
    }

    // 2. Check DB by custom_url (handle)
    cached = await this.env.DB.prepare(
      'SELECT * FROM youtube_channels WHERE custom_url = ? OR custom_url = ?'
    ).bind(idOrHandle, idOrHandle.toLowerCase()).first<YoutubeChannel>();

    if (cached) {
      return cached;
    }

    // 3. Resolve ID if needed
    if (!id.startsWith('UC') || id.length !== 24) {
      try {
        id = await this.resolveChannelId(idOrHandle);

        // Check DB again with resolved ID
        cached = await this.env.DB.prepare(
          'SELECT * FROM youtube_channels WHERE youtube_id = ?'
        ).bind(id).first<YoutubeChannel>();

        if (cached) {
          return cached;
        }
      } catch (e) {
        throw e;
      }
    }

    // 4. Fetch from API using ID
    const data = await this.fetchFromApi<YoutubeListResponse<YoutubeChannelResource>>('channels', {
      id: id,
      part: 'snippet,statistics,contentDetails' // Added contentDetails for upload playlist
    });

    if (!data.items || data.items.length === 0) {
      throw new Error(`Channel not found: ${id}`);
    }

    const item = data.items[0];
    const now = new Date().toISOString();

    // Extract upload playlist ID
    // The type definition for contentDetails needs to support relatedPlaylists
    // We cast to any or update types. Let's update types properly in the future but for now I'll cast or assume it's there.
    // Actually, I should check my types.ts. YoutubeChannelResource contentDetails?
    // I need to update types if I want type safety.
    // Ideally I should update types.ts first, but I already did. Let's check what I added.
    // I didn't add relatedPlaylists to types. Let's use `any` cast for now to proceed, or update types.
    // Wait, I can just read it as `any`.
    const contentDetails = item.contentDetails as any;
    const uploadPlaylistId = contentDetails?.relatedPlaylists?.uploads || null;

    const channel: YoutubeChannel = {
      youtube_id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      custom_url: item.snippet.customUrl || null,
      thumbnail_url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
      published_at: item.snippet.publishedAt,
      statistics: JSON.stringify(item.statistics),
      raw_json: JSON.stringify(item),
      created_at: now,
      updated_at: now,
      upload_playlist_id: uploadPlaylistId,
      last_sync_token: null
    };

    // 5. Store in DB
    // We use INSERT OR REPLACE logic, effectively upserting
    await this.env.DB.prepare(
      `INSERT INTO youtube_channels
       (youtube_id, title, description, custom_url, thumbnail_url, published_at, statistics, raw_json, created_at, updated_at, upload_playlist_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(youtube_id) DO UPDATE SET
       title=excluded.title,
       description=excluded.description,
       custom_url=excluded.custom_url,
       thumbnail_url=excluded.thumbnail_url,
       statistics=excluded.statistics,
       raw_json=excluded.raw_json,
       updated_at=excluded.updated_at,
       upload_playlist_id=excluded.upload_playlist_id`
    ).bind(
      channel.youtube_id,
      channel.title,
      channel.description,
      channel.custom_url,
      channel.thumbnail_url,
      channel.published_at,
      channel.statistics,
      channel.raw_json,
      channel.created_at,
      channel.updated_at,
      channel.upload_playlist_id
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

    // 3. Store in DB
    await this.env.DB.prepare(
      `INSERT INTO youtube_videos
       (youtube_id, title, description, published_at, channel_id, thumbnail_url, duration, statistics, raw_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    range_start: string | null;
    range_end: string | null;
    sample_video: YoutubeVideo | null;
    is_complete: boolean;
  }> {
    // 1. Get Channel (ensure we have upload_playlist_id)
    let channel = await this.getChannel(channelId);

    // If upload_playlist_id is missing (old record), force refresh
    if (!channel.upload_playlist_id) {
         // Force refresh by calling API manually or just call getChannel?
         // Since getChannel reads DB first, we need to bypass or ensure update.
         // Let's manually refetch and update.
         const data = await this.fetchFromApi<YoutubeListResponse<YoutubeChannelResource>>('channels', {
            id: channelId,
            part: 'snippet,statistics,contentDetails'
         });
         if (data.items && data.items.length > 0) {
             const item = data.items[0];
             const contentDetails = item.contentDetails as any;
             channel.upload_playlist_id = contentDetails?.relatedPlaylists?.uploads || null;

             // Update DB
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

    // We will collect IDs to fetch.
    // Phase 1: Always fetch Page 1 (Latest)
    // Phase 2: If lastSyncToken exists, fetch that Page (Backfill)

    // We use a Set to avoid duplicates if Page 1 overlaps with Backfill token (unlikely but possible)
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

    // If we have no backfill token, the "nextPageToken" from latestRes is our start for backfill next time.
    if (!lastSyncToken && latestRes.nextPageToken) {
        newBackfillToken = latestRes.nextPageToken;
    }

    // --- Phase 2: Backfill ---
    // Only if we have a valid token (and it's not the same as what we just fetched, though hard to know)
    // If we just started (no lastSyncToken), we already got page 1.
    // If we have lastSyncToken, we fetch it.
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

            // Update token for next time
            newBackfillToken = backfillRes.nextPageToken || null; // If null, we reached end
        } catch (e: any) {
            // If token is invalid (400), we might want to reset it?
            if (e.message && e.message.includes('400')) {
                console.warn("Invalid page token, resetting backfill token.");
                newBackfillToken = null; // Start over next time (or from page 2 of fresh?)
            } else {
                throw e;
            }
        }
    }

    // --- Processing ---
    // Filter out existing videos to save cost
    const uniqueIds = Array.from(videoIdsToFetch);
    const idsToFetchDetails: string[] = [];

    // Check DB for existence
    // We can do a batched check or one by one. Batched is better.
    // SQLite limits parameters, but 100 is fine.
    if (uniqueIds.length > 0) {
        // Chunk checks
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
            const videosRes = await this.fetchFromApi<YoutubeListResponse<YoutubeVideoResource>>('videos', {
                id: batchIds.join(','),
                part: 'snippet,contentDetails,statistics'
            });

            if (videosRes.items) {
                const insertStmt = this.env.DB.prepare(
                    `INSERT OR REPLACE INTO youtube_videos
                     (youtube_id, title, description, published_at, channel_id, thumbnail_url, duration, statistics, raw_json, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
                        created_at: nowIso,
                        updated_at: nowIso
                     };

                     if (!sampleVideo) sampleVideo = v;

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

    return {
        count: savedCount,
        range_start: null, // Deprecated concept
        range_end: null,   // Deprecated concept
        sample_video: sampleVideo,
        is_complete: newBackfillToken === null // If null, we exhausted the list
    };
  }
}
