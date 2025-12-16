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
  createEntry,
  deleteEntry,
  getEntryById,
  getEntryByKeySecret,
  listEntries,
  updateEntry,
  entryToResponse,
} from "./storage";
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

  // Storage routes
  if (url.pathname.startsWith("/api/storage/entry")) {
    const parts = url.pathname.split("/");
    const id = parts[4]; // /api/storage/entry/:id

    if (id) {
      if (request.method === "GET") {
        return handleGetEntry(request, env, id);
      }
      if (request.method === "PUT") {
        return handleUpdateEntry(request, env, id);
      }
      if (request.method === "DELETE") {
        return handleDeleteEntry(request, env, id);
      }
    } else {
      if (request.method === "POST") {
        return handleCreateEntry(request, env);
      }
    }
  }

  if (url.pathname === "/api/storage/entries") {
    return handleListEntries(request, env);
  }

  // Public shared link
  if (url.pathname.startsWith("/api/public/share")) {
    return handlePublicShare(request, env);
  }

  // Health check
  if (url.pathname === "/health") {
    return new Response("ok", { status: 200 });
  }

  // Handle client-side routing fallback for frontend
  // If the request accepts HTML and it's not an API call, serve the frontend
  if (
    request.headers.get("Accept")?.includes("text/html") &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/auth/")
  ) {
    return renderFrontend();
  }

  return new Response("Not found", { status: 404 });
}

// ===== Storage Handlers =====

async function handleListEntries(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUser(request, env);
  if (!user) {
    return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || undefined;
  const search = url.searchParams.get("search") || undefined;

  const entries = await listEntries(env, user, prefix, search);
  return createJsonResponse(entries.map(entryToResponse));
}

async function handleGetEntry(request: Request, env: Env, idStr: string): Promise<Response> {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return createErrorResponse("INVALID_ID", "Invalid ID", 400);

  const user = await getCurrentUser(request, env);
  if (!user) {
    return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  const entry = await getEntryById(env, id);
  if (!entry) {
    return createErrorResponse("NOT_FOUND", "Entry not found", 404);
  }

  // Access Control
  if (!user.is_admin && entry.user_id !== user.id) {
    return createErrorResponse("FORBIDDEN", "Access denied", 403);
  }

  // If download param is present, serve blob if exists
  const url = new URL(request.url);
  if (url.searchParams.has("download") && entry.blob_value) {
     const headers: Record<string, string> = {
        "Content-Type": entry.type,
     };
     if (entry.filename) {
         headers["Content-Disposition"] = `attachment; filename="${entry.filename}"`;
     }
     // D1 blob_value comes as array buffer usually
     return new Response(entry.blob_value as any, { headers });
  }

  return createJsonResponse({
    ...entryToResponse(entry),
    // For single entry fetch, we might want to include the full blob content if it's small/text?
    // Or just let the client download it separately.
    // The requirement says "use blob_value... have download option".
    // Let's assume the JSON response contains string_value, and blob is fetched via separate call or param.
    // But if string_value is set, we return it.
  });
}

async function handleCreateEntry(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUser(request, env);
  if (!user) {
    return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  try {
    const formData = await request.formData();
    const key = formData.get("key") as string;
    const type = formData.get("type") as string;
    const stringValue = formData.get("string_value") as string | null;
    const file = formData.get("file") as File | null;

    if (!key || !type) {
      return createErrorResponse("INVALID_REQUEST", "Key and Type are required", 400);
    }

    let blobValue: ArrayBuffer | null = null;
    let filename: string | undefined = undefined;

    if (file) {
       blobValue = await file.arrayBuffer();
       filename = file.name;
    }

    // Treat empty string as valid content if explicit (FormData sends "" for empty inputs usually)
    // If null, it means not present.
    // However, createEntry requires one of them.
    // If no file and stringValue is null, we can default to empty string if type implies text?
    // Or just pass what we have. If both null, createEntry throws.
    // Note: formData.get returns null if missing, or string (possibly empty).

    // If user explicitly sends string_value="" via form (even for empty file), it should be treated as "" not null.
    // formData.get("string_value") returns "" for empty input.

    const entry = await createEntry(
      env,
      user.id,
      key,
      type,
      stringValue, // Pass directly (allow "")
      blobValue,
      filename
    );

    return createJsonResponse(entryToResponse(entry));
  } catch (e) {
    console.error("Create error:", e);
    return createErrorResponse("SERVER_ERROR", String(e), 500);
  }
}

async function handleUpdateEntry(request: Request, env: Env, idStr: string): Promise<Response> {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return createErrorResponse("INVALID_ID", "Invalid ID", 400);

  const user = await getCurrentUser(request, env);
  if (!user) {
    return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  const existing = await getEntryById(env, id);
  if (!existing) {
    return createErrorResponse("NOT_FOUND", "Entry not found", 404);
  }

  if (!user.is_admin && existing.user_id !== user.id) {
    return createErrorResponse("FORBIDDEN", "Access denied", 403);
  }

  try {
    const formData = await request.formData();
    const key = formData.get("key") as string; // Optional new key
    const type = formData.get("type") as string;
    const stringValue = formData.get("string_value") as string | null;
    const file = formData.get("file") as File | null;

    if (!type) {
        return createErrorResponse("INVALID_REQUEST", "Type is required", 400);
    }

    // Default to existing key if not provided
    const targetKey = key || existing.key;

    let blobValue: ArrayBuffer | null = null;
    let filename: string | undefined = undefined;

    // Determine if we are updating content or just metadata/key
    let finalStringValue = stringValue;

    // Check if user provided new content
    const hasNewContent = !!file || (stringValue !== null && stringValue !== "");
    // Note: frontend sends "" for stringValue if not text type or empty.

    // Refactored Update Logic with Value Deduping
    // We need to decide if we are changing content (linking to new ValueEntry) or just renaming (Key only).

    // If file provided -> New Content (Blob)
    if (file) {
       blobValue = await file.arrayBuffer();
       filename = file.name;
       finalStringValue = null;
    } else {
        // No file.
        // If stringValue is non-empty, it's new content.
        // If stringValue is empty string (""), it might be cleared text OR just missing from form?
        // Frontend sends "" for null/missing usually.
        // If stringValue is null (not in form), definitely no change.

        // Complex case: Changing from Blob to Text?
        // Complex case: Changing Key only?

        // Heuristic:
        // If stringValue is null, we preserve existing.
        // If stringValue is "" AND existing was blob, we preserve existing (don't clear blob with empty string implicitly).
        // If stringValue is "" AND existing was string, we update to empty string?

        if (stringValue === null) {
             // Preserving existing content.
             // We pass nulls to updateEntry, which handles "preservation" logic now?
             // Actually, storage.ts updateEntry creates new ValueEntry if passed non-nulls.
             // If we pass nulls, it skips value update.
             finalStringValue = null;
             blobValue = null;
        } else if (stringValue === "" && existing.blob_value) {
             // Treat as preserve.
             finalStringValue = null;
             blobValue = null;
        } else {
             // It's a string update (possibly empty).
             // But if it matches existing string, we can optimization skip?
             // findOrCreateValue will handle deduping anyway.
        }
    }

    const entry = await updateEntry(
      env,
      id,
      targetKey,
      finalStringValue || null,
      blobValue,
      type,
      filename
    );

    if (!entry) return createErrorResponse("UPDATE_FAILED", "Update failed", 500);

    return createJsonResponse(entryToResponse(entry));

  } catch (e) {
      return createErrorResponse("SERVER_ERROR", String(e), 500);
  }
}

async function handleDeleteEntry(request: Request, env: Env, idStr: string): Promise<Response> {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return createErrorResponse("INVALID_ID", "Invalid ID", 400);

  const user = await getCurrentUser(request, env);
  if (!user) {
    return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  const existing = await getEntryById(env, id);
  if (!existing) {
    return createErrorResponse("NOT_FOUND", "Entry not found", 404);
  }

  if (!user.is_admin && existing.user_id !== user.id) {
    return createErrorResponse("FORBIDDEN", "Access denied", 403);
  }

  await deleteEntry(env, id);
  return createJsonResponse({ success: true });
}

async function handlePublicShare(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // /api/public/share/:key?secret=...
    // Wait, path logic above was strict.
    // url.pathname.startsWith("/api/public/share")
    // Let's use query param for key to be safe with slashes?
    // Requirement: /share/:key?secret=... (Frontend URL)
    // API URL: /api/public/share?key=...&secret=...

    const key = url.searchParams.get("key");
    const secret = url.searchParams.get("secret");

    if (!key || !secret) {
        return createErrorResponse("INVALID_REQUEST", "Key and Secret required", 400);
    }

    const entry = await getEntryByKeySecret(env, key, secret);
    if (!entry) {
        return createErrorResponse("NOT_FOUND", "Entry not found", 404);
    }

    // Return content directly or JSON?
    // "View entry". If it's a file, maybe serve it?
    // "Preview for images".
    // Let's return JSON metadata by default, and if ?download=true or ?raw=true serve content.

    if (url.searchParams.has("raw") || url.searchParams.has("download")) {
        if (entry.blob_value) {
            const headers: Record<string, string> = {
                "Content-Type": entry.type,
            };
            if (url.searchParams.has("download") && entry.filename) {
                headers["Content-Disposition"] = `attachment; filename="${entry.filename}"`;
            }
            return new Response(entry.blob_value as any, { headers });
        } else if (entry.string_value) {
             return new Response(entry.string_value, {
                 headers: { "Content-Type": entry.type || "text/plain" }
             });
        }
    }

    return createJsonResponse(entryToResponse(entry));
}

export default { fetch: handleRequest };
