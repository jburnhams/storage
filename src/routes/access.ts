import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '../types';
import type { SessionContext } from '../middleware';
import { requireAuth } from '../middleware';
import { getUserById } from '../session';
import {
  IdParamSchema,
  ErrorResponseSchema,
  AccessListResponseSchema,
  GrantAccessRequestSchema,
  RevokeAccessRequestSchema,
  StorageAccessSchema,
} from '../schemas';
import {
  checkAccess,
  grantAccess,
  revokeAccess,
  listAccess,
  canManageAccess,
} from '../permissions';

type AppType = OpenAPIHono<{
  Bindings: Env;
  Variables: { session?: SessionContext };
}>;

// Generic helper for creating Access Routes
function createAccessRoutes(
  resourceType: 'collection' | 'entry',
  tag: string
) {
  const resourcePath = resourceType === 'collection' ? 'collection' : 'entry';
  const prefix = `/api/access/${resourcePath}/{id}`;

  // GET /api/access/:type/:id
  const listRoute = createRoute({
    method: 'get',
    path: prefix,
    tags: [tag],
    summary: `List access for ${resourceType}`,
    middleware: [requireAuth] as any,
    request: {
      params: IdParamSchema,
    },
    responses: {
      200: {
        description: 'List of users with access',
        content: {
          'application/json': {
            schema: AccessListResponseSchema,
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
        description: 'Not Found',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  });

  // POST /api/access/:type/:id
  const grantRoute = createRoute({
    method: 'post',
    path: prefix,
    tags: [tag],
    summary: `Grant access to ${resourceType}`,
    middleware: [requireAuth] as any,
    request: {
      params: IdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: GrantAccessRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Access granted',
        content: {
          'application/json': {
            schema: StorageAccessSchema,
          },
        },
      },
      400: {
        description: 'Bad Request',
        content: {
            'application/json': {
                schema: ErrorResponseSchema
            }
        }
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
    },
  });

  // DELETE /api/access/:type/:id
  const revokeRoute = createRoute({
    method: 'delete',
    path: prefix,
    tags: [tag],
    summary: `Revoke access from ${resourceType}`,
    middleware: [requireAuth] as any,
    request: {
      params: IdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: RevokeAccessRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Access revoked',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean() }),
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
    },
  });

  return { listRoute, grantRoute, revokeRoute };
}

export function registerAccessRoutes(app: AppType) {
  const collectionRoutes = createAccessRoutes('collection', 'Access');
  const entryRoutes = createAccessRoutes('entry', 'Access');

  const handleList = async (c: any, resourceType: 'collection' | 'entry') => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);

    const { id } = c.req.valid('param');

    const level = await checkAccess(c.env, user, resourceType, id);
    // Only ADMIN level (Owner/Admin) can list *who* has access.
    // Wait, maybe READONLY users can see who else has access?
    // User requirement: "Allow an owner or admin to grant access... pops up modal with table of users".
    // Implies mainly Owner/Admin uses this.
    // I'll restrict listing to those who can manage access.
    if (!canManageAccess(level)) {
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    const accessList = await listAccess(c.env, resourceType, id);
    return c.json(accessList);
  };

  const handleGrant = async (c: any, resourceType: 'collection' | 'entry') => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);

    const { id } = c.req.valid('param');
    const { user_id, access_level } = c.req.valid('json');

    const currentLevel = await checkAccess(c.env, user, resourceType, id);
    if (!canManageAccess(currentLevel)) {
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    // Check if target user exists
    const targetUser = await getUserById(user_id, c.env);
    if (!targetUser) {
        return c.json({ error: 'BAD_REQUEST', message: 'Target user not found'}, 400);
    }

    try {
      const result = await grantAccess(c.env, user_id, resourceType, id, access_level as any);
      return c.json(result);
    } catch (e) {
      return c.json({ error: 'SERVER_ERROR', message: String(e) }, 500);
    }
  };

  const handleRevoke = async (c: any, resourceType: 'collection' | 'entry') => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);
    if (!user) return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);

    const { id } = c.req.valid('param');
    const { user_id } = c.req.valid('json');

    const currentLevel = await checkAccess(c.env, user, resourceType, id);
    if (!canManageAccess(currentLevel)) {
      return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
    }

    await revokeAccess(c.env, user_id, resourceType, id);
    return c.json({ success: true });
  };

  // Collection Routes
  app.openapi(collectionRoutes.listRoute, (c) => handleList(c, 'collection'));
  app.openapi(collectionRoutes.grantRoute, (c) => handleGrant(c, 'collection'));
  app.openapi(collectionRoutes.revokeRoute, (c) => handleRevoke(c, 'collection'));

  // Entry Routes
  app.openapi(entryRoutes.listRoute, (c) => handleList(c, 'entry'));
  app.openapi(entryRoutes.grantRoute, (c) => handleGrant(c, 'entry'));
  app.openapi(entryRoutes.revokeRoute, (c) => handleRevoke(c, 'entry'));
}
