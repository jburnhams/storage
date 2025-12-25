import { createRoute, z } from '@hono/zod-openapi';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '../types';
import type { SessionContext } from '../middleware';
import {
  generateState,
  encodeState,
  decodeState,
  getGoogleAuthUrl,
  exchangeCodeForToken,
  getGoogleUserInfo,
  getRedirectUri,
} from '../oauth';
import { getOrCreateUser, createSession } from '../session';
import { setSessionCookie, setStateCookie, getStateFromCookie, clearSessionCookie, clearStateCookie } from '../cookie';
import { AuthCallbackQuerySchema, AuthLoginQuerySchema, ErrorResponseSchema } from '../schemas';

type AppType = OpenAPIHono<{
  Bindings: Env;
  Variables: { session?: SessionContext };
}>;

// GET /auth/login
const loginRoute = createRoute({
  method: 'get',
  path: '/auth/login',
  tags: ['Authentication'],
  summary: 'Initiate Google OAuth login',
  request: {
    query: AuthLoginQuerySchema,
  },
  responses: {
    302: {
      description: 'Redirect to Google OAuth',
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// GET /auth/callback
const callbackRoute = createRoute({
  method: 'get',
  path: '/auth/callback',
  tags: ['Authentication'],
  summary: 'OAuth callback handler',
  request: {
    query: AuthCallbackQuerySchema,
  },
  responses: {
    302: {
      description: 'Redirect after successful authentication',
    },
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /auth/logout
const logoutRoute = createRoute({
  method: 'post',
  path: '/auth/logout',
  tags: ['Authentication'],
  summary: 'Logout and clear session',
  responses: {
    200: {
      description: 'Successfully logged out',
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
    },
  },
});

export function registerAuthRoutes(app: AppType) {
  // POST /auth/login
  app.openapi(loginRoute, async (c) => {
    const { redirect } = c.req.valid('query');
    const nonce = generateState();
    const state = encodeState(nonce, redirect);
    const redirectUri = getRedirectUri(c.req.raw);
    const authUrl = getGoogleAuthUrl(c.env.GOOGLE_CLIENT_ID, redirectUri, state);

    const response = Response.redirect(authUrl, 302);
    response.headers.set('Set-Cookie', setStateCookie(state, c.req.raw));

    return response;
  });

  // GET /auth/callback
  app.openapi(callbackRoute, async (c) => {
    const { code, state } = c.req.valid('query');

    // Verify state parameter
    const savedState = getStateFromCookie(c.req.raw);
    if (!savedState || savedState !== state) {
      return c.json({ error: 'invalid_state', message: 'State parameter mismatch' }, 400);
    }

    try {
      // Exchange code for tokens
      const redirectUri = getRedirectUri(c.req.raw);
      const tokens = await exchangeCodeForToken(
        code,
        c.env.GOOGLE_CLIENT_ID,
        c.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      // Fetch user info
      const userInfo = await getGoogleUserInfo(tokens.access_token);

      // Create or get user
      const user = await getOrCreateUser(c.env.DB, {
        email: userInfo.email,
        name: userInfo.name,
        profile_picture: userInfo.picture,
      });

      // Create session
      const sessionId = await createSession(c.env.DB, user.id);

      // Decode state to get redirect URL
      const { redirect } = decodeState(state);

      // Validate redirect URL
      let redirectUrl = '/';
      if (redirect) {
        try {
          const url = new URL(redirect, c.req.url);
          // Only allow same-origin redirects
          const requestUrl = new URL(c.req.url);
          if (url.origin === requestUrl.origin) {
            redirectUrl = url.pathname + url.search + url.hash;
          }
        } catch {
          // Invalid URL, use default
        }
      }

      // Set session cookie and redirect
      const response = Response.redirect(new URL(redirectUrl, c.req.url).toString(), 302);
      response.headers.set('Set-Cookie', setSessionCookie(sessionId, c.req.raw));
      // Also clear state cookie
      response.headers.append('Set-Cookie', clearStateCookie(c.req.raw));

      return response;
    } catch (error) {
      console.error('OAuth callback error:', error);
      return c.json(
        {
          error: 'oauth_error',
          message: error instanceof Error ? error.message : 'Authentication failed',
        },
        500
      );
    }
  });

  // POST /auth/logout
  app.openapi(logoutRoute, async (c) => {
    const response = c.json({ message: 'Logged out successfully' });
    response.headers.set('Set-Cookie', clearSessionCookie(c.req.raw));
    return response;
  });
}
