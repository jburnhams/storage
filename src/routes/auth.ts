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
import { loadSession } from '../middleware';

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

const ALLOWED_DOMAINS = [
  'jonathanburnhams.com',
  'jburnhams.workers.dev',
  'localhost',
  '127.0.0.1'
];

function isAllowedRedirect(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname;

    // Check if hostname is exactly one of the allowed domains
    // or a subdomain of an allowed domain
    return ALLOWED_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

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

    // Check if user is already logged in
    await loadSession(c);
    if (c.get('session')) {
      // User is already logged in, redirect to target or home
      let redirectUrl = '/';
      if (redirect) {
        // Basic validation to prevent javascript: or invalid URLs
        try {
          const url = new URL(redirect, c.req.url);
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            redirectUrl = redirect;
          }
        } catch {
          // Invalid URL, fallback to home
        }
      }

      return new Response(null, {
        status: 302,
        headers: {
          'Location': redirectUrl,
        },
      });
    }

    const nonce = generateState();
    const state = encodeState(nonce, redirect);
    const redirectUri = getRedirectUri(c.req.raw);
    const authUrl = getGoogleAuthUrl(c.env.GOOGLE_CLIENT_ID, redirectUri, state);

    return new Response(null, {
      status: 302,
      headers: {
        'Location': authUrl,
        'Set-Cookie': setStateCookie(state, c.req.raw),
      },
    });
  });

  // GET /auth/callback
  app.openapi(callbackRoute, async (c) => {
    const { code, state } = c.req.valid('query');

    // Verify state parameter
    const savedState = getStateFromCookie(c.req.raw);
    if (!savedState || savedState !== state) {
      return c.json({ error: 'INVALID_STATE', message: 'State parameter mismatch' }, 400);
    }

    try {
      // Exchange code for tokens
      const redirectUri = getRedirectUri(c.req.raw);
      const tokens = await exchangeCodeForToken(
        code,
        redirectUri,
        c.env
      );

      // Fetch user info
      const userInfo = await getGoogleUserInfo(tokens.access_token);

      // Create or get user
      const user = await getOrCreateUser(
        userInfo.email,
        userInfo.name,
        userInfo.picture,
        c.env
      );

      // Create session
      const session = await createSession(user.id, c.env);

      // Decode state to get redirect URL
      const { redirect } = decodeState(state);

      // Validate redirect URL
      let redirectUrl = '/';
      if (redirect) {
        try {
          // Resolve relative URLs against current origin
          const url = new URL(redirect, c.req.url);

          if (isAllowedRedirect(url.toString())) {
             redirectUrl = url.toString();
          } else {
             return c.json({ error: 'INVALID_REDIRECT', message: 'Redirect URL not allowed' }, 400);
          }
        } catch {
          return c.json({ error: 'INVALID_REDIRECT', message: 'Invalid redirect URL format' }, 400);
        }
      }

      // Set session cookie and redirect
      const headers = new Headers();
      headers.set('Location', redirectUrl);
      headers.append('Set-Cookie', setSessionCookie(session.id, c.req.raw));
      headers.append('Set-Cookie', clearStateCookie(c.req.raw));

      return new Response(null, {
        status: 302,
        headers,
      });
    } catch (error) {
      console.error('OAuth callback error:', error);
      return c.json(
        {
          error: 'OAUTH_ERROR',
          message: error instanceof Error ? error.message : 'Authentication failed',
        },
        500
      );
    }
  });

  // POST /auth/logout
  app.openapi(logoutRoute, async (c) => {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': clearSessionCookie(c.req.raw),
      },
    });
  });

  // Handle unsupported methods for /auth/logout
  app.get('/auth/logout', (c) => {
    return c.json({ error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }, 405);
  });
}
