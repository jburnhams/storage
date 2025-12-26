import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '../types';
import type { SessionContext } from '../middleware';
import { requireAuth } from '../middleware';
import {
  createEntry,
  getEntryById,
  updateEntry,
  entryToResponse,
  getEntryInCollection,
} from '../storage';
import { getUserById } from '../session';
import {
  EntryResponseSchema,
  ErrorResponseSchema,
  IdParamSchema,
} from '../schemas';
import {
  CreateEntryJsonRequestSchema,
  BulkCreateEntryJsonRequestSchema,
  UpdateEntryJsonRequestSchema,
  type CreateEntryJsonRequest
} from '../json_schemas';
import { validateEntryValue } from '../utils/validation';

type AppType = OpenAPIHono<{
  Bindings: Env;
  Variables: { session?: SessionContext };
}>;

// POST /api/storage/entry/json
const createEntryJsonRoute = createRoute({
  method: 'post',
  path: '/api/storage/entry/json',
  tags: ['Storage'],
  summary: 'Create or update an entry or multiple entries (JSON)',
  description: 'Create or update entries using JSON payload. Accepts a single object or an array of objects. If an entry with the same key exists in the specified collection, it will be overwritten. Use "blob_value" for base64 encoded binary data.',
  middleware: [requireAuth] as any,
  request: {
    body: {
      content: {
        'application/json': {
          schema: BulkCreateEntryJsonRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Entry created or updated. Returns single object if input was object, or array if input was array.',
      content: {
        'application/json': {
          schema: z.union([EntryResponseSchema, z.array(EntryResponseSchema)]),
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

// PUT /api/storage/entry/:id/json
const updateEntryJsonRoute = createRoute({
  method: 'put',
  path: '/api/storage/entry/{id}/json',
  tags: ['Storage'],
  summary: 'Update an entry (JSON)',
  description: 'Update an entry using JSON payload. Use "blob_value" for base64 encoded binary data.',
  middleware: [requireAuth] as any,
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateEntryJsonRequestSchema,
        },
      },
    },
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

export function registerEntryJsonRoutes(app: AppType) {
  // POST /api/storage/entry/json
  app.openapi(createEntryJsonRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    try {
      const payload = c.req.valid('json');
      const origin = c.req.header('Origin');

      // Helper function to process a single entry
      const processEntry = async (item: CreateEntryJsonRequest) => {
          let blobValue: ArrayBuffer | null = null;
          if (item.blob_value) {
            try {
              // Decode base64
              const binaryString = atob(item.blob_value);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              blobValue = bytes.buffer;
            } catch (e) {
              throw new Error('Invalid base64 string in blob_value');
            }
          }

          // Validate string value
          if (item.string_value && !blobValue) {
            const error = validateEntryValue(item.type, item.string_value);
            if (error) {
               throw new Error(error);
            }
          }

          // Check for existing entry to overwrite if in a collection
          if (item.collection_id !== undefined && item.collection_id !== null) {
            const existing = await getEntryInCollection(c.env, item.key, item.collection_id);
            if (existing) {
                 // Check permission to update existing entry
                 if (!user.is_admin && existing.user_id !== user.id) {
                   throw new Error('Access denied');
                 }

                 const updated = await updateEntry(
                    c.env,
                    existing.id,
                    item.key,
                    item.string_value ?? null,
                    blobValue,
                    item.type,
                    item.filename,
                    item.collection_id,
                    item.metadata
                  );

                  if (!updated) {
                    throw new Error('Update failed');
                  }
                  return entryToResponse(updated);
            }
          }

          const entry = await createEntry(
            c.env,
            user.id,
            item.key,
            item.type,
            item.string_value ?? null,
            blobValue,
            item.filename,
            item.collection_id ?? null,
            item.metadata,
            origin || null
          );
          return entryToResponse(entry);
      };

      if (Array.isArray(payload)) {
          // Bulk Mode
          // We process sequentially to avoid race conditions and simplify logic
          const results = [];
          for (const item of payload) {
              try {
                  const result = await processEntry(item);
                  results.push(result);
              } catch (e: any) {
                  // If one fails, currently we fail the whole request or return error?
                  // Schema says array of EntryResponse.
                  // Usually bulk APIs return array of { status: 'ok', data: ... } or fail completely.
                  // For simplicity and to match request/response schema symmetry, we will throw 500/400.
                  // This means it's an "All or Nothing" (conceptually, though not transactional unless we use transaction).
                  // Given D1 limitation on transactions across complex logic, we'll fail fast.
                  // However, previous operations might have succeeded.
                  // A better approach for this simplified API is to return error for that item?
                  // But schema is array of EntryResponseSchema.
                  // Let's fail fast for now.
                  console.error('Bulk processing error:', e);
                  if (e.message === 'Access denied') return c.json({ error: 'FORBIDDEN', message: e.message }, 403);
                  return c.json({ error: 'INVALID_REQUEST', message: e.message }, 400);
              }
          }
          return c.json(results);
      } else {
          // Single Mode
          try {
              const result = await processEntry(payload);
              return c.json(result);
          } catch (e: any) {
              console.error('Processing error:', e);
              if (e.message === 'Access denied') return c.json({ error: 'FORBIDDEN', message: e.message }, 403);
              return c.json({ error: 'INVALID_REQUEST', message: e.message }, 400);
          }
      }

    } catch (e) {
      console.error('Create JSON error:', e);
      return c.json({ error: 'SERVER_ERROR', message: String(e) }, 500);
    }
  });

  // PUT /api/storage/entry/:id/json
  app.openapi(updateEntryJsonRoute, async (c) => {
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
      const payload = c.req.valid('json');

      const targetKey = payload.key || existing.key;
      // Default to existing type if not provided. If provided, use it.
      // But updateEntry storage function requires type.
      const targetType = payload.type || existing.type;

      let blobValue: ArrayBuffer | null = null;
      let stringValue: string | null | undefined = payload.string_value;

      if (payload.blob_value) {
        try {
          const binaryString = atob(payload.blob_value);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          blobValue = bytes.buffer;
        } catch (e) {
          return c.json({ error: 'INVALID_REQUEST', message: 'Invalid base64 string in blob_value' }, 400);
        }
        stringValue = null; // Enforce exclusive
      } else if (payload.string_value !== undefined && payload.string_value !== null) {
          // If string value provided, blob must be null
          blobValue = null;
      } else {
          // Both missing/null in payload
          // If we are strictly updating metadata/key, we pass nulls to updateEntry?
          // updateEntry logic: if both null, we preserve content.
          blobValue = null;
          stringValue = null;
      }

      // Validate string value if we are updating it
      if (stringValue && !blobValue) {
          const error = validateEntryValue(targetType, stringValue);
          if (error) {
              return c.json({ error: 'INVALID_REQUEST', message: error }, 400);
          }
      }

      const entry = await updateEntry(
        c.env,
        id,
        targetKey,
        stringValue,
        blobValue,
        targetType,
        payload.filename,
        payload.collection_id, // can be null
        payload.metadata
      );

      if (!entry) {
        return c.json({ error: 'UPDATE_FAILED', message: 'Update failed' }, 500);
      }

      return c.json(entryToResponse(entry));
    } catch (e) {
      console.error('Update JSON error:', e);
      return c.json({ error: 'SERVER_ERROR', message: String(e) }, 500);
    }
  });
}
