import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createMiniflareInstance,
  bundleWorker,
  seedTestData,
  cleanDatabase,
} from "./setup";
import { Miniflare } from "miniflare";
import { rmSync } from "fs";

describe("Collection Export & Secret Bypass", () => {
  let mf: Miniflare;
  let persistPath: string;
  let workerUrl: string;
  let adminCookie: string;
  let userCookie: string;

  beforeAll(async () => {
    const script = await bundleWorker();
    const result = await createMiniflareInstance({ script });
    mf = result.mf;
    persistPath = result.persistPath;
    workerUrl = "http://localhost:8787";
  });

  afterAll(async () => {
    await mf.dispose();
    rmSync(persistPath, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const db = await mf.getD1Database("DB");
    await cleanDatabase(db);
    await seedTestData(db);

    // Create session cookies
    adminCookie = "storage_session=test-session-admin";
    userCookie = "storage_session=test-session-user";
  });

  async function createCollection(cookie: string, name: string) {
    const res = await mf.dispatchFetch(`${workerUrl}/api/collections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ name }),
    });
    return await res.json() as any;
  }

  it("should allow export with valid session (owner)", async () => {
    // 1. User creates collection
    const collection = await createCollection(userCookie, "User Collection");
    expect(collection.id).toBeDefined();

    // 2. User tries to export
    const res = await mf.dispatchFetch(`${workerUrl}/api/collections/${collection.id}`, {
      headers: { Cookie: userCookie },
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(collection.id);
    expect(data.contents).toBeDefined();
  });

  it("should allow export with valid session (admin)", async () => {
    // 1. User creates collection
    const collection = await createCollection(userCookie, "User Collection");

    // 2. Admin tries to export
    const res = await mf.dispatchFetch(`${workerUrl}/api/collections/${collection.id}`, {
      headers: { Cookie: adminCookie },
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(collection.id);
  });

  it("should deny export with valid session (wrong user)", async () => {
    // 1. Admin creates collection
    const collection = await createCollection(adminCookie, "Admin Collection");

    // 2. User tries to export
    const res = await mf.dispatchFetch(`${workerUrl}/api/collections/${collection.id}`, {
      headers: { Cookie: userCookie },
    });

    expect(res.status).toBe(403);
  });

  it("should allow export with valid secret (no session)", async () => {
    // 1. User creates collection
    const collection = await createCollection(userCookie, "Secret Collection");
    const secret = collection.secret;
    expect(secret).toBeDefined();

    // 2. Anonymous request with secret
    const res = await mf.dispatchFetch(`${workerUrl}/api/collections/${collection.id}?secret=${secret}`, {
        method: 'GET'
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(collection.id);
    expect(data.contents).toBeDefined();
  });

  it("should deny export with invalid secret (no session)", async () => {
    // 1. User creates collection
    const collection = await createCollection(userCookie, "Protected Collection");

    // 2. Anonymous request with wrong secret
    const res = await mf.dispatchFetch(`${workerUrl}/api/collections/${collection.id}?secret=wrongsecret`, {
        method: 'GET'
    });

    // Should be 403 (Forbidden) because 401 implies auth required, but here we tried auth (via secret) and failed.
    // Or 401 if we consider it "failed authentication".
    // My implementation: if !isAuthorized && !session -> 401. If session but !isAuthorized -> 403.
    // Wait, let's check implementation logic:
    /*
        if (!isAuthorized) {
            if (!session) {
                return c.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
            }
            return c.json({ error: 'FORBIDDEN', message: 'Access denied' }, 403);
        }
    */
    // So with no session, it returns 401.
    expect(res.status).toBe(401);
  });

  it("should deny export with invalid secret (valid session, wrong user)", async () => {
    // 1. Admin creates collection
    const collection = await createCollection(adminCookie, "Admin Collection");

    // 2. User tries to export with wrong secret
    const res = await mf.dispatchFetch(`${workerUrl}/api/collections/${collection.id}?secret=wrong`, {
      headers: { Cookie: userCookie },
    });

    // Has session, but not authorized -> 403.
    expect(res.status).toBe(403);
  });

  it("should allow export with valid secret (valid session, wrong user)", async () => {
      // 1. Admin creates collection
      const collection = await createCollection(adminCookie, "Admin Collection");
      const secret = collection.secret;

      // 2. User tries to export with VALID secret
      const res = await mf.dispatchFetch(`${workerUrl}/api/collections/${collection.id}?secret=${secret}`, {
        headers: { Cookie: userCookie },
      });

      expect(res.status).toBe(200);
  });

  it("should return 404 for removed public route", async () => {
     // 1. User creates collection to get a secret
     const collection = await createCollection(userCookie, "Test");
     const secret = collection.secret;

     const res = await mf.dispatchFetch(`${workerUrl}/api/public/collection?secret=${secret}`);
     expect(res.status).toBe(404);
  });
});
