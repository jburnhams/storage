import { env, applyD1Migrations, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/worker";

// Helper to make requests
async function request(path: string, options: RequestInit = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, options), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// Helper to create session and get headers
async function getAuthHeaders(userParams: any) {
  // We need to create a user and session directly in DB since we can't easily login via API without OAuth
  // Import helpers from source?
  // We can import from src/session.ts IF we are in the same isolate.
  // vitest-pool-workers allows this.

  const { createUser, createSession } = await import("../../src/session");
  const user = await createUser(userParams, env);
  const session = await createSession(user.id, env);

  return {
    headers: { 'Cookie': `storage_session=${session.id}` },
    user
  };
}

describe("Access API Integration", () => {
  let ownerAuth: any;
  let viewerAuth: any;
  let strangerAuth: any;

  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    ownerAuth = await getAuthHeaders({ email: "owner@test.com", name: "Owner", user_type: "STANDARD" });
    viewerAuth = await getAuthHeaders({ email: "viewer@test.com", name: "Viewer", user_type: "STANDARD" });
    strangerAuth = await getAuthHeaders({ email: "stranger@test.com", name: "Stranger", user_type: "STANDARD" });
  });

  it("should enforce collection access controls", async () => {
    // 1. Owner creates collection
    const createRes = await request("/api/collections", {
        method: "POST",
        headers: { ...ownerAuth.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Secure Col" })
    });
    expect(createRes.status).toBe(200);
    const col = await createRes.json() as any;

    // 2. Stranger tries to view -> 403/404 (403 if authenticated but denied, but route logic says 403)
    const viewRes = await request(`/api/collections/${col.id}`, { ...strangerAuth });
    expect(viewRes.status).toBe(403);

    // 3. Grant Access
    const grantRes = await request(`/api/access/collection/${col.id}`, {
        method: "POST",
        headers: { ...ownerAuth.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: viewerAuth.user.id, access_level: "READONLY" })
    });
    expect(grantRes.status).toBe(200);

    // 4. Viewer tries to view -> 200
    const viewRes2 = await request(`/api/collections/${col.id}`, { ...viewerAuth });
    expect(viewRes2.status).toBe(200);

    // 5. Viewer tries to edit -> 403
    const editRes = await request(`/api/collections/${col.id}`, {
        method: "PUT",
        headers: { ...viewerAuth.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hacked" })
    });
    expect(editRes.status).toBe(403);

    // 6. Upgrade Access
    await request(`/api/access/collection/${col.id}`, {
        method: "POST",
        headers: { ...ownerAuth.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: viewerAuth.user.id, access_level: "READWRITE" })
    });

    // 7. Viewer tries to edit -> 200
    const editRes2 = await request(`/api/collections/${col.id}`, {
        method: "PUT",
        headers: { ...viewerAuth.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" })
    });
    expect(editRes2.status).toBe(200);

    // 8. Viewer tries to delete -> 403 (Need ADMIN)
    const deleteRes = await request(`/api/collections/${col.id}`, {
        method: "DELETE",
        headers: { ...viewerAuth.headers }
    });
    expect(deleteRes.status).toBe(403);
  });

  it("should enforce entry inheritance and overrides", async () => {
      // 1. Owner creates collection
      const createRes = await request("/api/collections", {
          method: "POST",
          headers: { ...ownerAuth.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Parent Col" })
      });
      const col = await createRes.json() as any;

      // 2. Owner creates entry in collection
      // Use internal `createEntry` to setup data, then test API access.
      const { createEntry } = await import("../../src/storage");
      const entry = await createEntry(env, ownerAuth.user.id, "child.txt", "text/plain", "content", null, undefined, col.id);

      // 3. Grant Collection READONLY to Viewer
      await request(`/api/access/collection/${col.id}`, {
          method: "POST",
          headers: { ...ownerAuth.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: viewerAuth.user.id, access_level: "READONLY" })
      });

      // 4. Viewer can read entry
      const readRes = await request(`/api/storage/entry/${entry.id}`, { ...viewerAuth });
      expect(readRes.status).toBe(200);

      // 5. Viewer cannot update entry
      const updateRes = await request(`/api/storage/entry/${entry.id}`, {
          method: "PUT",
          headers: { ...viewerAuth.headers }, // Missing body/form but permissions check happens early
      });
      // Note: PUT expects multipart or something.
      // But 403 check should be before body validation if possible?
      // Zod middleware might validate param first.
      // My route: validation happens.
      // If validation fails (400), we don't know if 403.
      // So valid body needed.
      const fd = new FormData();
      fd.append("string_value", "new content");
      const updateRes2 = await request(`/api/storage/entry/${entry.id}`, {
           method: "PUT",
           headers: { ...viewerAuth.headers },
           body: fd // fetch supports FormData
      });
      expect(updateRes2.status).toBe(403);

      // 6. Grant Entry READWRITE
      await request(`/api/access/entry/${entry.id}`, {
          method: "POST",
          headers: { ...ownerAuth.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: viewerAuth.user.id, access_level: "READWRITE" })
      });

      // 7. Viewer can update entry
      const updateRes3 = await request(`/api/storage/entry/${entry.id}`, {
           method: "PUT",
           headers: { ...viewerAuth.headers },
           body: fd
      });
      expect(updateRes3.status).toBe(200);
  });
});
