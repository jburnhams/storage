import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
import {
  createMiniflareInstance,
  seedTestData,
  cleanDatabase,
  UserRow,
  bundleWorker,
} from "./setup";

describe("User Detail API Integration", () => {
  let mf: Miniflare;
  let db: D1Database;
  let workerScript: string;
  let persistPath: string;
  let adminId: number;
  let userId: number;

  beforeAll(async () => {
    // Bundle the worker once for all tests
    workerScript = await bundleWorker();

    const result = await createMiniflareInstance({
      secrets: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
      script: workerScript,
      isolate: true
    });
    mf = result.mf;
    persistPath = result.persistPath;

    // Get DB reference
    db = await mf.getD1Database("DB");
  });

  beforeEach(async () => {
    // We don't need to re-get DB if mf hasn't changed, but it doesn't hurt
    db = await mf.getD1Database("DB");
    await cleanDatabase(db);
    await seedTestData(db);

    // Fetch IDs for seeded users
    const admin = await db.prepare("SELECT id FROM users WHERE email = 'admin@test.com'").first<UserRow>();
    const user = await db.prepare("SELECT id FROM users WHERE email = 'user@test.com'").first<UserRow>();

    if (!admin || !user) throw new Error("Seeded users not found");
    adminId = admin.id;
    userId = user.id;
  });

  afterAll(async () => {
    if (mf) await mf.dispose();
    try {
      const { rmSync } = await import("fs");
      if (persistPath) rmSync(persistPath, { recursive: true, force: true });
    } catch (e) {
      console.error("Failed to clean up D1 persistence:", e);
    }
  });

  it("should allow admin to access their own details", async () => {
    const response = await mf.dispatchFetch(`http://localhost/api/users/${adminId}`, {
      headers: {
        Cookie: "storage_session=test-session-admin",
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.id).toBe(adminId);
    expect(data.email).toBe("admin@test.com");
  });

  it("should allow admin to access other user details", async () => {
    const response = await mf.dispatchFetch(`http://localhost/api/users/${userId}`, {
      headers: {
        Cookie: "storage_session=test-session-admin",
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.id).toBe(userId);
    expect(data.email).toBe("user@test.com");
  });

  it("should allow standard user to access their own details", async () => {
    const response = await mf.dispatchFetch(`http://localhost/api/users/${userId}`, {
      headers: {
        Cookie: "storage_session=test-session-user",
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.id).toBe(userId);
    expect(data.email).toBe("user@test.com");
  });

  it("should forbid standard user from accessing other user details", async () => {
    const response = await mf.dispatchFetch(`http://localhost/api/users/${adminId}`, {
      headers: {
        Cookie: "storage_session=test-session-user",
      },
    });

    expect(response.status).toBe(403);
    const data = await response.json() as any;
    expect(data.error).toBe("FORBIDDEN");
  });

  it("should return 404 for non-existent user (as admin)", async () => {
    const response = await mf.dispatchFetch(`http://localhost/api/users/999999`, {
      headers: {
        Cookie: "storage_session=test-session-admin",
      },
    });

    expect(response.status).toBe(404);
  });

  it("should return 403 for non-existent user (as standard user)", async () => {
    // Standard users can't see anyone else, so accessing a non-existent ID is forbidden
    const response = await mf.dispatchFetch(`http://localhost/api/users/999999`, {
      headers: {
        Cookie: "storage_session=test-session-user",
      },
    });

    expect(response.status).toBe(403);
  });
});
