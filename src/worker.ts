import JSZip from "jszip";
import { renderFrontend } from "./frontend";
import type {
  Env,
  ErrorResponse,
  User,
  Session,
  PromoteAdminRequest,
  KeyValueCollectionResponse,
  KeyValueCollection,
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
  createCollection,
  getCollection,
  getCollectionBySecret,
  listCollections,
  updateCollection,
  deleteCollection,
  getEntryInCollection,
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

  // Collection Routes
  if (url.pathname.startsWith("/api/collections")) {
      const parts = url.pathname.split("/");
      // /api/collections (length 3)
      // /api/collections/:id (length 4)
      // /api/collections/:id/upload (length 5)

      if (parts.length === 3) {
          if (request.method === "GET") return handleListCollections(request, env);
          if (request.method === "POST") return handleCreateCollection(request, env);
      } else if (parts.length === 4) {
          const id = parts[3];
          if (request.method === "GET") return handleGetCollection(request, env, id);
          if (request.method === "PUT") return handleUpdateCollection(request, env, id);
          if (request.method === "DELETE") return handleDeleteCollection(request, env, id);
      } else if (parts.length === 5) {
          const id = parts[3];
          const action = parts[4];
          if (action === "upload" && request.method === "POST") return handleCollectionZipUpload(request, env, id);
          if (action === "download" && request.method === "GET") return handleCollectionZipDownload(request, env, id);
          if (action === "export" && request.method === "GET") return handleCollectionJsonExport(request, env, id);
      }
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

  if (url.pathname.startsWith("/api/public/collection")) {
    return handlePublicCollection(request, env);
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
  const collectionIdStr = url.searchParams.get("collection_id");
  const includeCollections = url.searchParams.get("include_collections") === "true";

  let collectionId: number | null = null; // Default to Root if not specified? Or All?
  // Logic update:
  // If collection_id param is present, parse it.
  // If missing, it implies Root (null), unless we want 'All' which implies skipping the filter.
  // But listEntries signature: collectionId can be null (Root) or number.
  // How to represent "All"?
  // Wait, existing logic was "All user entries".
  // listEntries(env, user, prefix, search) -> defaulted to all?
  // Updated listEntries: collectionId (optional).
  // If collectionId === undefined, we just list by user (ALL).
  // If collectionId === null, we list Root.
  // If collectionId === number, we list Collection.

  // The client usually wants Root by default.
  // So if collection_id is missing, we assume Root (null) UNLESS `include_collections` is true (then All).

  if (collectionIdStr) {
      collectionId = parseInt(collectionIdStr, 10);
      if (isNaN(collectionId)) return createErrorResponse("INVALID_REQUEST", "Invalid collection ID", 400);
  }

  const entries = await listEntries(env, user, prefix, search, collectionId, includeCollections);
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
    const collectionIdStr = formData.get("collection_id") as string | null;

    if (!key || !type) {
      return createErrorResponse("INVALID_REQUEST", "Key and Type are required", 400);
    }

    let collectionId: number | null = null;
    if (collectionIdStr) {
        collectionId = parseInt(collectionIdStr, 10);
        if (isNaN(collectionId)) return createErrorResponse("INVALID_REQUEST", "Invalid Collection ID", 400);
    }

    let blobValue: ArrayBuffer | null = null;
    let filename: string | undefined = undefined;

    if (file) {
       if (typeof file === "string") {
           // Workaround for Miniflare/workerd integration tests
           const str = file as string;
           const buf = new Uint8Array(str.length);
           for (let i = 0; i < str.length; i++) {
               buf[i] = str.charCodeAt(i);
           }
           blobValue = buf.buffer;
           filename = undefined;
       } else if (typeof file.arrayBuffer === 'function') {
           blobValue = await file.arrayBuffer();
           filename = file.name;
       } else {
           blobValue = await new Response(file).arrayBuffer();
           filename = file.name;
       }
    }

    const entry = await createEntry(
      env,
      user.id,
      key,
      type,
      stringValue,
      blobValue,
      filename,
      collectionId
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
    const collectionIdStr = formData.get("collection_id") as string | null;

    if (!type) {
        return createErrorResponse("INVALID_REQUEST", "Type is required", 400);
    }

    const targetKey = key || existing.key;

    let collectionId: number | null | undefined = undefined;
    // Note: If collectionId param is NOT sent, we assume undefined (don't update).
    // If sent as empty string or "null", we interpret as null (Root).
    // If sent as number, we interpret as number.
    if (formData.has("collection_id")) {
        if (!collectionIdStr || collectionIdStr === "null" || collectionIdStr === "") {
            collectionId = null;
        } else {
            collectionId = parseInt(collectionIdStr, 10);
            if (isNaN(collectionId)) return createErrorResponse("INVALID_REQUEST", "Invalid Collection ID", 400);
        }
    }

    let blobValue: ArrayBuffer | null = null;
    let filename: string | undefined = undefined;
    let finalStringValue = stringValue;

    if (file) {
       if (typeof file === "string") {
           const str = file as string;
           const buf = new Uint8Array(str.length);
           for (let i = 0; i < str.length; i++) {
               buf[i] = str.charCodeAt(i);
           }
           blobValue = buf.buffer;
           filename = undefined;
       } else if (typeof file.arrayBuffer === 'function') {
           blobValue = await file.arrayBuffer();
           filename = file.name;
       } else {
           blobValue = await new Response(file).arrayBuffer();
           filename = file.name;
       }
       finalStringValue = null;
    } else {
        if (stringValue === null) {
             finalStringValue = null;
             blobValue = null;
        } else if (stringValue === "" && existing.blob_value) {
             finalStringValue = null;
             blobValue = null;
        }
    }

    const entry = await updateEntry(
      env,
      id,
      targetKey,
      finalStringValue || null,
      blobValue,
      type,
      filename,
      collectionId
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
    const key = url.searchParams.get("key");
    const secret = url.searchParams.get("secret");

    if (!key || !secret) {
        return createErrorResponse("INVALID_REQUEST", "Key and Secret required", 400);
    }

    const entry = await getEntryByKeySecret(env, key, secret);
    if (!entry) {
        return createErrorResponse("NOT_FOUND", "Entry not found", 404);
    }

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

// ===== Collection Handlers =====

async function handleListCollections(request: Request, env: Env): Promise<Response> {
    const user = await getCurrentUser(request, env);
    if (!user) return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);
    const collections = await listCollections(env, user.id);
    return createJsonResponse(collections);
}

async function handleCreateCollection(request: Request, env: Env): Promise<Response> {
    const user = await getCurrentUser(request, env);
    if (!user) return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);

    const body = await request.json() as any;
    if (!body.name) return createErrorResponse("INVALID_REQUEST", "Name required", 400);

    const collection = await createCollection(env, user.id, body.name, body.description);
    return createJsonResponse(collection);
}

async function handleGetCollection(request: Request, env: Env, idStr: string): Promise<Response> {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) return createErrorResponse("INVALID_ID", "Invalid ID", 400);
    const user = await getCurrentUser(request, env);
    if (!user) return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);

    const collection = await getCollection(env, id);
    if (!collection) return createErrorResponse("NOT_FOUND", "Collection not found", 404);
    if (collection.user_id !== user.id && !user.is_admin) return createErrorResponse("FORBIDDEN", "Access denied", 403);

    return createJsonResponse(collection);
}

async function handleUpdateCollection(request: Request, env: Env, idStr: string): Promise<Response> {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) return createErrorResponse("INVALID_ID", "Invalid ID", 400);
    const user = await getCurrentUser(request, env);
    if (!user) return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);

    const collection = await getCollection(env, id);
    if (!collection) return createErrorResponse("NOT_FOUND", "Collection not found", 404);
    if (collection.user_id !== user.id && !user.is_admin) return createErrorResponse("FORBIDDEN", "Access denied", 403);

    const body = await request.json() as any;
    if (!body.name) return createErrorResponse("INVALID_REQUEST", "Name required", 400);

    const updated = await updateCollection(env, id, body.name, body.description);
    return createJsonResponse(updated);
}

async function handleDeleteCollection(request: Request, env: Env, idStr: string): Promise<Response> {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) return createErrorResponse("INVALID_ID", "Invalid ID", 400);
    const user = await getCurrentUser(request, env);
    if (!user) return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);

    const collection = await getCollection(env, id);
    if (!collection) return createErrorResponse("NOT_FOUND", "Collection not found", 404);
    if (collection.user_id !== user.id && !user.is_admin) return createErrorResponse("FORBIDDEN", "Access denied", 403);

    await deleteCollection(env, id);
    return createJsonResponse({ success: true });
}

async function handleCollectionZipUpload(request: Request, env: Env, idStr: string): Promise<Response> {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) return createErrorResponse("INVALID_ID", "Invalid ID", 400);
    const user = await getCurrentUser(request, env);
    if (!user) return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);

    const collection = await getCollection(env, id);
    if (!collection) return createErrorResponse("NOT_FOUND", "Collection not found", 404);
    if (collection.user_id !== user.id && !user.is_admin) return createErrorResponse("FORBIDDEN", "Access denied", 403);

    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return createErrorResponse("INVALID_REQUEST", "No file uploaded", 400);

    let arrayBuffer: ArrayBuffer;
    if (typeof file === "string") {
        // Handle mock case
        const str = file as string;
        const buf = new Uint8Array(str.length);
        for(let i=0; i<str.length; i++) buf[i] = str.charCodeAt(i);
        arrayBuffer = buf.buffer;
    } else {
        arrayBuffer = await file.arrayBuffer();
    }

    try {
        const zip = await JSZip.loadAsync(arrayBuffer);
        const promises: Promise<any>[] = [];

        zip.forEach((relativePath, zipEntry) => {
            if (zipEntry.dir) return;

            const promise = (async () => {
                const content = await zipEntry.async("arraybuffer");
                // Check if text? Heuristic: if small enough and no null bytes?
                // Or just assume binary (blob).
                // Requirement: "overwrite existing keys in collection".
                // We use relativePath as key.

                const existing = await getEntryInCollection(env, user.id, relativePath, id);
                if (existing) {
                    await updateEntry(env, existing.id, relativePath, null, content, "application/octet-stream", undefined, id);
                } else {
                    await createEntry(env, user.id, relativePath, "application/octet-stream", null, content, undefined, id);
                }
            })();
            promises.push(promise);
        });

        await Promise.all(promises);
        return createJsonResponse({ success: true, count: promises.length });

    } catch (e) {
        console.error("Zip processing error", e);
        return createErrorResponse("SERVER_ERROR", "Failed to process zip", 500);
    }
}

async function handleCollectionZipDownload(request: Request, env: Env, idStr: string): Promise<Response> {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) return createErrorResponse("INVALID_ID", "Invalid ID", 400);
    const user = await getCurrentUser(request, env);
    if (!user) return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);

    const collection = await getCollection(env, id);
    if (!collection) return createErrorResponse("NOT_FOUND", "Collection not found", 404);
    if (collection.user_id !== user.id && !user.is_admin) return createErrorResponse("FORBIDDEN", "Access denied", 403);

    try {
        const entries = await listEntries(env, user, undefined, undefined, id);
        // We need full content for zip
        const zip = new JSZip();
        const values: Record<string, string> = {};

        for (const entryMeta of entries) {
            const entry = await getEntryById(env, entryMeta.id); // fetch content
            if (!entry) continue;

            if (entry.blob_value) {
                zip.file(entry.key, entry.blob_value as any);
            } else if (entry.string_value !== null) {
                values[entry.key] = entry.string_value;
            }
        }

        if (Object.keys(values).length > 0) {
            zip.file("values.json", JSON.stringify(values, null, 2));
        }

        const content = await zip.generateAsync({ type: "blob" });
        return new Response(content as any, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="${collection.name}.zip"`
            }
        });

    } catch (e) {
         console.error("Zip generation error", e);
         return createErrorResponse("SERVER_ERROR", String(e), 500);
    }
}

async function handleCollectionJsonExport(request: Request, env: Env, idStr: string): Promise<Response> {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) return createErrorResponse("INVALID_ID", "Invalid ID", 400);
    const user = await getCurrentUser(request, env);
    if (!user) return createErrorResponse("UNAUTHORIZED", "Not authenticated", 401);

    const collection = await getCollection(env, id);
    if (!collection) return createErrorResponse("NOT_FOUND", "Collection not found", 404);
    if (collection.user_id !== user.id && !user.is_admin) return createErrorResponse("FORBIDDEN", "Access denied", 403);

    const entries = await listEntries(env, user, undefined, undefined, id);
    const contents: any[] = [];

    // Base URL for public links
    const baseUrl = new URL(request.url).origin;

    for (const entryMeta of entries) {
        // Need to distinguish values vs files
        const entry = await getEntryById(env, entryMeta.id);
        if (!entry) continue;

        if (entry.blob_value) {
            contents.push({
                key: entry.key,
                type: "file",
                mime_type: entry.type,
                url: `${baseUrl}/api/public/share?key=${encodeURIComponent(entry.key)}&secret=${entry.hash}`
            });
        } else {
            contents.push({
                key: entry.key,
                type: "value",
                value: entry.string_value
            });
        }
    }

    return createJsonResponse({
        ...collection,
        contents
    });
}

async function handlePublicCollection(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    if (!secret) return createErrorResponse("INVALID_REQUEST", "Secret required", 400);

    const collection = await getCollectionBySecret(env, secret);
    if (!collection) return createErrorResponse("NOT_FOUND", "Collection not found", 404);

    // Get user for listEntries (dummy user object just for passing to function? No, listEntries uses user.id)
    // We need to bypass listEntries user check or make a new helper.
    // listEntries filters by user_id. We know the user_id from the collection.
    // So we can mock a user object with correct ID.
    const mockUser = { id: collection.user_id, is_admin: 0 } as User;

    const entries = await listEntries(env, mockUser, undefined, undefined, collection.id);
    const contents: any[] = [];
    const baseUrl = new URL(request.url).origin;

    for (const entryMeta of entries) {
        const entry = await getEntryById(env, entryMeta.id);
        if (!entry) continue;

        if (entry.blob_value) {
             contents.push({
                key: entry.key,
                type: "file",
                mime_type: entry.type,
                url: `${baseUrl}/api/public/share?key=${encodeURIComponent(entry.key)}&secret=${entry.hash}`
            });
        } else {
            contents.push({
                key: entry.key,
                type: "value",
                value: entry.string_value
            });
        }
    }

    return createJsonResponse({
        ...collection,
        contents
    });
}

export default { fetch: handleRequest };
