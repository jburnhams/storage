import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '../types';
import type { SessionContext } from '../middleware';
import { requireAuth } from '../middleware';
import {
  createEntry,
  getEntryById,
  updateEntry,
  deleteEntry,
  listEntries,
  entryToResponse,
} from '../storage';
import { getUserById } from '../session';
import {
  EntryResponseSchema,
  EntryListResponseSchema,
  ListEntriesQuerySchema,
  GetEntryQuerySchema,
  IdParamSchema,
  ErrorResponseSchema,
} from '../schemas';

type AppType = OpenAPIHono<{
  Bindings: Env;
  Variables: { session?: SessionContext };
}>;

// GET /api/storage/entries
const listEntriesRoute = createRoute({
  method: 'get',
  path: '/api/storage/entries',
  tags: ['Storage'],
  summary: 'List storage entries',
  middleware: [requireAuth] as any,
  request: {
    query: ListEntriesQuerySchema,
  },
  responses: {
    200: {
      description: 'List of entries',
      content: {
        'application/json': {
          schema: EntryListResponseSchema,
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

// POST /api/storage/entry
const createEntryRoute = createRoute({
  method: 'post',
  path: '/api/storage/entry',
  tags: ['Storage'],
  summary: 'Create a new entry (multipart/form-data)',
  description: 'Upload a file or string value. FormData fields: key (required), type (required), string_value (optional), file (optional File), collection_id (optional number), metadata (optional string)',
  middleware: [requireAuth] as any,
  responses: {
    200: {
      description: 'Entry created',
      content: {
        'application/json': {
          schema: EntryResponseSchema,
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

// GET /api/storage/entry/:id
const getEntryRoute = createRoute({
  method: 'get',
  path: '/api/storage/entry/{id}',
  tags: ['Storage'],
  summary: 'Get an entry by ID',
  middleware: [requireAuth] as any,
  request: {
    params: IdParamSchema,
    query: GetEntryQuerySchema,
  },
  responses: {
    200: {
      description: 'Entry details or blob download',
      content: {
        'application/json': {
          schema: EntryResponseSchema,
        },
        'application/octet-stream': {
          schema: z.instanceof(Blob),
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
    403: {
      description: 'Forbidden',
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

// PUT /api/storage/entry/:id
const updateEntryRoute = createRoute({
  method: 'put',
  path: '/api/storage/entry/{id}',
  tags: ['Storage'],
  summary: 'Update an entry (multipart/form-data)',
  description: 'Update an existing entry. FormData fields: key (optional), type (required), string_value (optional), file (optional File), collection_id (optional number), metadata (optional string)',
  middleware: [requireAuth] as any,
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Entry updated',
      content: {
        'application/json': {
          schema: EntryResponseSchema,
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
    403: {
      description: 'Forbidden',
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

// DELETE /api/storage/entry/:id
const deleteEntryRoute = createRoute({
  method: 'delete',
  path: '/api/storage/entry/{id}',
  tags: ['Storage'],
  summary: 'Delete an entry',
  middleware: [requireAuth] as any,
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Entry deleted',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
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
    403: {
      description: 'Forbidden',
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

export function registerEntryRoutes(app: AppType) {
  // GET /api/storage/entries
  app.openapi(listEntriesRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    const query = c.req.valid('query');
    const entries = await listEntries(
      c.env,
      user,
      query.prefix,
      query.search,
      query.collection_id ?? null,
      false // includeCollections - not in schema yet
    );

    return c.json(entries.map(entryToResponse));
  });

  // POST /api/storage/entry
  app.openapi(createEntryRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    try {
      const formData = await c.req.formData();
      const key = formData.get('key') as string;
      const type = formData.get('type') as string;
      const stringValue = formData.get('string_value') as string | null;
      const file = formData.get('file') as File | null;
      const collectionIdStr = formData.get('collection_id') as string | null;
      const metadata = formData.get('metadata') as string | null;

      if (!key || !type) {
        return c.json({ error: 'INVALID_REQUEST', message: 'Key and Type are required' }, 400);
      }

      let collectionId: number | null = null;
      if (collectionIdStr) {
        collectionId = parseInt(collectionIdStr, 10);
        if (isNaN(collectionId)) {
          return c.json({ error: 'INVALID_REQUEST', message: 'Invalid Collection ID' }, 400);
        }
      }

      let blobValue: ArrayBuffer | null = null;
      let filename: string | undefined = undefined;

      if (file) {
        if (typeof file === 'string') {
          // Workaround for Miniflare/workerd integration tests
          const str = file as string;
          const buf = new Uint8Array(str.length);
          for (let i = 0; i < str.length; i++) {
            buf[i] = str.charCodeAt(i);
          }
          blobValue = buf.buffer;
          filename = undefined;
        } else if (typeof file.arrayBuffer === 'function') {
          blobValue = await file.arrayBuffer();
          filename = file.name;
        } else {
          blobValue = await new Response(file as any).arrayBuffer();
          filename = (file as any).name;
        }
      }

      // Origin tracking
      const origin = c.req.header('Origin');

      const entry = await createEntry(
        c.env,
        user.id,
        key,
        type,
        stringValue,
        blobValue,
        filename,
        collectionId,
        metadata,
        origin || null
      );

      return c.json(entryToResponse(entry));
    } catch (e) {
      console.error('Create error:', e);
      return c.json({ error: 'SERVER_ERROR', message: String(e) }, 500);
    }
  });

  // GET /api/storage/entry/:id
  app.openapi(getEntryRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    const { id } = c.req.valid('param');
    const query = c.req.valid('query');

    const entry = await getEntryById(c.env, id);
    if (!entry) {
      return c.json({ error: 'NOT_FOUND', message: 'Entry not found' }, 404);
    }

    // Access Control
    if (!user.is_admin && entry.user_id !== user.id) {
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    // If download param is present, serve blob if exists
    if (query.download && entry.blob_value) {
      const headers: Record<string, string> = {
        'Content-Type': entry.type,
      };
      if (entry.filename) {
        headers['Content-Disposition'] = `attachment; filename="${entry.filename}"`;
      }
      return new Response(entry.blob_value as any, { headers });
    }

    return c.json(entryToResponse(entry));
  });

  // PUT /api/storage/entry/:id
  app.openapi(updateEntryRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    const { id } = c.req.valid('param');

    const existing = await getEntryById(c.env, id);
    if (!existing) {
      return c.json({ error: 'NOT_FOUND', message: 'Entry not found' }, 404);
    }

    if (!user.is_admin && existing.user_id !== user.id) {
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    try {
      const formData = await c.req.formData();
      const key = formData.get('key') as string;
      const type = formData.get('type') as string;
      const stringValue = formData.get('string_value') as string | null;
      const file = formData.get('file') as File | null;
      const collectionIdStr = formData.get('collection_id') as string | null;
      const metadata = formData.get('metadata') as string | null;

      if (!type) {
        return c.json({ error: 'INVALID_REQUEST', message: 'Type is required' }, 400);
      }

      const targetKey = key || existing.key;

      let collectionId: number | null | undefined = undefined;
      if (formData.has('collection_id')) {
        if (!collectionIdStr || collectionIdStr === 'null' || collectionIdStr === '') {
          collectionId = null;
        } else {
          collectionId = parseInt(collectionIdStr, 10);
          if (isNaN(collectionId)) {
            return c.json({ error: 'INVALID_REQUEST', message: 'Invalid Collection ID' }, 400);
          }
        }
      }

      let blobValue: ArrayBuffer | null = null;
      let filename: string | undefined = undefined;
      let finalStringValue = stringValue;

      if (file) {
        if (typeof file === 'string') {
          const str = file as string;
          const buf = new Uint8Array(str.length);
          for (let i = 0; i < str.length; i++) {
            buf[i] = str.charCodeAt(i);
          }
          blobValue = buf.buffer;
          filename = undefined;
        } else if (typeof file.arrayBuffer === 'function') {
          blobValue = await file.arrayBuffer();
          filename = file.name;
        } else {
          blobValue = await new Response(file as any).arrayBuffer();
          filename = (file as any).name;
        }
        finalStringValue = null;
      } else {
        if (stringValue === null) {
          finalStringValue = null;
          blobValue = null;
        } else if (stringValue === '' && existing.blob_value) {
          finalStringValue = null;
          blobValue = null;
        }
      }

      const entry = await updateEntry(
        c.env,
        id,
        targetKey,
        finalStringValue || null,
        blobValue,
        type,
        filename,
        collectionId,
        metadata
      );

      if (!entry) {
        return c.json({ error: 'UPDATE_FAILED', message: 'Update failed' }, 500);
      }

      return c.json(entryToResponse(entry));
    } catch (e) {
      console.error('Update error:', e);
      return c.json({ error: 'SERVER_ERROR', message: String(e) }, 500);
    }
  });

  // DELETE /api/storage/entry/:id
  app.openapi(deleteEntryRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    const { id } = c.req.valid('param');

    const existing = await getEntryById(c.env, id);
    if (!existing) {
      return c.json({ error: 'NOT_FOUND', message: 'Entry not found' }, 404);
    }

    if (!user.is_admin && existing.user_id !== user.id) {
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    await deleteEntry(c.env, id);
    return c.json({ message: 'Entry deleted successfully' });
  });
}
