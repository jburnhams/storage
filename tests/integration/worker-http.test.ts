import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import {
  createMiniflareInstance,
  runMigrations,
  seedTestData,
  cleanDatabase,
  UserRow,
} from "./setup";

/**
 * Bundle the worker for testing
 */
async function bundleWorker(): Promise<string> {
  const outdir = join(process.cwd(), ".test-build");

  if (!existsSync(outdir)) {
    mkdirSync(outdir, { recursive: true });
  }

  await build({
    entryPoints: [join(process.cwd(), "src", "worker.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: join(outdir, "worker.js"),
    external: ["cloudflare:*"],
  });

  return readFileSync(join(outdir, "worker.js"), "utf-8");
}

describe("Worker HTTP Integration Tests", () => {
  let mf: Miniflare;
  let db: D1Database;
  let workerScript: string;

  beforeAll(async () => {
    // Bundle the worker once for all tests
    workerScript = await bundleWorker();

    mf = await createMiniflareInstance({
      secrets: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    });

    db = await mf.getD1Database("DB");
    await runMigrations(db);

    // Load the bundled worker
    await mf.setOptions({
      modules: true,
      script: workerScript,
      d1Databases: { DB: ":memory:" },
      bindings: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    });
  });

  beforeEach(async () => {
    // Get fresh DB reference after setOptions
    db = await mf.getD1Database("DB");
    await cleanDatabase(db);
    await seedTestData(db);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  describe("Health Check Endpoint", () => {
    it("should return 200 OK for /health", async () => {
      const response = await mf.dispatchFetch("http://localhost/health");

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
    });
  });

  describe("Frontend Routes", () => {
    it("should serve frontend at root path", async () => {
      const response = await mf.dispatchFetch("http://localhost/");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    it("should serve frontend at /index.html", async () => {
      const response = await mf.dispatchFetch("http://localhost/index.html");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });
  });

  describe("API Endpoints - Authentication Required", () => {
    it("should return 401 for /api/user without session", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/user");

      expect(response.status).toBe(401);
      const data = await response.json() as any;
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("should return user data with valid session cookie", async () => {
      // Get a valid session from seeded data
      const session = await db
        .prepare(`SELECT id FROM sessions WHERE id = ?`)
        .bind("test-session-admin")
        .first();

      expect(session).toBeDefined();

      const response = await mf.dispatchFetch("http://localhost/api/user", {
        headers: {
          Cookie: `storage_session=${(session as any).id}`,
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.email).toBe("admin@test.com");
      expect(data.is_admin).toBe(true);
    });

    it("should return 401 for /api/session without session", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/session");

      expect(response.status).toBe(401);
    });

    it("should return session data with valid session cookie", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/session", {
        headers: {
          Cookie: "storage_session=test-session-user",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.id).toBe("test-session-user");
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe("user@test.com");
    });
  });

  describe("Admin Endpoints", () => {
    it("should return 401 for /api/users without session", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/users");

      expect(response.status).toBe(401);
    });

    it("should return 403 for /api/users with non-admin session", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/users", {
        headers: {
          Cookie: "storage_session=test-session-user",
        },
      });

      expect(response.status).toBe(403);
      const data = await response.json() as any;
      expect(data.error).toBe("FORBIDDEN");
    });

    it("should return users list with admin session", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/users", {
        headers: {
          Cookie: "storage_session=test-session-admin",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);
      expect(data.some((u: any) => u.email === "admin@test.com")).toBe(true);
    });

    it("should return 401 for /api/sessions without session", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/sessions");

      expect(response.status).toBe(401);
    });

    it("should return sessions list with admin session", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/sessions", {
        headers: {
          Cookie: "storage_session=test-session-admin",
        },
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);
    });

    it("should return 405 for /api/admin/promote with GET method", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/admin/promote", {
        method: "GET",
        headers: {
          Cookie: "storage_session=test-session-admin",
        },
      });

      expect(response.status).toBe(405);
    });

    it("should promote user to admin with valid request", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/admin/promote", {
        method: "POST",
        headers: {
          Cookie: "storage_session=test-session-admin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "user@test.com" }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as any;
      expect(data.success).toBe(true);

      // Verify user was promoted
      const user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind("user@test.com")
        .first() as unknown as UserRow;

      expect(user.is_admin).toBe(1);
    });

    it("should return 400 for /api/admin/promote with invalid email", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/admin/promote", {
        method: "POST",
        headers: {
          Cookie: "storage_session=test-session-admin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "" }),
      });

      expect(response.status).toBe(400);
    });

    it("should return 404 for /api/admin/promote with non-existent email", async () => {
      const response = await mf.dispatchFetch("http://localhost/api/admin/promote", {
        method: "POST",
        headers: {
          Cookie: "storage_session=test-session-admin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "nonexistent@test.com" }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("Logout Endpoint", () => {
    it("should return 405 for /auth/logout with GET method", async () => {
      const response = await mf.dispatchFetch("http://localhost/auth/logout", {
        method: "GET",
      });

      expect(response.status).toBe(405);
    });

    it("should handle logout request", async () => {
      const response = await mf.dispatchFetch("http://localhost/auth/logout", {
        method: "POST",
        headers: {
          Cookie: "storage_session=test-session-user",
        },
      });

      // Should redirect or return success
      expect([200, 302]).toContain(response.status);

      // Cookie clearing is tested in unit tests
      // HTTP integration test just verifies the endpoint responds correctly
    });
  });

  describe("Unknown Routes", () => {
    it("should return 404 for unknown paths", async () => {
      const response = await mf.dispatchFetch("http://localhost/nonexistent");

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");
    });
  });
});
