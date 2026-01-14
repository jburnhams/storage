import { env, applyD1Migrations, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/worker";
import { createCollection, createEntry } from "../../src/storage";
import { grantAccess } from "../../src/permissions";

// Helper to make requests
async function request(path: string, options: RequestInit = {}, cookie?: string) {
  const headers: any = options.headers || {};
  if (cookie) headers['Cookie'] = cookie;

  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, { ...options, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("Access Shared Listing & Bulk", () => {
  let owner: any;
  let viewer: any;
  let ownerCookie: string;
  let viewerCookie: string;
  let collection: any;
  let entry1: any;
  let entry2: any;

  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

    // Create Users
    const { createUser, createSession } = await import("../../src/session");

    owner = await createUser({ email: "owner@test.com", name: "Owner", user_type: "STANDARD" }, env);
    const s1 = await createSession(owner.id, env);
    ownerCookie = `storage_session=${s1.id}`;

    viewer = await createUser({ email: "viewer@test.com", name: "Viewer", user_type: "STANDARD" }, env);
    const s2 = await createSession(viewer.id, env);
    viewerCookie = `storage_session=${s2.id}`;

    // Setup Data
    collection = await createCollection(env, owner.id, "Shared Col");
    entry1 = await createEntry(env, owner.id, "e1.txt", "text/plain", "val1", null, undefined, collection.id);
    entry2 = await createEntry(env, owner.id, "e2.txt", "text/plain", "val2", null, undefined, collection.id);

    // Grant Access
    await grantAccess(env, viewer.id, "collection", collection.id, "READONLY");
  });

  it("should list shared entries in collection", async () => {
    const res = await request(`/api/storage/entries?collection_id=${collection.id}`, {}, viewerCookie);
    expect(res.status).toBe(200);
    const entries = await res.json() as any[];
    expect(entries.length).toBe(2);
    expect(entries.map((e: any) => e.id)).toContain(entry1.id);
  });

  it("should list shared standalone entries in root listing", async () => {
    // Create standalone entry
    const entry3 = await createEntry(env, owner.id, "standalone.txt", "text/plain", "val3", null);
    await grantAccess(env, viewer.id, "entry", entry3.id, "READONLY");

    const res = await request(`/api/storage/entries`, {}, viewerCookie);
    expect(res.status).toBe(200);
    const entries = await res.json() as any[];

    // Should see e3
    const ids = entries.map((e: any) => e.id);
    expect(ids).toContain(entry3.id);
    // Should NOT see e1/e2 (they are in collection)
    expect(ids).not.toContain(entry1.id);
  });

  it("should allow bulk download of shared entries", async () => {
    const res = await request("/api/storage/bulk/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_ids: [entry1.id, entry2.id] })
    }, viewerCookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
  });

  it("should forbid bulk delete of shared entries (READONLY)", async () => {
    const res = await request("/api/storage/bulk/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_ids: [entry1.id, entry2.id] })
    }, viewerCookie);

    // It returns 200 but might not delete anything if filtered out?
    // Code says: `if (!canDelete(level)) continue;`
    // It returns: `message: 'Entries deleted successfully'` even if nothing deleted (generic success).
    // So we verify entry still exists.

    expect(res.status).toBe(200);

    // Verify entry1 exists
    const check = await request(`/api/storage/entry/${entry1.id}`, {}, ownerCookie);
    expect(check.status).toBe(200);
  });
});
