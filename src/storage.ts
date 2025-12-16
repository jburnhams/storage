import type { Env, KeyValueEntry, User } from "./types";

/**
 * Calculate MD5 hash of content
 * Note: crypto.subtle.digest returns ArrayBuffer, we convert to hex string
 */
async function calculateSecret(content: string | ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const data = typeof content === "string" ? encoder.encode(content) : content;
  const hashBuffer = await crypto.subtle.digest("MD5", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createEntry(
  env: Env,
  userId: number,
  key: string,
  type: string,
  stringValue: string | null,
  blobValue: ArrayBuffer | null,
  filename?: string
): Promise<KeyValueEntry> {
  // Validate constraints
  if ((stringValue === null && blobValue === null) || (stringValue !== null && blobValue !== null)) {
    throw new Error("Either string_value or blob_value must be set, but not both.");
  }

  const content = stringValue !== null ? stringValue : blobValue!;
  const secret = await calculateSecret(content);

  const query = `
    INSERT INTO key_value_entries (key, string_value, blob_value, secret, type, filename, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `;

  // For D1, blob should be ArrayBuffer or Uint8Array.
  const result = await env.DB.prepare(query)
    .bind(key, stringValue, blobValue, secret, type, filename || null, userId)
    .first<KeyValueEntry>();

  if (!result) {
    throw new Error("Failed to create entry");
  }

  return result;
}

export async function getEntryById(env: Env, id: number): Promise<KeyValueEntry | null> {
  return await env.DB.prepare("SELECT * FROM key_value_entries WHERE id = ?").bind(id).first<KeyValueEntry>();
}

export async function getEntryByKeySecret(env: Env, key: string, secret: string): Promise<KeyValueEntry | null> {
  // If multiple entries match (same key, same content), return any (e.g., latest created)
  return await env.DB.prepare("SELECT * FROM key_value_entries WHERE key = ? AND secret = ? ORDER BY created_at DESC")
    .bind(key, secret)
    .first<KeyValueEntry>();
}

export async function updateEntry(
  env: Env,
  id: number,
  key: string,
  stringValue: string | null,
  blobValue: ArrayBuffer | null,
  type: string,
  filename?: string
): Promise<KeyValueEntry | null> {
    if ((stringValue === null && blobValue === null) || (stringValue !== null && blobValue !== null)) {
        throw new Error("Either string_value or blob_value must be set, but not both.");
    }

  const content = stringValue !== null ? stringValue : blobValue!;
  const secret = await calculateSecret(content);

  const query = `
    UPDATE key_value_entries
    SET key = ?, string_value = ?, blob_value = ?, secret = ?, type = ?, filename = ?, updated_at = datetime('now')
    WHERE id = ?
    RETURNING *
  `;

  return await env.DB.prepare(query)
    .bind(key, stringValue, blobValue, secret, type, filename || null, id)
    .first<KeyValueEntry>();
}

export async function deleteEntry(env: Env, id: number): Promise<void> {
  await env.DB.prepare("DELETE FROM key_value_entries WHERE id = ?").bind(id).run();
}

/**
 * List entries.
 * - If admin, can see all (or filter by user).
 * - If user, can only see own.
 * - Supports prefix filtering for directory simulation.
 */
export async function listEntries(
  env: Env,
  user: User,
  prefix?: string,
  search?: string
): Promise<KeyValueEntry[]> {
  let query = "SELECT id, key, type, filename, secret, user_id, created_at, updated_at, string_value FROM key_value_entries WHERE 1=1";
  const params: any[] = [];

  // Access Control
  if (!user.is_admin) {
    query += " AND user_id = ?";
    params.push(user.id);
  }

  // Filtering
  if (prefix) {
    query += " AND key LIKE ?";
    params.push(`${prefix}%`);
  }

  if (search) {
    query += " AND key LIKE ?";
    params.push(`%${search}%`);
  }

  query += " ORDER BY key ASC";

  // Note: We are deliberately NOT selecting blob_value to save bandwidth on listing
  // But we included string_value. If string values are huge, we might exclude them too.
  // For now, let's include string_value as it might be useful for preview.

  const { results } = await env.DB.prepare(query).bind(...params).all<KeyValueEntry>();
  return results;
}

export function entryToResponse(entry: KeyValueEntry) {
    const { blob_value, ...rest } = entry;
    return {
        ...rest,
        has_blob: !!blob_value
    };
}
