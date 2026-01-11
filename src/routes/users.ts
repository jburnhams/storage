import { createRoute } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '../types';
import type { SessionContext } from '../middleware';
import { requireAuth, requireAdmin } from '../middleware';
import {
  getUserById,
  getUserByEmail,
  getAllUsers,
  getAllSessions,
  promoteUserToAdmin,
  updateUser,
  deleteUser,
  createUser,
  userToResponse,
} from '../session';
import {
  UserResponseSchema,
  SessionResponseSchema,
  UserListResponseSchema,
  SessionListResponseSchema,
  PromoteAdminRequestSchema,
  UpdateUserRequestSchema,
  CreateUserRequestSchema,
  IdParamSchema,
  ErrorResponseSchema,
} from '../schemas';
import { z } from 'zod';

type AppType = OpenAPIHono<{
  Bindings: Env;
  Variables: { session?: SessionContext };
}>;

// GET /api/session
const getSessionRoute = createRoute({
  method: 'get',
  path: '/api/session',
  tags: ['Session'],
  summary: 'Get current session info',
  middleware: [requireAuth] as any,
  responses: {
    200: {
      description: 'Current session',
      content: {
        'application/json': {
          schema: SessionResponseSchema,
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

// GET /api/user
const getUserRoute = createRoute({
  method: 'get',
  path: '/api/user',
  tags: ['Users'],
  summary: 'Get authenticated user',
  middleware: [requireAuth] as any,
  responses: {
    200: {
      description: 'Current user',
      content: {
        'application/json': {
          schema: UserResponseSchema,
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

// GET /api/users (admin)
const listUsersRoute = createRoute({
  method: 'get',
  path: '/api/users',
  tags: ['Admin'],
  summary: 'List all users (admin only)',
  middleware: [requireAuth, requireAdmin] as any,
  responses: {
    200: {
      description: 'List of users',
      content: {
        'application/json': {
          schema: UserListResponseSchema,
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

// GET /api/sessions (admin)
const listSessionsRoute = createRoute({
  method: 'get',
  path: '/api/sessions',
  tags: ['Admin'],
  summary: 'List all sessions (admin only)',
  middleware: [requireAuth, requireAdmin] as any,
  responses: {
    200: {
      description: 'List of sessions',
      content: {
        'application/json': {
          schema: SessionListResponseSchema,
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

// POST /api/admin/promote (admin)
const promoteAdminRoute = createRoute({
  method: 'post',
  path: '/api/admin/promote',
  tags: ['Admin'],
  summary: 'Promote user to admin (admin only)',
  middleware: [requireAuth, requireAdmin] as any,
  request: {
    body: {
      content: {
        'application/json': {
          schema: PromoteAdminRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User promoted',
      content: {
        'application/json': {
          schema: UserResponseSchema,
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
      description: 'Not Found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/users (admin)
const createUserRoute = createRoute({
  method: 'post',
  path: '/api/users',
  tags: ['Admin'],
  summary: 'Create a new user (admin only)',
  middleware: [requireAuth, requireAdmin] as any,
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateUserRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User created',
      content: {
        'application/json': {
          schema: UserResponseSchema,
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
  },
});

// PUT /api/users/:id (admin)
const updateUserRoute = createRoute({
  method: 'put',
  path: '/api/users/{id}',
  tags: ['Admin'],
  summary: 'Update user (admin only)',
  middleware: [requireAuth, requireAdmin] as any,
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateUserRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User updated',
      content: {
        'application/json': {
          schema: UserResponseSchema,
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
      description: 'Not Found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// DELETE /api/users/:id (admin)
const deleteUserRoute = createRoute({
  method: 'delete',
  path: '/api/users/{id}',
  tags: ['Admin'],
  summary: 'Delete user (admin only)',
  middleware: [requireAuth, requireAdmin] as any,
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'User deleted',
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

export function registerUserRoutes(app: AppType) {
  // GET /api/session
  app.openapi(getSessionRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);

    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    return c.json({
      id: session.session_id,
      user_id: session.user_id,
      created_at: '',
      expires_at: '',
      last_used_at: '',
      user: userToResponse(user),
    });
  });

  // GET /api/user
  app.openapi(getUserRoute, async (c) => {
    const session = c.get('session')!;
    const user = await getUserById(session.user_id, c.env);

    if (!user) {
      return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
    }

    return c.json(userToResponse(user));
  });

  // GET /api/users
  app.openapi(listUsersRoute, async (c) => {
    const users = await getAllUsers(c.env);
    return c.json(users.map(userToResponse));
  });

  // GET /api/sessions
  app.openapi(listSessionsRoute, async (c) => {
    const sessions = await getAllSessions(c.env);
    return c.json(sessions);
  });

  // POST /api/admin/promote
  app.openapi(promoteAdminRoute, async (c) => {
    const { email } = c.req.valid('json');

    try {
      await promoteUserToAdmin(email, c.env);

      // Fetch the updated user to return
      const user = await getUserByEmail(email, c.env);
      if (!user) {
        return c.json(
          {
            error: 'NOT_FOUND',
            message: 'User not found after promotion',
          },
          404
        );
      }

      return c.json(userToResponse(user), 200);
    } catch (error) {
      return c.json(
        {
          error: 'NOT_FOUND',
          message: error instanceof Error ? error.message : 'User not found',
        },
        404
      );
    }
  });

  // POST /api/users
  app.openapi(createUserRoute, async (c) => {
    const body = c.req.valid('json');
    try {
      const user = await createUser(body, c.env);
      return c.json(userToResponse(user), 201);
    } catch (error) {
      return c.json(
        {
          error: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to create user',
        },
        400
      );
    }
  });

  // PUT /api/users/:id
  app.openapi(updateUserRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      const user = await updateUser(id, body, c.env);
      if (!user) {
        return c.json({ error: 'NOT_FOUND', message: 'User not found' }, 404);
      }
      return c.json(userToResponse(user));
    } catch (error) {
      return c.json(
        {
          error: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to update user',
        },
        400
      );
    }
  });

  // DELETE /api/users/:id
  app.openapi(deleteUserRoute, async (c) => {
    const { id } = c.req.valid('param');
    await deleteUser(id, c.env);
    return c.json({ success: true });
  });

  // Handle unsupported methods for /api/admin/promote
  app.get('/api/admin/promote', (c) => {
    return c.json({ error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }, 405);
  });
}
