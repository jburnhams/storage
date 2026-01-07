import type {
  Env,
  YoutubeChannel,
  YoutubeVideo,
  YoutubeListResponse,
  YoutubeChannelResource,
  YoutubeVideoResource
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

    const response = await fetch(url.toString());

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

  async getChannel(id: string): Promise<YoutubeChannel> {
    // 1. Check DB
    const cached = await this.env.DB.prepare(
      'SELECT * FROM youtube_channels WHERE youtube_id = ?'
    ).bind(id).first<YoutubeChannel>();

    if (cached) {
      return cached;
    }

    // 2. Fetch from API
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
      raw_json: JSON.stringify(item),
      created_at: now,
      updated_at: now
    };

    // 3. Store in DB
    await this.env.DB.prepare(
      `INSERT INTO youtube_channels
       (youtube_id, title, description, custom_url, thumbnail_url, published_at, statistics, raw_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
}
