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
import { parseD1Blob } from '../utils/blob_quirks';
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

// GET /api/users/:id
const getUserDetailRoute = createRoute({
  method: 'get',
  path: '/api/users/{id}',
  tags: ['Users'],
  summary: 'Get user details (self or admin only)',
  middleware: [requireAuth] as any,
  request: {
    params: IdParamSchema,
  },
  responses: {
    200: {
      description: 'User details',
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

  // GET /api/users/:id
  app.openapi(getUserDetailRoute, async (c) => {
    const { id } = c.req.valid('param');
    const session = c.get('session')!;
    const requesterId = session.user_id;

    // Check permissions: requester must be the user or an admin
    if (requesterId !== id) {
      const requester = await getUserById(requesterId, c.env);
      const isAdmin = requester && (requester.user_type === 'ADMIN');

      if (!isAdmin) {
        return c.json({ error: 'FORBIDDEN', message: 'You are not allowed to access this user' }, 403);
      }
    }

    const user = await getUserById(id, c.env);
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
          user_type: formData['user_type'],
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
             const buf = await file.arrayBuffer();
             blob = parseD1Blob(buf) || buf;
          } else if (typeof (file as any).arrayBuffer === 'function') {
             const buf = await (file as any).arrayBuffer();
             blob = parseD1Blob(buf) || buf;
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
          user_type: formData['user_type'], // check if string 'true'
          profile_picture: formData['profile_picture'] ? String(formData['profile_picture']) : undefined,
        };

        if (formData['user_type'] === undefined) delete body.user_type;
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
             const buf = await file.arrayBuffer();
             blob = parseD1Blob(buf) || buf;
          } else if (typeof (file as any).arrayBuffer === 'function') {
             const buf = await (file as any).arrayBuffer();
             blob = parseD1Blob(buf) || buf;
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

    // Check if requester is GUEST, if so, they cannot trigger the cache update logic
    const session = c.get('session');
    let isGuest = false;
    if (session) {
      const requester = await getUserById(session.user_id, c.env);
      if (requester && requester.user_type === 'GUEST') {
        isGuest = true;
      }
    }

    const user = await getUserById(id, c.env);

    // 1. If blob exists, serve it
    if (user && user.profile_pic_blob) {
      // Since we store as BLOB (ArrayBuffer in D1 types), we cast it
      const blob = parseD1Blob(user.profile_pic_blob);

      if (blob) {
        return new Response(blob, {
          headers: {
            'Content-Type': 'image/jpeg', // We default to jpeg, though it might be png/gif.
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    }

    // 2. If no blob, try to fetch from profile_picture URL
    if (user && user.profile_picture && !user.profile_picture.startsWith('/api/')) {
      try {
        const fetchRes = await fetch(user.profile_picture, {
           redirect: 'follow',
           headers: {
             'User-Agent': 'Mozilla/5.0 (Compatible; Cloudflare-Worker-Avatar-Fetcher)'
           }
        });

        if (fetchRes.ok) {
           const contentType = fetchRes.headers.get('content-type');
           if (contentType && contentType.toLowerCase().startsWith('image/')) {
              const buffer = await fetchRes.arrayBuffer();

              // Store it for next time (ONLY if not GUEST, as guests cannot write)
              if (!isGuest) {
                  // Convert to array if needed for D1 compatibility in tests/environments
                  const blobToStore = buffer instanceof ArrayBuffer ? Array.from(new Uint8Array(buffer)) : buffer;
                  await updateUser(id, { profile_pic_blob: blobToStore as any }, c.env);
              }

              return new Response(buffer, {
                headers: {
                  'Content-Type': contentType,
                  'Cache-Control': 'public, max-age=86400',
                }
              });
           }
        }
      } catch (e) {
        console.error(`Failed to fetch avatar from ${user.profile_picture}:`, e);
      }

      // If fetch failed or not an image, fall back to redirecting?
      // The requirement says "store result in profile_pic_blob".
      // If we can't fetch it, we probably shouldn't redirect either if we want to be strict about "store it".
      // But preserving old behavior (redirect) as a fallback might be nice if fetch fails?
      // The prompt says: "if the user record doesn't have a profile_pic_blob then request the image from the url ... and store the result"
      // It implies we should serve the stored result.
      // If fetching fails, let's fall back to redirecting so the user still sees *something* if the client can reach it but backend can't.
      // But the test expects 404 if fetch fails (in my test plan).
      // Let's stick to 404 if we can't serve it as per typical backend logic, OR redirect if it's just a backend reachability issue?
      // The previous code redirected.
      // I'll stick to redirecting if backend fetch fails, OR 404 if URL is bad.
      // Actually, my test expects 404 for a bad URL. If I redirect to a bad URL, the client gets a 404 from the bad URL? No, the browser follows the redirect.
      // If I return a 302 to a 404 URL, the test `res.status` will be 302 (manual redirect handling in test) or 404 (if followed).
      // My test environment `worker.fetch` does NOT follow redirects automatically by default unless configured?
      // Wait, `worker.fetch` returns the response from the worker. If worker returns 302, `res.status` is 302.
      // So if I keep the redirect fallback, I need to update the test expectation or remove the fallback.
      // The prompt implies we want to *cache* it. If we fail to cache it, we should probably still try to show it?
      // However, for the specific requirement "request ... and store ...", if I can't request it, I can't store it.
      // Let's fallback to redirect to be safe for existing users whose URLs might be reachable by browser but not worker (e.g. strict firewalls).
      // But wait, the test failure showed "Expected 200, Received 302". This confirms the PREVIOUS code was redirecting.
      // So I should only Redirect if fetch fails.
    }

    // If we are here, we have no blob, and either no URL or fetch failed/was invalid.
    // If we have a URL and fetch failed, we *could* redirect.
    if (user && user.profile_picture && !user.profile_picture.startsWith('/api/')) {
       return c.redirect(user.profile_picture);
    }

    return c.text('Not found', 404);
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
