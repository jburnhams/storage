import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env, User } from '../types';
import type { SessionContext } from '../middleware';
import { requireAuth } from '../middleware';
import { getEntryById, deleteEntry, getEntryByKeySecret, getCollectionBySecret, listEntries } from '../storage';
import { getUserById, isUserAdmin } from '../session';
import JSZip from 'jszip';
import {
  BulkDownloadRequestSchema,
  BulkExportRequestSchema,
  BulkDeleteRequestSchema,
  PublicShareQuerySchema,
  EntryResponseSchema,
  ErrorResponseSchema,
} from '../schemas';

type AppType = OpenAPIHono<{
  Bindings: Env;
  Variables: { session?: SessionContext };
}>;

// POST /api/storage/bulk/download
const bulkDownloadRoute = createRoute({
  method: 'post',
  path: '/api/storage/bulk/download',
  tags: ['Bulk Operations'],
  summary: 'Bulk download entries as ZIP',
  middleware: [requireAuth] as any,
  request: {
    body: {
      content: {
        'application/json': {
          schema: BulkDownloadRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'ZIP file',
      content: {
        'application/zip': {
          schema: z.string().openapi({ format: 'binary' }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/storage/bulk/export
const bulkExportRoute = createRoute({
  method: 'post',
  path: '/api/storage/bulk/export',
  tags: ['Bulk Operations'],
  summary: 'Bulk export entries as JSON',
  middleware: [requireAuth] as any,
  request: {
    body: {
      content: {
        'application/json': {
          schema: BulkExportRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Exported entries',
      content: {
        'application/json': {
          schema: z.object({
            contents: z.array(z.object({}).passthrough()),
          }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/storage/bulk/delete
const bulkDeleteRoute = createRoute({
  method: 'post',
  path: '/api/storage/bulk/delete',
  tags: ['Bulk Operations'],
  summary: 'Bulk delete entries',
  middleware: [requireAuth] as any,
  request: {
    body: {
      content: {
        'application/json': {
          schema: BulkDeleteRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Entries deleted',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// GET /api/public/share
const publicShareRoute = createRoute({
  method: 'get',
  path: '/api/public/share',
  tags: ['Public'],
  summary: 'Access shared entry publicly',
  request: {
    query: PublicShareQuerySchema,
  },
  responses: {
    200: {
      description: 'Shared entry or file',
      content: {
        'application/json': {
          schema: EntryResponseSchema,
        },
        'application/octet-stream': {
          schema: z.string().openapi({ format: 'binary' }),
        },
      },
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export function registerBulkRoutes(app: AppType) {
  // POST /api/storage/bulk/download
  app.openapi(bulkDownloadRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    try {
      const { entry_ids } = c.req.valid('json');

      const zip = new JSZip();
      const values: Record<string, string> = {};

      for (const id of entry_ids) {
        const entry = await getEntryById(c.env, id);
        if (!entry) continue;
        if (entry.user_id !== user.id && !isUserAdmin(user)) continue;

        if (entry.blob_value) {
          zip.file(entry.key, entry.blob_value as any);
        } else if (entry.string_value !== null) {
          values[entry.key] = entry.string_value;
        }
      }

      if (Object.keys(values).length > 0) {
        zip.file('values.json', JSON.stringify(values, null, 2));
      }

      const content = await zip.generateAsync({ type: 'blob' });
      return new Response(content as any, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="download.zip"`,
        },
      });
    } catch (e) {
      return c.json({ error: 'SERVER_ERROR', message: String(e) }, 500);
    }
  });

  // POST /api/storage/bulk/export
  app.openapi(bulkExportRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    try {
      const { entry_ids } = c.req.valid('json');

      const contents: any[] = [];
      const baseUrl = new URL(c.req.url).origin;

      for (const id of entry_ids) {
        const entry = await getEntryById(c.env, id);
        if (!entry) continue;
        if (entry.user_id !== user.id && !isUserAdmin(user)) continue;

        if (entry.blob_value) {
          contents.push({
            key: entry.key,
            type: 'file',
            mime_type: entry.type,
            url: `${baseUrl}/api/public/share?key=${encodeURIComponent(entry.key)}&secret=${entry.hash}`,
          });
        } else {
          contents.push({
            key: entry.key,
            type: 'value',
            value: entry.string_value,
          });
        }
      }

      return c.json({ contents });
    } catch (e) {
      return c.json({ error: 'SERVER_ERROR', message: String(e) }, 500);
    }
  });

  // POST /api/storage/bulk/delete
  app.openapi(bulkDeleteRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    try {
      const { entry_ids } = c.req.valid('json');

      for (const id of entry_ids) {
        const entry = await getEntryById(c.env, id);
        if (!entry) continue;
        if (entry.user_id !== user.id && !isUserAdmin(user)) continue;

        await deleteEntry(c.env, id);
      }

      return c.json({ message: 'Entries deleted successfully' });
    } catch (e) {
      return c.json({ error: 'SERVER_ERROR', message: String(e) }, 500);
    }
  });
}

export function registerPublicRoutes(app: AppType) {
  // GET /api/public/share
  app.openapi(publicShareRoute, async (c) => {
    const { key, secret, raw, download } = c.req.valid('query');

    const entry = await getEntryByKeySecret(c.env, key, secret);
    if (!entry) {
      return c.json({ error: 'NOT_FOUND', message: 'Entry not found' }, 404);
    }

    if (raw || download) {
      if (entry.blob_value) {
        const headers: Record<string, string> = {
          'Content-Type': entry.type,
        };
        if (download && entry.filename) {
          headers['Content-Disposition'] = `attachment; filename="${entry.filename}"`;
        }
        return new Response(entry.blob_value as any, { headers });
      } else if (entry.string_value) {
        return new Response(entry.string_value, {
          headers: { 'Content-Type': entry.type || 'text/plain' },
        });
      }
    }

    const { entryToResponse } = await import('../storage');
    return c.json(entryToResponse(entry));
  });

}
