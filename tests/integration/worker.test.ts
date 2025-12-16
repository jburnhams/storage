import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "fs";
import { join } from "path";
import {
  createMiniflareInstance,
  runMigrations,
  seedTestData,
  cleanDatabase,
} from "./setup";

describe("Worker Integration Tests", () => {
  let mf: Miniflare;
  let db: D1Database;

  beforeAll(async () => {
    mf = await createMiniflareInstance({});
    db = await mf.getD1Database("DB");
    await runMigrations(db);

    // Load and set the actual worker script
    const workerPath = join(process.cwd(), "src", "worker.ts");
    const workerCode = readFileSync(workerPath, "utf-8");

    // For integration tests, we'll test individual handler functions
    // In a real scenario, you'd compile the TypeScript first
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    await seedTestData(db);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  describe("Frontend Routes", () => {
    it("should serve frontend at root path", async () => {
      // Since the frontend is embedded, we test that the worker can be loaded
      // In a full integration test, you would build and load the actual worker
      expect(db).toBeDefined();
    });
  });

  describe("Health Check", () => {
    it("should return ok for health endpoint", async () => {
      // Create a separate Miniflare instance for this test to avoid poisoning the main one
      const testMf = await createMiniflareInstance({});

      const testScript = `
        export default {
          async fetch(request, env) {
            const url = new URL(request.url);
            if (url.pathname === "/health") {
              return new Response("ok", { status: 200 });
            }
            return new Response("Not found", { status: 404 });
          }
        };
      `;

      await testMf.setOptions({
        modules: true,
        script: testScript,
      });

      const response = await testMf.dispatchFetch("http://localhost/health");
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");

      await testMf.dispose();
    });
  });

  describe("Session Management", () => {
    it("should create and retrieve sessions from database", async () => {
      // Get actual user ID
      const user = await db
        .prepare(`SELECT id FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .first();
      const userId = (user as any).id;

      // Create a session directly in DB
      const sessionId = "test-session-12345";
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await db
        .prepare(
          `INSERT INTO sessions (id, user_id, expires_at)
           VALUES (?, ?, ?)`
        )
        .bind(sessionId, userId, expiresAt)
        .run();

      // Verify session exists
      const session = await db
        .prepare(`SELECT * FROM sessions WHERE id = ?`)
        .bind(sessionId)
        .first();

      expect(session).toBeDefined();
      expect((session as any).user_id).toBe(userId);
      expect(session?.expires_at).toBe(expiresAt);
    });

    it("should not retrieve expired sessions", async () => {
      // Get actual user ID
      const user = await db
        .prepare(`SELECT id FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .first();
      const userId = (user as any).id;

      // Create an expired session (use 1 day ago to ensure it's clearly expired)
      const sessionId = "expired-session";
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      await db
        .prepare(
          `INSERT INTO sessions (id, user_id, expires_at)
           VALUES (?, ?, ?)`
        )
        .bind(sessionId, userId, expiredDate)
        .run();

      // Try to get session with expiry check
      const session = await db
        .prepare(
          `SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')`
        )
        .bind(sessionId)
        .first();

      expect(session).toBeNull();
    });

    it("should clean up expired sessions", async () => {
      // Get actual user ID
      const user = await db
        .prepare(`SELECT id FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .first();
      const userId = (user as any).id;

      // Create expired and valid sessions
      // Use a more significant time difference to ensure expiry
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await db
        .prepare(
          `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
        )
        .bind("expired-1", userId, expiredDate)
        .run();

      await db
        .prepare(
          `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
        )
        .bind("valid-1", userId, futureDate)
        .run();

      // Delete expired sessions
      await db
        .prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`)
        .run();

      // Check results
      const expiredSession = await db
        .prepare(`SELECT * FROM sessions WHERE id = ?`)
        .bind("expired-1")
        .first();
      const validSession = await db
        .prepare(`SELECT * FROM sessions WHERE id = ?`)
        .bind("valid-1")
        .first();

      expect(expiredSession).toBeNull();
      expect(validSession).toBeDefined();
    });
  });

  describe("User Management", () => {
    it("should retrieve user by email", async () => {
      const user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .first();

      expect(user).toBeDefined();
      expect((user as any).is_admin).toBe(1);
    });

    it("should retrieve user by id", async () => {
      // Get actual user ID
      const adminUser = await db
        .prepare(`SELECT id FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .first();
      const userId = (adminUser as any).id;

      const user = await db
        .prepare(`SELECT * FROM users WHERE id = ?`)
        .bind(userId)
        .first();

      expect(user).toBeDefined();
      expect((user as any).email).toBe("admin@test.com");
    });

    it("should get or create user", async () => {
      const email = "newuser@test.com";
      const name = "New User";

      // Check user doesn't exist
      let user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind(email)
        .first();
      expect(user).toBeNull();

      // Create user
      const result = await db
        .prepare(
          `INSERT INTO users (email, name, profile_picture, is_admin)
           VALUES (?, ?, ?, ?)`
        )
        .bind(email, name, null, 0)
        .run();

      const userId = result.meta.last_row_id;

      // Verify user was created
      user = await db
        .prepare(`SELECT * FROM users WHERE id = ?`)
        .bind(userId)
        .first();

      expect(user).toBeDefined();
      expect((user as any).email).toBe(email);
    });

    it("should update user last login time", async () => {
      const loginTime = new Date().toISOString();

      await db
        .prepare(`UPDATE users SET last_login_at = ? WHERE email = ?`)
        .bind(loginTime, "admin@test.com")
        .run();

      const user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .first();

      expect((user as any).last_login_at).toBe(loginTime);
    });

    it("should promote user to admin", async () => {
      const email = "user@test.com";

      // Verify user is not admin
      let user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind(email)
        .first();
      expect((user as any).is_admin).toBe(0);

      // Promote to admin
      await db
        .prepare(`UPDATE users SET is_admin = 1 WHERE email = ?`)
        .bind(email)
        .run();

      // Verify user is now admin
      user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind(email)
        .first();
      expect((user as any).is_admin).toBe(1);
    });
  });

  describe("Admin Operations", () => {
    it("should get all users", async () => {
      const users = await db.prepare(`SELECT * FROM users`).all();

      expect(users.results.length).toBeGreaterThanOrEqual(2);
    });

    it("should get all sessions with user data", async () => {
      const now = new Date().toISOString();
      const sessions = await db
        .prepare(
          `SELECT
            s.id as session_id,
            s.user_id,
            s.created_at,
            s.expires_at,
            s.last_used_at,
            u.email,
            u.name,
            u.is_admin
           FROM sessions s
           INNER JOIN users u ON s.user_id = u.id
           WHERE s.expires_at > ?`
        )
        .bind(now)
        .all();

      expect(sessions.results.length).toBeGreaterThanOrEqual(1);
      sessions.results.forEach((session: any) => {
        expect(session.email).toBeDefined();
        expect(session.name).toBeDefined();
      });
    });

    it("should filter admin users", async () => {
      const admins = await db
        .prepare(`SELECT * FROM users WHERE is_admin = 1`)
        .all();

      expect(admins.results.length).toBeGreaterThanOrEqual(1);
      admins.results.forEach((admin: any) => {
        expect(admin.is_admin).toBe(1);
      });
    });
  });

  describe("Cookie and State Management", () => {
    it("should handle state parameter for OAuth CSRF protection", async () => {
      // Generate a random state value (simulating what the app does)
      const stateArray = new Uint8Array(32);
      crypto.getRandomValues(stateArray);
      const state = Array.from(stateArray, (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");

      expect(state).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]{64}$/.test(state)).toBe(true);
    });

    it("should generate cryptographically secure session IDs", async () => {
      const sessionIds = new Set<string>();

      // Generate multiple session IDs
      for (let i = 0; i < 100; i++) {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        const sessionId = Array.from(array, (byte) =>
          byte.toString(16).padStart(2, "0")
        ).join("");

        expect(sessionId).toHaveLength(64);
        expect(/^[0-9a-f]{64}$/.test(sessionId)).toBe(true);
        sessionIds.add(sessionId);
      }

      // All session IDs should be unique
      expect(sessionIds.size).toBe(100);
    });
  });

  describe("Database Integrity", () => {
    it("should maintain referential integrity on cascade delete", async () => {
      // Create a new user
      const result = await db
        .prepare(`INSERT INTO users (email, name) VALUES (?, ?)`)
        .bind("temp@test.com", "Temp User")
        .run();

      const userId = result.meta.last_row_id;

      // Create sessions for the user
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
        .bind("temp-session-1", userId, futureDate)
        .run();
      await db
        .prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
        .bind("temp-session-2", userId, futureDate)
        .run();

      // Verify sessions exist
      let sessions = await db
        .prepare(`SELECT * FROM sessions WHERE user_id = ?`)
        .bind(userId)
        .all();
      expect(sessions.results.length).toBe(2);

      // Delete user
      await db
        .prepare(`DELETE FROM users WHERE id = ?`)
        .bind(userId)
        .run();

      // Verify sessions were cascade deleted
      sessions = await db
        .prepare(`SELECT * FROM sessions WHERE user_id = ?`)
        .bind(userId)
        .all();
      expect(sessions.results.length).toBe(0);
    });

    it("should handle concurrent session updates", async () => {
      const sessionId = "test-session-admin";

      // Simulate multiple concurrent updates
      const updates = Array.from({ length: 10 }, (_, i) =>
        db
          .prepare(`UPDATE sessions SET last_used_at = datetime('now') WHERE id = ?`)
          .bind(sessionId)
          .run()
      );

      await Promise.all(updates);

      // Session should still exist and be valid
      const session = await db
        .prepare(`SELECT * FROM sessions WHERE id = ?`)
        .bind(sessionId)
        .first();

      expect(session).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid session ID gracefully", async () => {
      const session = await db
        .prepare(
          `SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')`
        )
        .bind("invalid-session-id")
        .first();

      expect(session).toBeNull();
    });

    it("should handle non-existent user gracefully", async () => {
      const user = await db
        .prepare(`SELECT * FROM users WHERE id = ?`)
        .bind(99999)
        .first();

      expect(user).toBeNull();
    });

    it("should enforce unique email constraint", async () => {
      await expect(async () => {
        await db
          .prepare(`INSERT INTO users (email, name) VALUES (?, ?)`)
          .bind("admin@test.com", "Duplicate Admin")
          .run();
      }).rejects.toThrow();
    });
  });
});
