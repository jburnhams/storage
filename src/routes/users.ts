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
    try {
      const contentType = c.req.header('content-type') || '';
      let body: any;
      let blob: ArrayBuffer | undefined = undefined;

      // Handle multipart manually within OpenAPI handler (bypassing validation for body if needed, or we rely on catch)
      // Actually, c.req.valid('json') will fail for multipart.
      // We must check Content-Type first.

      if (contentType.includes('multipart/form-data')) {
        const formData = await c.req.parseBody();
        const file = formData['profile_pic_blob'];

        body = {
          email: formData['email'],
          name: formData['name'],
          is_admin: formData['is_admin'] === 'true',
          profile_picture: formData['profile_picture'] ? String(formData['profile_picture']) : undefined,
        };

        if (file) {
          if (typeof file === 'string') {
             // Handle binary data passed as string (Miniflare/workerd quirk)
             if (file.includes(',') && /^[\d\s,]+$/.test(file)) {
                 const bytes = file.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                 blob = new Uint8Array(bytes).buffer;
             } else {
                 const buf = new Uint8Array(file.length);
                 for (let i = 0; i < file.length; i++) buf[i] = file.charCodeAt(i);
                 blob = buf.buffer;
             }
          } else if (file instanceof File) {
             blob = await file.arrayBuffer();
          } else if (typeof (file as any).arrayBuffer === 'function') {
             blob = await (file as any).arrayBuffer();
          }
        }
      } else {
        // Use validation for JSON
        body = c.req.valid('json');
      }

      // Manual validation fallback for multipart
      if (!body.email || !body.name) {
        return c.json({ error: 'BAD_REQUEST', message: 'Missing email or name' }, 400);
      }

      const user = await createUser({ ...body, profile_pic_blob: blob }, c.env);

      // If we uploaded a blob, update the profile_picture URL to point to it
      if (blob) {
         await updateUser(user.id, { profile_picture: `/api/users/${user.id}/avatar` }, c.env);
         user.profile_picture = `/api/users/${user.id}/avatar`;
      }

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

    try {
      const contentType = c.req.header('content-type') || '';
      let body: any;
      let blob: ArrayBuffer | undefined = undefined;

      if (contentType.includes('multipart/form-data')) {
        const formData = await c.req.parseBody();
        const file = formData['profile_pic_blob'];

        body = {
          name: formData['name'],
          email: formData['email'],
          is_admin: formData['is_admin'] === 'true', // check if string 'true'
          profile_picture: formData['profile_picture'] ? String(formData['profile_picture']) : undefined,
        };

        if (formData['is_admin'] === undefined) delete body.is_admin;
        if (formData['name'] === undefined) delete body.name;
        if (formData['email'] === undefined) delete body.email;

        if (file) {
          if (typeof file === 'string') {
             if (file.includes(',') && /^[\d\s,]+$/.test(file)) {
                 const bytes = file.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                 blob = new Uint8Array(bytes).buffer;
             } else {
                 const buf = new Uint8Array(file.length);
                 for (let i = 0; i < file.length; i++) buf[i] = file.charCodeAt(i);
                 blob = buf.buffer;
             }
          } else if (file instanceof File) {
             blob = await file.arrayBuffer();
          } else if (typeof (file as any).arrayBuffer === 'function') {
             blob = await (file as any).arrayBuffer();
          }

          if (blob) {
            body.profile_picture = `/api/users/${id}/avatar`;
          }
        }
      } else {
        body = c.req.valid('json');
      }

      const user = await updateUser(id, { ...body, profile_pic_blob: blob }, c.env);
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

  // GET /api/users/:id/avatar
  app.get('/api/users/:id/avatar', requireAuth, async (c) => {
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.text('Invalid ID', 400);

    const user = await getUserById(id, c.env);
    if (!user || !user.profile_pic_blob) {
      // Return 404 or a default avatar? 404 is cleaner.
      // Or redirect to profile_picture if it's a URL?
      if (user && user.profile_picture && !user.profile_picture.startsWith('/api/')) {
         return c.redirect(user.profile_picture);
      }
      return c.text('Not found', 404);
    }

    // Since we store as BLOB (ArrayBuffer in D1 types), we cast it
    // SQLite BLOBs come out as ArrayBuffer in Cloudflare D1
    const blob = user.profile_pic_blob as ArrayBuffer;

    return new Response(blob, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400', // Cache for 1 day
      },
    });
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
