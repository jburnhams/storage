import { Env, User, AccessLevel, StorageAccess, StorageAccessJoined } from './types';
import { isUserAdmin } from './session';
import { getCollection, getEntryById } from './storage';

export async function grantAccess(
  env: Env,
  userId: number,
  resourceType: 'collection' | 'entry',
  resourceId: number,
  level: AccessLevel
): Promise<StorageAccess> {
  const isCollection = resourceType === 'collection';

  // Upsert logic (replace if exists)
  const query = `
    INSERT INTO storage_access (user_id, collection_id, key_value_entry_id, access_level)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, ${isCollection ? 'collection_id' : 'key_value_entry_id'})
    DO UPDATE SET access_level = excluded.access_level
    RETURNING *
  `;

  const colId = isCollection ? resourceId : null;
  const entryId = isCollection ? null : resourceId;

  const result = await env.DB.prepare(query)
    .bind(userId, colId, entryId, level)
    .first<StorageAccess>();

  if (!result) throw new Error("Failed to grant access");
  return result;
}

export async function revokeAccess(
  env: Env,
  userId: number,
  resourceType: 'collection' | 'entry',
  resourceId: number
): Promise<void> {
  const isCollection = resourceType === 'collection';
  const query = `
    DELETE FROM storage_access
    WHERE user_id = ? AND ${isCollection ? 'collection_id' : 'key_value_entry_id'} = ?
  `;
  await env.DB.prepare(query).bind(userId, resourceId).run();
}

export async function listAccess(
  env: Env,
  resourceType: 'collection' | 'entry',
  resourceId: number
): Promise<StorageAccessJoined[]> {
  const isCollection = resourceType === 'collection';
  const query = `
    SELECT sa.*, u.email as user_email, u.name as user_name, u.profile_picture as user_avatar
    FROM storage_access sa
    JOIN users u ON sa.user_id = u.id
    WHERE sa.${isCollection ? 'collection_id' : 'key_value_entry_id'} = ?
    ORDER BY sa.created_at DESC
  `;
  const { results } = await env.DB.prepare(query).bind(resourceId).all<StorageAccessJoined>();
  return results;
}

/**
 * Checks effective access level for a user on a resource.
 * Returns null if no access.
 * Returns 'ADMIN' if user is global admin or owner.
 * Resolves inheritance (Entry inherits Collection) and overrides (Entry > Collection).
 */
export async function checkAccess(
  env: Env,
  user: User,
  resourceType: 'collection' | 'entry',
  resourceId: number
): Promise<AccessLevel | null> {
  // 1. Global Admin
  if (isUserAdmin(user)) return 'ADMIN';

  // 2. Owner Check & Parent Resolution
  let ownerId: number;
  let parentCollectionId: number | null = null;

  if (resourceType === 'collection') {
    const col = await getCollection(env, resourceId);
    if (!col) return null; // Resource doesn't exist, effectively no access
    ownerId = col.user_id;
  } else {
    const entry = await getEntryById(env, resourceId);
    if (!entry) return null;
    ownerId = entry.user_id;
    parentCollectionId = entry.collection_id;
  }

  if (user.id === ownerId) return 'ADMIN';

  // 3. Direct Access Rule
  const directAccess = await env.DB.prepare(`
    SELECT access_level FROM storage_access
    WHERE user_id = ? AND ${resourceType === 'collection' ? 'collection_id' : 'key_value_entry_id'} = ?
  `).bind(user.id, resourceId).first<{ access_level: AccessLevel }>();

  if (directAccess) {
    return directAccess.access_level;
  }

  // 4. Inherited Access (Entry only)
  if (resourceType === 'entry' && parentCollectionId) {
    const inheritedAccess = await env.DB.prepare(`
        SELECT access_level FROM storage_access
        WHERE user_id = ? AND collection_id = ?
    `).bind(user.id, parentCollectionId).first<{ access_level: AccessLevel }>();

    if (inheritedAccess) {
        return inheritedAccess.access_level;
    }
  }

  return null;
}

export function canView(level: AccessLevel | null): boolean {
    return level === 'READONLY' || level === 'READWRITE' || level === 'ADMIN';
}

export function canEdit(level: AccessLevel | null): boolean {
    return level === 'READWRITE' || level === 'ADMIN';
}

export function canDelete(level: AccessLevel | null): boolean {
    return level === 'ADMIN';
}

export function canManageAccess(level: AccessLevel | null): boolean {
    return level === 'ADMIN';
}
