import { renderFrontend } from "./frontend";
import type {
  Env,
  ErrorResponse,
  User,
  Session,
  PromoteAdminRequest,
} from "./types";
import {
  generateState,
  getRedirectUri,
  getGoogleAuthUrl,
  exchangeCodeForToken,
  getGoogleUserInfo,
} from "./oauth";
import {
  getOrCreateUser,
  createSession,
  getSession,
  getUserById,
  updateSessionLastUsed,
  deleteSession,
  deleteExpiredSessions,
  getAllUsers,
  getAllSessions,
  userToResponse,
  isUserAdmin,
  promoteUserToAdmin,
  getUserByEmail,
} from "./session";
import {
  setSessionCookie,
  clearSessionCookie,
  getSessionIdFromCookie,
  setStateCookie,
  getStateFromCookie,
  clearStateCookie,
} from "./cookie";

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?: () => void;
}

function createErrorResponse(
  error: string,
  message: string,
  status: number
): Response {
  const errorBody: ErrorResponse = { error, message };
  return new Response(JSON.stringify(errorBody), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function createJsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

/**
 * Get current authenticated user from session cookie
 */
async function getCurrentUser(
  request: Request,
  env: Env
): Promise<User | null> {
  const sessionId = getSessionIdFromCookie(request);
  if (!sessionId) {
    return null;
  }

  const session = await getSession(sessionId, env);
  if (!session) {
    return null;
  }

  const user = await getUserById(session.user_id, env);
  if (!user) {
    return null;
  }

  // Update session last used
  await updateSessionLastUsed(sessionId, env);

  return user;
}

/**
 * Handle Google OAuth login initiation
 */
async function handleLogin(request: Request, env: Env): Promise<Response> {
  const state = generateState();
  const redirectUri = getRedirectUri(request);
  const authUrl = getGoogleAuthUrl(env.GOOGLE_CLIENT_ID, redirectUri, state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": setStateCookie(state, request),
    },
  });
}

/**
 * Handle Google OAuth callback
 */
async function handleCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = getStateFromCookie(request);

  // Verify state parameter for CSRF protection
  if (!state || !storedState || state !== storedState) {
    return new Response(
      "<html><body><h1>Authentication Error</h1><p>Invalid state parameter. Please try again.</p><a href='/'>Go back</a></body></html>",
      {
        status: 400,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "Set-Cookie": clearStateCookie(request),
        },
      }
    );
  }

  if (!code) {
    return new Response(
      "<html><body><h1>Authentication Error</h1><p>No authorization code received.</p><a href='/'>Go back</a></body></html>",
      {
        status: 400,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "Set-Cookie": clearStateCookie(request),
        },
      }
    );
  }

  try {
    // Exchange code for token
    const redirectUri = getRedirectUri(request);
    const tokenResponse = await exchangeCodeForToken(code, redirectUri, env);

    // Get user info from Google
    const userInfo = await getGoogleUserInfo(tokenResponse.access_token);

    // Get or create user in database
    const user = await getOrCreateUser(
      userInfo.email,
      userInfo.name,
      userInfo.picture,
      env
    );

    // Create session
    const session = await createSession(user.id, env);

    // Redirect to home with session cookie
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        "Set-Cookie": setSessionCookie(session.id, request),
      },
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    return new Response(
      `<html><body><h1>Authentication Error</h1><p>${String(error)}</p><a href='/'>Go back</a></body></html>`,
      {
        status: 500,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "Set-Cookie": clearStateCookie(request),
        },
      }
    );
  }
}

/**
 * Handle logout
 */
async function handleLogout(request: Request, env: Env): Promise<Response> {
  // Logout must be POST to prevent CSRF attacks
  if (request.method !== "POST") {
    return createErrorResponse(
      "METHOD_NOT_ALLOWED",
      "Only POST method is allowed for logout",
      405
    );
  }

  const sessionId = getSessionIdFromCookie(request);
  if (sessionId) {
    await deleteSession(sessionId, env);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": clearSessionCookie(request),
    },
  });
}

/**
 * Get current session info (for subdomains to validate auth)
 */
async function handleGetSession(
  request: Request,
  env: Env
): Promise<Response> {
  const sessionId = getSessionIdFromCookie(request);
  if (!sessionId) {
    return createErrorResponse("UNAUTHORIZED", "No session found", 401);
  }

  const session = await getSession(sessionId, env);
  if (!session) {
    return createErrorResponse("UNAUTHORIZED", "Invalid or expired session", 401);
  }

  const user = await getUserById(session.user_id, env);
  if (!user) {
    return createErrorResponse("UNAUTHORIZED", "User not found", 401);
  }

  // Update session last used
  await updateSessionLastUsed(sessionId, env);

  return createJsonResponse({
    ...session,
    user: userToResponse(user),
  });
}

/**
 * Get current user info
 */
async function handleGetUser(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUser(request, env);
  if (!user) {
    return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  return createJsonResponse(userToResponse(user));
}

/**
 * Get all users (admin only)
 */
async function handleGetAllUsers(
  request: Request,
  env: Env
): Promise<Response> {
  const user = await getCurrentUser(request, env);
  if (!user) {
    return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  if (!isUserAdmin(user)) {
    return createErrorResponse("FORBIDDEN", "Admin access required", 403);
  }

  const users = await getAllUsers(env);
  return createJsonResponse(users.map(userToResponse));
}

/**
 * Get all sessions (admin only)
 */
async function handleGetAllSessions(
  request: Request,
  env: Env
): Promise<Response> {
  const user = await getCurrentUser(request, env);
  if (!user) {
    return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  if (!isUserAdmin(user)) {
    return createErrorResponse("FORBIDDEN", "Admin access required", 403);
  }

  const sessions = await getAllSessions(env);
  return createJsonResponse(sessions);
}

/**
 * Promote user to admin (admin only)
 */
async function handlePromoteAdmin(
  request: Request,
  env: Env
): Promise<Response> {
  const user = await getCurrentUser(request, env);
  if (!user) {
    return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  if (!isUserAdmin(user)) {
    return createErrorResponse("FORBIDDEN", "Admin access required", 403);
  }

  if (request.method !== "POST") {
    return createErrorResponse(
      "METHOD_NOT_ALLOWED",
      "Only POST method is allowed",
      405
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse(
      "INVALID_JSON",
      "Request body must be valid JSON",
      400
    );
  }

  if (!body || typeof body !== "object") {
    return createErrorResponse(
      "INVALID_REQUEST",
      "Request body must be an object",
      400
    );
  }

  const payload = body as PromoteAdminRequest;

  if (!payload.email || typeof payload.email !== "string") {
    return createErrorResponse(
      "INVALID_REQUEST",
      "Email is required",
      400
    );
  }

  const targetUser = await getUserByEmail(payload.email, env);
  if (!targetUser) {
    return createErrorResponse("NOT_FOUND", "User not found", 404);
  }

  await promoteUserToAdmin(payload.email, env);

  return createJsonResponse({ success: true });
}

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  // Cleanup expired sessions in background
  ctx.waitUntil(deleteExpiredSessions(env));

  // Frontend
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return renderFrontend();
  }

  // Auth routes
  if (url.pathname === "/auth/login") {
    return handleLogin(request, env);
  }

  if (url.pathname === "/auth/callback") {
    return handleCallback(request, env);
  }

  if (url.pathname === "/auth/logout") {
    return handleLogout(request, env);
  }

  // API routes
  if (url.pathname === "/api/session") {
    return handleGetSession(request, env);
  }

  if (url.pathname === "/api/user") {
    return handleGetUser(request, env);
  }

  if (url.pathname === "/api/users") {
    return handleGetAllUsers(request, env);
  }

  if (url.pathname === "/api/sessions") {
    return handleGetAllSessions(request, env);
  }

  if (url.pathname === "/api/admin/promote") {
    return handlePromoteAdmin(request, env);
  }

  // Health check
  if (url.pathname === "/health") {
    return new Response("ok", { status: 200 });
  }

  return new Response("Not found", { status: 404 });
}

export default { fetch: handleRequest };
