import type { Context, Next } from 'hono';
import type { Env } from './types';
import { getSession, updateSessionLastUsed, deleteExpiredSessions } from './session';
import { getSessionIdFromCookie } from './cookie';

// ===== CORS Middleware =====

const ALLOWED_ORIGINS = [
  'jonathanburnhams.com',
  'jburnhams.workers.dev',
  'localhost',
  '127.0.0.1',
];

function isAllowedOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    for (const allowed of ALLOWED_ORIGINS) {
      if (hostname === allowed || hostname.endsWith(`.${allowed}`)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header('Origin');

  // Handle preflight
  if (c.req.method === 'OPTIONS') {
    if (!origin || !isAllowedOrigin(origin)) {
      return c.text('', 403);
    }

    return c.text('', 204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    });
  }

  await next();

  // Add CORS headers to response
  if (origin && isAllowedOrigin(origin)) {
    c.res.headers.set('Access-Control-Allow-Origin', origin);
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
  }
}

// ===== Session Cleanup Middleware =====

export async function sessionCleanupMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  // Clean up expired sessions in the background
  c.executionCtx.waitUntil(deleteExpiredSessions(c.env));
  await next();
}

// ===== Authentication Middleware =====

export interface SessionContext {
  user_id: number;
  session_id: string;
}

function createUnauthorizedResponse(c: Context, message: string) {
  const url = new URL(c.req.url);

  // Check for redirect parameter from query string or Referer header
  let redirect = url.searchParams.get('redirect');
  if (!redirect) {
    redirect = c.req.header('Referer') || null;
  }

  // Build login URL
  let loginUrl = `${url.origin}/auth/login`;
  if (redirect) {
    loginUrl += `?redirect=${encodeURIComponent(redirect)}`;
  }

  return c.json({
    error: 'UNAUTHORIZED',
    message,
    login_url: loginUrl,
  }, 401);
}

export async function loadSession(c: Context<{ Bindings: Env; Variables: { session?: SessionContext } }>) {
  let sessionId = c.req.query('session') || null;
  if (!sessionId) {
    sessionId = getSessionIdFromCookie(c.req.raw);
  }
  if (!sessionId) return null;

  const session = await getSession(sessionId, c.env);
  if (!session) return null;

  // Update last used timestamp in background
  c.executionCtx.waitUntil(updateSessionLastUsed(sessionId, c.env));

  // Set session context
  c.set('session', { user_id: session.user_id, session_id: sessionId });

  return session;
}

export async function attemptAuth(c: Context<{ Bindings: Env; Variables: { session?: SessionContext } }>, next: Next) {
  await loadSession(c);
  await next();
}

export async function requireAuth(c: Context<{ Bindings: Env; Variables: { session?: SessionContext } }>, next: Next) {
  // Check if session is already present (e.g. from previous middleware or tests)
  if (c.get('session')) {
    await next();
    return;
  }

  const session = await loadSession(c);

  if (!session) {
    // Determine if we failed due to missing cookie or invalid session
    // For now, consistent error message
    const sessionId = getSessionIdFromCookie(c.req.raw);
    const message = sessionId ? 'Session expired or invalid' : 'Authentication required';
    return createUnauthorizedResponse(c, message);
  }

  await next();
}

// ===== Authorization Middleware =====

export async function requireStandard(c: Context<{ Bindings: Env; Variables: { session?: SessionContext } }>, next: Next) {
  const sessionContext = c.get('session');
  if (!sessionContext) {
    return createUnauthorizedResponse(c, 'Authentication required');
  }

  const { getUserById } = await import('./session');
  const user = await getUserById(sessionContext.user_id, c.env);

  if (!user || user.user_type === 'GUEST') {
    return c.json({ error: 'FORBIDDEN', message: 'Write access denied for guests' }, 403);
  }

  await next();
}

export async function requireAdmin(c: Context<{ Bindings: Env; Variables: { session?: SessionContext } }>, next: Next) {
  const sessionContext = c.get('session');
  if (!sessionContext) {
    return createUnauthorizedResponse(c, 'Authentication required');
  }

  const { getUserById, isUserAdmin } = await import('./session');
  const user = await getUserById(sessionContext.user_id, c.env);

  if (!user || !isUserAdmin(user)) {
    return c.json({ error: 'FORBIDDEN', message: 'Admin access required' }, 403);
  }

  await next();
}

// ===== Error Handler Middleware =====

export function errorHandler(err: Error, c: Context) {
  console.error('Unhandled error:', err);
  return c.json(
    {
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
    500
  );
}
