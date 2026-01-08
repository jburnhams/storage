import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Env } from '../types';
import { YoutubeService } from '../services/youtube';
import { requireAuth } from '../middleware';
import { buildSqlSearch } from '../utils/db_search';
import { GetRandomVideosQuerySchema, RandomVideoResponseSchema, ErrorResponseSchema } from '../schemas';

export function registerYoutubeRoutes(app: OpenAPIHono<{ Bindings: Env }>) {
  const channelSchema = z.object({
    youtube_id: z.string(),
    title: z.string(),
    description: z.string(),
    custom_url: z.string().nullable(),
    thumbnail_url: z.string(),
    published_at: z.string(),
    raw_json: z.string(), // JSON string
    created_at: z.string(),
    updated_at: z.string(),
    upload_playlist_id: z.string().nullable().optional(),
    last_sync_token: z.string().nullable().optional(),
    view_count: z.number().nullable().optional(),
    subscriber_count: z.number().nullable().optional(),
    video_count: z.number().nullable().optional(),
    country: z.string().nullable().optional(),
    best_thumbnail_url: z.string().nullable().optional(),
    best_thumbnail_width: z.number().nullable().optional(),
    best_thumbnail_height: z.number().nullable().optional(),
  });

  // Omit raw_json for the list view
  const channelListEntrySchema = channelSchema.omit({ raw_json: true });

  const channelListSchema = z.object({
    channels: z.array(channelListEntrySchema),
  });

  const videoSchema = z.object({
    youtube_id: z.string(),
    title: z.string(),
    description: z.string(),
    published_at: z.string(),
    channel_id: z.string(),
    channel_title: z.string().optional(),
    thumbnail_url: z.string(),
    duration: z.string(),
    raw_json: z.string(), // JSON string
    created_at: z.string(),
    updated_at: z.string(),
    view_count: z.number().nullable().optional(),
    like_count: z.number().nullable().optional(),
    comment_count: z.number().nullable().optional(),
  });

  const videoListSchema = z.object({
    videos: z.array(videoSchema),
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  });

  const syncResponseSchema = z.object({
    count: z.number(),
    range_start: z.string().nullable(),
    range_end: z.string().nullable(),
    sample_video: videoSchema.nullable(),
    is_complete: z.boolean(),
    total_stored_videos: z.number(),
  });

  // GET /api/videos/random
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/videos/random',
      tags: ['YouTube'],
      summary: 'Get Random Videos',
      description: 'Get a random selection of videos, optionally filtered by duration.',
      middleware: [requireAuth] as any,
      request: {
        query: GetRandomVideosQuerySchema,
      },
      responses: {
        200: {
          description: 'Random videos',
          content: {
            'application/json': {
              schema: RandomVideoResponseSchema,
            },
          },
        },
        500: {
          description: 'Server error',
          content: {
            'application/json': {
              schema: ErrorResponseSchema,
            },
          },
        },
      },
    }),
    async (c) => {
      try {
        const query = c.req.valid('query');
        const count = query.count || 20;
        const minDuration = query.min_duration;
        const maxDuration = query.max_duration;

        const conditions: string[] = [];
        const params: any[] = [];

        if (minDuration !== undefined) {
          conditions.push('v.duration_seconds >= ?');
          params.push(minDuration);
        }

        if (maxDuration !== undefined) {
          conditions.push('v.duration_seconds <= ?');
          params.push(maxDuration);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const sql = `
          SELECT
            v.youtube_id as id,
            v.title,
            v.description,
            v.thumbnail_url as thumbnail,
            v.duration_seconds,
            v.channel_id,
            c.title as channel_title,
            c.thumbnail_url as channel_thumbnail,
            v.published_at,
            v.view_count
          FROM youtube_videos v
          LEFT JOIN youtube_channels c ON v.channel_id = c.youtube_id
          ${whereClause}
          ORDER BY RANDOM()
          LIMIT ?
        `;

        // Add limit to params
        params.push(count);

        const { results } = await c.env.DB.prepare(sql).bind(...params).all();

        return c.json({ videos: results }, 200);
      } catch (error: any) {
        console.error('Random Videos Error:', error);
        return c.json({ error: 'INTERNAL_ERROR', message: error.message }, 500);
      }
    }
  );

  // GET /api/youtube/channels
  app.openapi(
    createRoute({
        method: 'get',
        path: '/api/youtube/channels',
        tags: ['YouTube'],
        summary: 'List YouTube Channels',
        description: 'Get a list of all synced YouTube channels.',
        middleware: [requireAuth] as any,
        responses: {
            200: {
                description: 'List of channels',
                content: {
                    'application/json': {
                        schema: channelListSchema,
                    },
                },
            },
            500: {
                description: 'Server error',
                content: {
                    'application/json': {
                        schema: ErrorResponseSchema,
                    },
                },
            },
        },
    }),
    async (c) => {
        try {
            // Select all columns EXCEPT raw_json and statistics
            const sql = `
                SELECT
                    youtube_id, title, description, custom_url, thumbnail_url,
                    published_at, created_at, updated_at,
                    upload_playlist_id, last_sync_token,
                    view_count, subscriber_count, video_count, country,
                    best_thumbnail_url, best_thumbnail_width, best_thumbnail_height
                FROM youtube_channels
                ORDER BY title ASC
            `;
            const { results } = await c.env.DB.prepare(sql).all();

            return c.json({ channels: results }, 200);
        } catch (error: any) {
            console.error('YouTube Channels Error:', error);
            return c.json({ error: 'INTERNAL_ERROR', message: error.message }, 500);
        }
    }
  );

  // GET /api/youtube/videos
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/youtube/videos',
      tags: ['YouTube'],
      summary: 'Search YouTube Videos',
      description: 'Search and filter YouTube videos with advanced query options.',
      middleware: [requireAuth] as any,
      request: {
        query: z.object({
          limit: z.string().optional(),
          offset: z.string().optional(),
          sort_by: z.string().optional(),
          sort_order: z.string().optional(),
          channel_id: z.string().optional(),
          title_contains: z.string().optional(),
        }).passthrough(),
      },
      responses: {
        200: {
          description: 'Search results',
          content: {
            'application/json': {
              schema: videoListSchema,
            },
          },
        },
        500: {
          description: 'Server error',
          content: {
            'application/json': {
              schema: ErrorResponseSchema,
            },
          },
        },
      },
    }),
    async (c) => {
      try {
        const query = c.req.query();
        const allowedColumns = [
          'youtube_id', 'title', 'description', 'published_at',
          'channel_id', 'thumbnail_url', 'duration',
          'created_at', 'updated_at',
          'view_count', 'like_count', 'comment_count'
        ];

        // Use 'v' as alias for youtube_videos
        const { whereSql, orderSql, limit, offset, whereParams } = buildSqlSearch('youtube_videos', query, allowedColumns, 'v');

        const sql = `
            SELECT
                v.youtube_id, v.title, v.description, v.published_at,
                v.channel_id, v.thumbnail_url, v.duration,
                v.raw_json, v.created_at, v.updated_at,
                v.view_count, v.like_count, v.comment_count,
                c.title as channel_title
            FROM youtube_videos v
            LEFT JOIN youtube_channels c ON v.channel_id = c.youtube_id
            ${whereSql}
            ${orderSql}
            LIMIT ? OFFSET ?
        `;

        const countSql = `
            SELECT COUNT(*) as total
            FROM youtube_videos v
            LEFT JOIN youtube_channels c ON v.channel_id = c.youtube_id
            ${whereSql}
        `;

        const [resultsResult, countResult] = await Promise.all([
          c.env.DB.prepare(sql).bind(...whereParams, limit, offset).all(),
          c.env.DB.prepare(countSql).bind(...whereParams).first()
        ]);

        const results = resultsResult.results;
        const total = countResult ? (countResult.total as number) : 0;

        return c.json({
          videos: results,
          limit,
          offset,
          total,
        }, 200);
      } catch (error: any) {
        console.error('YouTube Search Error:', error);
        return c.json({ error: 'INTERNAL_ERROR', message: error.message }, 500);
      }
    }
  );

  // POST /api/youtube/channel/:id/sync
  app.openapi(
    createRoute({
      method: 'post',
      path: '/api/youtube/channel/{id}/sync',
      tags: ['YouTube'],
      summary: 'Sync Channel Videos',
      description: 'Incrementally fetches videos for a channel using a sliding window.',
      middleware: [requireAuth] as any,
      request: {
        params: z.object({
          id: z.string(),
        }),
      },
      responses: {
        200: {
          description: 'Sync progress',
          content: {
            'application/json': {
              schema: syncResponseSchema,
            },
          },
        },
        404: {
          description: 'Channel not found',
          content: {
            'application/json': {
              schema: ErrorResponseSchema,
            },
          },
        },
        500: {
          description: 'Server error',
          content: {
            'application/json': {
              schema: ErrorResponseSchema,
            },
          },
        },
      },
    }),
    async (c) => {
      const id = c.req.param('id');
      const service = new YoutubeService(c.env);

      try {
        const result = await service.syncChannelVideos(id);
        return c.json(result, 200);
      } catch (error: any) {
        if (error.message.includes('not found') || error.message.includes('Not Found')) {
          return c.json({ error: 'NOT_FOUND', message: error.message }, 404);
        }
        console.error('YouTube Sync Error:', error);
        return c.json({ error: 'INTERNAL_ERROR', message: error.message }, 500);
      }
    }
  );

  // GET /api/youtube/channel/:id
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/youtube/channel/{id}',
      tags: ['YouTube'],
      summary: 'Get YouTube Channel',
      description: 'Fetches channel info from DB or YouTube API (read-through cache).',
      middleware: [requireAuth] as any,
      request: {
        params: z.object({
          id: z.string(),
        }),
      },
      responses: {
        200: {
          description: 'Channel information',
          content: {
            'application/json': {
              schema: channelSchema,
            },
          },
        },
        404: {
          description: 'Channel not found',
          content: {
            'application/json': {
              schema: ErrorResponseSchema,
            },
          },
        },
        500: {
            description: 'Server error',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                }
            }
        }
      },
    }),
    async (c) => {
      const id = c.req.param('id');
      const service = new YoutubeService(c.env);

      try {
        const channel = await service.getChannel(id);
        return c.json(channel, 200);
      } catch (error: any) {
        if (error.message.includes('not found') || error.message.includes('Not Found')) {
            return c.json({ error: 'NOT_FOUND', message: error.message }, 404);
        }
        console.error('YouTube API Error:', error);
        return c.json({ error: 'INTERNAL_ERROR', message: error.message }, 500);
      }
    }
  );

  // GET /api/youtube/video/:id
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/youtube/video/{id}',
      tags: ['YouTube'],
      summary: 'Get YouTube Video',
      description: 'Fetches video info from DB or YouTube API (read-through cache).',
      middleware: [requireAuth] as any,
      request: {
        params: z.object({
          id: z.string(),
        }),
      },
      responses: {
        200: {
          description: 'Video information',
          content: {
            'application/json': {
              schema: videoSchema,
            },
          },
        },
        404: {
          description: 'Video not found',
          content: {
            'application/json': {
              schema: ErrorResponseSchema,
            },
          },
        },
        500: {
            description: 'Server error',
            content: {
                'application/json': {
                    schema: ErrorResponseSchema,
                }
            }
        }
      },
    }),
    async (c) => {
      const id = c.req.param('id');
      const service = new YoutubeService(c.env);

      try {
        const video = await service.getVideo(id);
        return c.json(video, 200);
      } catch (error: any) {
         if (error.message.includes('not found') || error.message.includes('Not Found')) {
            return c.json({ error: 'NOT_FOUND', message: error.message }, 404);
        }
        console.error('YouTube API Error:', error);
        return c.json({ error: 'INTERNAL_ERROR', message: error.message }, 500);
      }
    }
  );
}
