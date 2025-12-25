import { createRoute } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '../types';
import type { SessionContext } from '../middleware';
import { requireAuth, requireAdmin } from '../middleware';
import {
  getUserById,
  getAllUsers,
  getAllSessions,
  promoteUserToAdmin,
  userToResponse,
} from '../session';
import {
  UserResponseSchema,
  SessionResponseSchema,
  UserListResponseSchema,
  SessionListResponseSchema,
  PromoteAdminRequestSchema,
  ErrorResponseSchema,
} from '../schemas';

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
    return c.json(
      sessions.map((s) => ({
        ...s,
        user: s.user ? userToResponse(s.user) : undefined,
      }))
    );
  });

  // POST /api/admin/promote
  app.openapi(promoteAdminRoute, async (c) => {
    const { email } = c.req.valid('json');

    try {
      const user = await promoteUserToAdmin(email, c.env);
      return c.json(userToResponse(user));
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
}
