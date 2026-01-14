import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env, User } from '../types';
import type { SessionContext } from '../middleware';
import { requireAuth, requireStandard, attemptAuth } from '../middleware';
import {
  createCollection,
  getCollection,
  listCollections,
  updateCollection,
  deleteCollection,
  listEntries,
  getEntryById,
} from '../storage';
import { getUserById, isUserAdmin } from '../session';
import { checkAccess, canView, canEdit, canDelete } from '../permissions';
import JSZip from 'jszip';
import {
  CollectionResponseSchema,
  CollectionWithContentsResponseSchema,
  CollectionListResponseSchema,
  CreateCollectionRequestSchema,
  UpdateCollectionRequestSchema,
  IdParamSchema,
  ErrorResponseSchema,
  GetCollectionQuerySchema,
} from '../schemas';
import { SIMPLE_TYPES } from '../utils/validation';

type AppType = OpenAPIHono<{
  Bindings: Env;
  Variables: { session?: SessionContext };
}>;

// GET /api/collections
const listCollectionsRoute = createRoute({
  method: 'get',
  path: '/api/collections',
  tags: ['Collections'],
  summary: 'List all collections',
  middleware: [requireAuth] as any,
  responses: {
    200: {
      description: 'List of collections',
      content: {
        'application/json': {
          schema: CollectionListResponseSchema,
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

// POST /api/collections
const createCollectionRoute = createRoute({
  method: 'post',
  path: '/api/collections',
  tags: ['Collections'],
  summary: 'Create a new collection',
  middleware: [requireAuth, requireStandard] as any,
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCollectionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Collection created',
      content: {
        'application/json': {
          schema: CollectionResponseSchema,
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

// GET /api/collections/:id
const getCollectionRoute = createRoute({
  method: 'get',
  path: '/api/collections/{id}',
  tags: ['Collections'],
  summary: 'Get a collection by ID',
  middleware: [attemptAuth] as any,
  request: {
    params: IdParamSchema,
    query: GetCollectionQuerySchema,
  },
  responses: {
    200: {
      description: 'Collection details',
      content: {
        'application/json': {
          schema: CollectionWithContentsResponseSchema,
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

// PUT /api/collections/:id
const updateCollectionRoute = createRoute({
  method: 'put',
  path: '/api/collections/{id}',
  tags: ['Collections'],
  summary: 'Update a collection',
  middleware: [requireAuth, requireStandard] as any,
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateCollectionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Collection updated',
      content: {
        'application/json': {
          schema: CollectionResponseSchema,
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

// DELETE /api/collections/:id
const deleteCollectionRoute = createRoute({
  method: 'delete',
  path: '/api/collections/{id}',
  tags: ['Collections'],
  summary: 'Delete a collection',
  middleware: [requireAuth, requireStandard] as any,
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'Collection deleted',
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

// POST /api/collections/:id/upload
const uploadCollectionZipRoute = createRoute({
  method: 'post',
  path: '/api/collections/{id}/upload',
  tags: ['Collections'],
  summary: 'Upload ZIP to collection (multipart/form-data)',
  description: 'Upload a ZIP file to extract into the collection. FormData field: file (required ZIP file)',
  middleware: [requireAuth, requireStandard] as any,
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'ZIP uploaded successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            count: z.number(),
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

// GET /api/collections/:id/download
const downloadCollectionZipRoute = createRoute({
  method: 'get',
  path: '/api/collections/{id}/download',
  tags: ['Collections'],
  summary: 'Download collection as ZIP',
  middleware: [requireAuth] as any,
  request: {
    params: IdParamSchema,
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


export function registerCollectionRoutes(app: AppType) {
  // GET /api/collections
  app.openapi(listCollectionsRoute, async (c) => {
    const session = c.get('session')!;
    const collections = await listCollections(c.env, session.user_id);
    return c.json(collections);
  });

  // POST /api/collections
  app.openapi(createCollectionRoute, async (c) => {
    const session = c.get('session')!;
    const body = c.req.valid('json');
    const origin = c.req.header('Origin');

    const collection = await createCollection(
      c.env,
      session.user_id,
      body.name,
      body.description,
      body.metadata,
      origin || null
    );
    return c.json(collection);
  });

  // GET /api/collections/:id
  app.openapi(getCollectionRoute, async (c) => {
    const session = c.get('session');
    const { id } = c.req.valid('param');
    const { secret } = c.req.valid('query');

    const collection = await getCollection(c.env, id);
    if (!collection) {
      return c.json({ error: 'NOT_FOUND', message: 'Collection not found' }, 404);
    }

    let isAuthorized = false;
    let viewingUser: User | null = null;

    // Check session auth
    if (session) {
      const user = await getUserById(session.user_id, c.env);
      if (user) {
        viewingUser = user;
        const level = await checkAccess(c.env, user, 'collection', id);
        if (canView(level)) {
            isAuthorized = true;
        }
      }
    }

    // Check secret bypass
    if (!isAuthorized && secret && secret === collection.secret) {
      isAuthorized = true;
      // We can create a mock user object representing the owner of the collection for listing purposes,
      // since we are authorized to see this collection's content.
      viewingUser = { id: collection.user_id, user_type: 'STANDARD' } as User;
    }

    if (!isAuthorized) {
      if (!session) {
        return c.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
      }
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    const entries = await listEntries(c.env, viewingUser!, undefined, undefined, id);
    const contents: any[] = [];
    const baseUrl = new URL(c.req.url).origin;

    for (const entryMeta of entries) {
      const entry = await getEntryById(c.env, entryMeta.id);
      if (!entry) continue;

      if (entry.blob_value) {
        contents.push({
          key: entry.key,
          type: 'file',
          mime_type: entry.type,
          url: `${baseUrl}/api/public/share?key=${encodeURIComponent(entry.key)}&secret=${entry.hash}`,
        });
      } else if (SIMPLE_TYPES.includes(entry.type) || entry.type === 'application/json') {
        let parsedValue: any = entry.string_value;
        if (entry.string_value !== null) {
          if (entry.type === 'application/json') {
            try {
              parsedValue = JSON.parse(entry.string_value);
            } catch (e) {
              parsedValue = entry.string_value; // Fallback
            }
          } else if (entry.type === 'boolean') {
            parsedValue = entry.string_value === 'true';
          } else if (entry.type === 'integer' || entry.type === 'float') {
            parsedValue = Number(entry.string_value);
          }
        }

        contents.push({
          key: entry.key,
          type: 'json',
          value: parsedValue,
        });
      } else {
        contents.push({
          key: entry.key,
          type: 'value',
          value: entry.string_value,
        });
      }
    }

    return c.json({
      ...collection,
      contents,
    });
  });

  // PUT /api/collections/:id
  app.openapi(updateCollectionRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    const collection = await getCollection(c.env, id);
    if (!collection) {
      return c.json({ error: 'NOT_FOUND', message: 'Collection not found' }, 404);
    }

    const level = await checkAccess(c.env, user, 'collection', id);
    if (!canEdit(level)) {
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    const updated = await updateCollection(c.env, id, body.name, body.description, body.metadata);
    return c.json(updated);
  });

  // DELETE /api/collections/:id
  app.openapi(deleteCollectionRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    const { id } = c.req.valid('param');

    const collection = await getCollection(c.env, id);
    if (!collection) {
      return c.json({ error: 'NOT_FOUND', message: 'Collection not found' }, 404);
    }

    const level = await checkAccess(c.env, user, 'collection', id);
    if (!canDelete(level)) {
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    await deleteCollection(c.env, id);
    return c.json({ message: 'Collection deleted successfully' });
  });

  // POST /api/collections/:id/upload
  app.openapi(uploadCollectionZipRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    const { id } = c.req.valid('param');

    const collection = await getCollection(c.env, id);
    if (!collection) {
      return c.json({ error: 'NOT_FOUND', message: 'Collection not found' }, 404);
    }

    const level = await checkAccess(c.env, user, 'collection', id);
    if (!canEdit(level)) {
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return c.json({ error: 'INVALID_REQUEST', message: 'No file uploaded' }, 400);
    }

    // Handle different File object types from various JavaScript environments
    let arrayBuffer: ArrayBuffer;
    if (typeof file === 'string') {
      // Binary data as string (Miniflare/workerd FormData parser quirk)
      const str = file as string;
      const buf = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
      arrayBuffer = buf.buffer;
    } else if (file instanceof ArrayBuffer) {
      arrayBuffer = file;
    } else if (file instanceof Uint8Array) {
      arrayBuffer = file.buffer;
    } else if (typeof file.arrayBuffer === 'function') {
      arrayBuffer = await file.arrayBuffer();
    } else {
      arrayBuffer = await new Response(file as any).arrayBuffer();
    }

    try {
      const { createEntry } = await import('../storage');
      const zip = await JSZip.loadAsync(arrayBuffer);
      const promises: Promise<any>[] = [];

      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;

        const promise = (async () => {
          const content = await zipEntry.async('arraybuffer');
          const isText = relativePath.endsWith('.txt') || relativePath.endsWith('.json');
          const mimeType = isText ? 'text/plain' : 'application/octet-stream';

          await createEntry(
            c.env,
            user.id,
            relativePath,
            mimeType,
            null,
            content,
            relativePath.split('/').pop(),
            id,
            null,
            null
          );
        })();

        promises.push(promise);
      });

      await Promise.all(promises);
      return c.json({ message: 'ZIP uploaded successfully', count: promises.length });
    } catch (e) {
      console.error('ZIP upload error:', e);
      return c.json({ error: 'SERVER_ERROR', message: String(e) }, 500);
    }
  });

  // GET /api/collections/:id/download
  app.openapi(downloadCollectionZipRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    const { id } = c.req.valid('param');

    const collection = await getCollection(c.env, id);
    if (!collection) {
      return c.json({ error: 'NOT_FOUND', message: 'Collection not found' }, 404);
    }

    if (collection.user_id !== user.id && !isUserAdmin(user)) {
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    try {
      const entries = await listEntries(c.env, user, undefined, undefined, id);
      const zip = new JSZip();
      const values: Record<string, string> = {};

      for (const entryMeta of entries) {
        const entry = await getEntryById(c.env, entryMeta.id);
        if (!entry) continue;

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
          'Content-Disposition': `attachment; filename="${collection.name}.zip"`,
        },
      });
    } catch (e) {
      console.error('Zip generation error', e);
      return c.json({ error: 'SERVER_ERROR', message: String(e) }, 500);
    }
  });

}
