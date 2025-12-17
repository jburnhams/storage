import type { Env, KeyValueEntryJoined, User, ValueEntry } from "./types";

/**
 * Calculate SHA-1 hash of content
 */
async function calculateSecret(content: string | ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const data = typeof content === "string" ? encoder.encode(content) : content;
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Find existing value entry or create new one.
 */
async function findOrCreateValue(
    env: Env,
    stringValue: string | null,
    blobValue: ArrayBuffer | null,
    type: string
): Promise<ValueEntry> {
    const content = stringValue !== null ? stringValue : blobValue!;
    const hash = await calculateSecret(content);

    // Look up by hash
    // We also check type, and ideally content to avoid collision.
    // D1 SELECT blob comparison might be tricky, so we rely on hash + type + string check.
    // If blob, we might rely on hash strength (SHA-1 is weak but sufficient for this context probably).
    // Or we fetch and compare in JS? Fetching large blobs is expensive.
    // Let's rely on Hash + Type + StringValue check.

    let query = "SELECT * FROM value_entries WHERE hash = ? AND type = ?";
    const params: any[] = [hash, type];

    if (stringValue !== null) {
        query += " AND string_value = ?";
        params.push(stringValue);
    } else {
        query += " AND string_value IS NULL";
    }

    const existing = await env.DB.prepare(query).bind(...params).first<ValueEntry>();

    if (existing) {
        return existing;
    }

    // Create new
    const insert = `
        INSERT INTO value_entries (hash, string_value, blob_value, type)
        VALUES (?, ?, ?, ?)
        RETURNING *
    `;

    const newEntry = await env.DB.prepare(insert)
        .bind(hash, stringValue, blobValue, type)
        .first<ValueEntry>();

    if (!newEntry) throw new Error("Failed to create value entry");

    return newEntry;
}

export async function createEntry(
  env: Env,
  userId: number,
  key: string,
  type: string,
  stringValue: string | null,
  blobValue: ArrayBuffer | null,
  filename?: string
): Promise<KeyValueEntryJoined> {
  // Validate constraints
  if ((stringValue === null && blobValue === null) || (stringValue !== null && blobValue !== null)) {
    throw new Error("Either string_value or blob_value must be set, but not both.");
  }

  const valueEntry = await findOrCreateValue(env, stringValue, blobValue, type);

  const query = `
    INSERT INTO key_value_entries (key, value_id, filename, user_id)
    VALUES (?, ?, ?, ?)
    RETURNING *
  `;

  const result = await env.DB.prepare(query)
    .bind(key, valueEntry.id, filename || null, userId)
    .first<any>();

  if (!result) {
    throw new Error("Failed to create entry");
  }

  return { ...result, ...valueEntry, secret: valueEntry.hash };
}

export async function getEntryById(env: Env, id: number): Promise<KeyValueEntryJoined | null> {
  const query = `
    SELECT k.*, v.hash as secret, v.hash, v.string_value, v.blob_value, v.type
    FROM key_value_entries k
    JOIN value_entries v ON k.value_id = v.id
    WHERE k.id = ?
  `;
  return await env.DB.prepare(query).bind(id).first<KeyValueEntryJoined>();
}

export async function getEntryByKeySecret(env: Env, key: string, secret: string): Promise<KeyValueEntryJoined | null> {
  // Join and filter by key and value's hash (secret)
  const query = `
    SELECT k.*, v.hash as secret, v.hash, v.string_value, v.blob_value, v.type
    FROM key_value_entries k
    JOIN value_entries v ON k.value_id = v.id
    WHERE k.key = ? AND v.hash = ?
    ORDER BY k.created_at DESC
  `;
  return await env.DB.prepare(query).bind(key, secret).first<KeyValueEntryJoined>();
}

export async function updateEntry(
  env: Env,
  id: number,
  key: string,
  stringValue: string | null,
  blobValue: ArrayBuffer | null,
  type: string,
  filename?: string
): Promise<KeyValueEntryJoined | null> {
    // Note: updateEntry logic in worker.ts passes null/null if preserving content.
    // If preserving content (stringValue & blobValue both null), we only update key/filename/updated_at.

    if (stringValue === null && blobValue === null) {
        // Just rename/metadata update
         const query = `
            UPDATE key_value_entries
            SET key = ?, filename = ?, updated_at = datetime('now')
            WHERE id = ?
            RETURNING *
        `;
        const result = await env.DB.prepare(query)
            .bind(key, filename || null, id)
            .first<any>();

        if (!result) return null;

        // Fetch full joined object
        return await getEntryById(env, id);
    }

    // Else we are updating value
    if (stringValue !== null && blobValue !== null) {
         throw new Error("Either string_value or blob_value must be set, but not both.");
    }

    const valueEntry = await findOrCreateValue(env, stringValue, blobValue, type);

    const query = `
        UPDATE key_value_entries
        SET key = ?, value_id = ?, filename = ?, updated_at = datetime('now')
        WHERE id = ?
        RETURNING *
    `;

    const result = await env.DB.prepare(query)
        .bind(key, valueEntry.id, filename || null, id)
        .first<any>();

    if (!result) return null;

    return { ...result, ...valueEntry, secret: valueEntry.hash };
}

export async function deleteEntry(env: Env, id: number): Promise<void> {
  await env.DB.prepare("DELETE FROM key_value_entries WHERE id = ?").bind(id).run();
}

export async function listEntries(
  env: Env,
  user: User,
  prefix?: string,
  search?: string
): Promise<KeyValueEntryJoined[]> {
  // We need to join to get type, string_value, secret
  let query = `
    SELECT k.id, k.key, k.filename, k.user_id, k.created_at, k.updated_at,
           v.hash as secret, v.type, v.string_value
           -- exclude blob_value for list performance
    FROM key_value_entries k
    JOIN value_entries v ON k.value_id = v.id
    WHERE 1=1
  `;

  const params: any[] = [];

  if (!user.is_admin) {
    query += " AND k.user_id = ?";
    params.push(user.id);
  }

  if (prefix) {
    query += " AND k.key LIKE ?";
    params.push(`${prefix}%`);
  }

  if (search) {
    query += " AND k.key LIKE ?";
    params.push(`%${search}%`);
  }

  query += " ORDER BY k.key ASC";

  const { results } = await env.DB.prepare(query).bind(...params).all<KeyValueEntryJoined>();
  return results;
}

export function entryToResponse(entry: KeyValueEntryJoined) {
    // entry.blob_value might be missing if listing, or present if get
    const has_blob = !!entry.blob_value || (entry.string_value === null && entry.type !== "application/json" && !entry.type.startsWith("text/"));
    // Better logic: if string_value is null, it MUST be a blob value_entry.

    const { blob_value, ...rest } = entry;
    return {
        ...rest,
        has_blob: entry.string_value === null
    };
}
