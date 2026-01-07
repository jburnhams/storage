import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Env } from '../types';
import { YoutubeService } from '../services/youtube';
import { requireAuth } from '../middleware';
import { buildQueryComponents } from '../utils/db_search';

export function registerYoutubeRoutes(app: OpenAPIHono<{ Bindings: Env }>) {
  const channelSchema = z.object({
    youtube_id: z.string(),
    title: z.string(),
    description: z.string(),
    custom_url: z.string().nullable(),
    thumbnail_url: z.string(),
    published_at: z.string(),
    statistics: z.string(), // JSON string
    raw_json: z.string(), // JSON string
    created_at: z.string(),
    updated_at: z.string(),
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
    statistics: z.string(), // JSON string
    raw_json: z.string(), // JSON string
    created_at: z.string(),
    updated_at: z.string(),
  });

  const videoListSchema = z.object({
    videos: z.array(videoSchema),
    limit: z.number(),
    offset: z.number(),
  });

  const errorSchema = z.object({
    error: z.string(),
    message: z.string(),
  });

  const syncResponseSchema = z.object({
    count: z.number(),
    range_start: z.string(),
    range_end: z.string(),
    sample_video: videoSchema.nullable(),
    is_complete: z.boolean(),
  });

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
          // Allow other keys loosely? Zod doesn't strictly allow arbitrary keys by default without .passthrough()
          // But Hono/Zod integration might strip unknown keys.
          // To allow arbitrary filters, we might need to skip strict validation or define common filters.
          // For now, let's explicitly add common ones to valid schema for docs, and use c.req.query() for full access.
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
              schema: errorSchema,
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
          'statistics', 'created_at', 'updated_at'
        ];

        // We use buildQueryComponents to get WHERE/ORDER BY parts
        // but we construct our own SELECT ... JOIN statement.
        // We must ensure WHERE clauses prefix columns with table name if ambiguous.
        // However, buildQueryComponents assumes table column names.
        // Since 'title' is in both, we might have issues if we filter by title.
        // Let's assume title filter is for video title.

        // Actually, if we pass 'youtube_videos' as table name to logic, it doesn't prefix.
        // But since we want to filter VIDEOS, the default behavior (unprefixed) works if we alias the table or just rely on precedence?
        // SQLite will complain if 'title' is ambiguous.
        // So we might need to prefix columns in allowedColumns?

        // Let's modify the query params before passing to buildQueryComponents?
        // Or better: update allowedColumns to include prefixes?
        // But `buildQueryComponents` doesn't prefix automatically.
        // It checks if column is in allowedColumns.

        // If I pass 'youtube_videos.title' in allowedColumns, `buildQueryComponents` will use it if passed as 'youtube_videos.title'?
        // No, the client passes 'title'. `buildQueryComponents` takes `queryParams` and iterates them.
        // If client passes `title_contains`, `buildQueryComponents` infers field `title`.
        // Then it checks if `title` is in `allowedColumns`.
        // If I change allowedColumns to `['youtube_videos.title', ...]`, then `title` won't match.

        // So I need `buildQueryComponents` to map `title` to `youtube_videos.title`?
        // `buildQueryComponents` is generic.

        // Workaround: Use a mapped allowed columns or just handle ambiguous columns manually?
        // Or, since `youtube_channels` is just for display, maybe I can just do:
        // SELECT v.*, c.title as channel_title FROM youtube_videos v LEFT JOIN youtube_channels c ON v.channel_id = c.youtube_id

        // But WHERE clause needs to specify `v.title` if `c.title` exists.
        // Yes, `title` exists in both.

        // I should probably manually prefix the ambiguous columns in the WHERE clause if I can.
        // But `buildQueryComponents` generates the WHERE string.

        // Let's cheat a bit:
        // We can pass a modified query object where we rename 'title_contains' to 'youtube_videos.title_contains'?
        // `buildQueryComponents` splits by last `_op`.
        // field becomes `youtube_videos.title`.
        // allowedColumns should contain `youtube_videos.title`.

        const prefixedQuery = { ...query };
        const videoColumns = [
          'youtube_id', 'title', 'description', 'published_at',
          'channel_id', 'thumbnail_url', 'duration',
          'statistics', 'created_at', 'updated_at'
        ];

        // Prefix ambiguous columns or all columns
        // Ambiguous: title, description, created_at, updated_at, statistics, raw_json
        // Unambiguous: youtube_id (pk), channel_id, published_at (video only?), thumbnail_url (both?), duration (video only)

        // To be safe, let's prefix all video filters with 'v.'.
        // We iterate query keys, and if they refer to a video column, prefix it.
        const prefixedAllowedColumns: string[] = [];

        for (const key of Object.keys(prefixedQuery)) {
           if (['limit', 'offset', 'sort_by', 'sort_order'].includes(key)) continue;

           // Find base key (strip op)
           // This logic is duplicated from buildQueryComponents but needed to map keys.
           // Actually, `buildQueryComponents` is simple.
           // Let's just prefix the ones we know are common.

           // Simpler: Just rely on SQLite resolving to the first table in FROM?
           // No, SQLite throws "ambiguous column name".

           // Let's modify `buildQueryComponents` to support an optional table alias prefix?
           // Or just do the remapping here.

           const ops = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'contains'];
           let field = key;
           let opSuffix = '';
           for (const op of ops) {
             if (key.endsWith(`_${op}`)) {
                field = key.slice(0, -1 * (op.length + 1));
                opSuffix = `_${op}`;
                break;
             }
           }

           if (videoColumns.includes(field)) {
             // It's a video column. Replace key with v.field_op
             delete prefixedQuery[key];
             prefixedQuery[`v.${field}${opSuffix}`] = query[key];
           }
        }

        // Handle sort_by
        if (prefixedQuery.sort_by && videoColumns.includes(prefixedQuery.sort_by)) {
            prefixedQuery.sort_by = `v.${prefixedQuery.sort_by}`;
        }

        const allowedPrefixed = videoColumns.map(c => `v.${c}`);

        const { whereSql, orderSql, params, limit, offset } = buildQueryComponents(prefixedQuery, allowedPrefixed);

        const sql = `
            SELECT v.*, c.title as channel_title
            FROM youtube_videos v
            LEFT JOIN youtube_channels c ON v.channel_id = c.youtube_id
            ${whereSql}
            ${orderSql}
            LIMIT ? OFFSET ?
        `;

        const { results } = await c.env.DB.prepare(sql).bind(...params, limit, offset).all();

        // Parse JSON fields if necessary (D1 might return them as strings)
        const parsedResults = results.map((row: any) => ({
            ...row,
           // Ensure these are strings if D1 returns them as such, or keep as is.
           // Schema says TEXT, but if they were inserted as strings, they come out as strings.
        }));

        return c.json({
          videos: parsedResults,
          limit: limit,
          offset: offset,
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
              schema: errorSchema,
            },
          },
        },
        500: {
          description: 'Server error',
          content: {
            'application/json': {
              schema: errorSchema,
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
              schema: errorSchema,
            },
          },
        },
        500: {
            description: 'Server error',
            content: {
                'application/json': {
                    schema: errorSchema,
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
              schema: errorSchema,
            },
          },
        },
        500: {
            description: 'Server error',
            content: {
                'application/json': {
                    schema: errorSchema,
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
