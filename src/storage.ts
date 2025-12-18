import type { Env, KeyValueEntryJoined, User, ValueEntry } from "./types";

const MAX_BLOCK_SIZE = 1.8 * 1024 * 1024; // 1.8 MB

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
 * Split blob into chunks
 */
function chunkBlob(blob: ArrayBuffer): ArrayBuffer[] {
  const chunks: ArrayBuffer[] = [];
  let offset = 0;
  while (offset < blob.byteLength) {
    const end = Math.min(offset + MAX_BLOCK_SIZE, blob.byteLength);
    chunks.push(blob.slice(offset, end));
    offset = end;
  }
  return chunks;
}

/**
 * Reassemble blob from parts
 */
async function reassembleBlob(env: Env, valueId: number): Promise<ArrayBuffer | null> {
  const query = `
    SELECT data FROM blob_parts
    WHERE value_id = ?
    ORDER BY part_index ASC
  `;
  const { results } = await env.DB.prepare(query).bind(valueId).all<{ data: ArrayBuffer }>();

  if (!results || results.length === 0) return null;

  // Normalize chunks to Uint8Array first to calculate total size accurately
  const normalizedChunks: Uint8Array[] = results.map(row => {
      const rowData = row.data as any;
      if (Array.isArray(rowData)) {
          return new Uint8Array(rowData);
      } else if (rowData instanceof ArrayBuffer) {
          return new Uint8Array(rowData);
      } else {
          return new Uint8Array(rowData);
      }
  });

  // Calculate total size
  const totalSize = normalizedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combined = new Uint8Array(totalSize);

  let offset = 0;
  for (const chunk of normalizedChunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined.buffer;
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

    // Calculate size
    let size = 0;
    if (stringValue !== null) {
      size = stringValue.length;
    } else if (blobValue !== null) {
      size = blobValue.byteLength;
    }

    // Look up by hash
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

    // Determine if multipart
    const isMultipart = blobValue !== null && size > MAX_BLOCK_SIZE;

    if (isMultipart && blobValue) {
        // Multipart Insert
        // 1. Insert value_entry with is_multipart=1, blob_value=NULL
        const insertValue = `
            INSERT INTO value_entries (hash, string_value, blob_value, type, is_multipart, size)
            VALUES (?, NULL, NULL, ?, 1, ?)
            RETURNING *
        `;

        // Use batch to ensure atomicity
        const chunks = chunkBlob(blobValue);
        const batch = [
            env.DB.prepare(insertValue).bind(hash, type, size)
        ];

        // We need the ID from the first insert to insert parts.
        // D1 batch doesn't support using result of previous statement in next statement easily in one go unless using stored procedures which aren't standard here.
        // So we must do it in steps. Ideally inside a transaction.
        // But let's try to just insert the value first.

        const newEntry = await env.DB.prepare(insertValue)
            .bind(hash, type, size)
            .first<ValueEntry>();

        if (!newEntry) throw new Error("Failed to create multipart value entry");

        const partInserts = chunks.map((chunk, index) =>
            env.DB.prepare("INSERT INTO blob_parts (value_id, part_index, data) VALUES (?, ?, ?)")
                .bind(newEntry.id, index, chunk)
        );

        await env.DB.batch(partInserts);

        return newEntry;

    } else {
        // Standard Insert
        const insert = `
            INSERT INTO value_entries (hash, string_value, blob_value, type, is_multipart, size)
            VALUES (?, ?, ?, ?, 0, ?)
            RETURNING *
        `;

        const newEntry = await env.DB.prepare(insert)
            .bind(hash, stringValue, blobValue, type, size)
            .first<ValueEntry>();

        if (!newEntry) throw new Error("Failed to create value entry");

        return newEntry;
    }
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
    SELECT k.*, v.hash as secret, v.hash, v.string_value, v.blob_value, v.type, v.is_multipart, v.size
    FROM key_value_entries k
    JOIN value_entries v ON k.value_id = v.id
    WHERE k.id = ?
  `;
  const entry = await env.DB.prepare(query).bind(id).first<KeyValueEntryJoined>();

  if (entry && entry.is_multipart) {
      const blob = await reassembleBlob(env, entry.value_id);
      entry.blob_value = blob;
  }

  return entry;
}

export async function getEntryByKeySecret(env: Env, key: string, secret: string): Promise<KeyValueEntryJoined | null> {
  // Join and filter by key and value's hash (secret)
  const query = `
    SELECT k.*, v.hash as secret, v.hash, v.string_value, v.blob_value, v.type, v.is_multipart, v.size
    FROM key_value_entries k
    JOIN value_entries v ON k.value_id = v.id
    WHERE k.key = ? AND v.hash = ?
    ORDER BY k.created_at DESC
  `;
  const entry = await env.DB.prepare(query).bind(key, secret).first<KeyValueEntryJoined>();

  if (entry && entry.is_multipart) {
      const blob = await reassembleBlob(env, entry.value_id);
      entry.blob_value = blob;
  }

  return entry;
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
           v.hash as secret, v.type, v.string_value, v.size, v.is_multipart
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
