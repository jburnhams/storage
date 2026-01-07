import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Env } from '../types';
import { YoutubeService } from '../services/youtube';
import { requireAuth } from '../middleware';

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
    thumbnail_url: z.string(),
    duration: z.string(),
    statistics: z.string(), // JSON string
    raw_json: z.string(), // JSON string
    created_at: z.string(),
    updated_at: z.string(),
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
