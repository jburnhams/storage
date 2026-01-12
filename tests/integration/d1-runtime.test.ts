import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
import {
  createMiniflareInstance,
  seedTestData,
  cleanDatabase,
} from "./setup";

describe("D1 Runtime Operations", () => {
  let mf: Miniflare;
  let db: D1Database;
  let persistPath: string;

  beforeAll(async () => {
    const result = await createMiniflareInstance({});
    mf = result.mf;
    persistPath = result.persistPath;
    db = await mf.getD1Database("DB");
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await mf.dispose();
    // Cleanup persistence directory
    try {
      const { rmSync } = await import("fs");
      rmSync(persistPath, { recursive: true, force: true });
    } catch (e) {
      console.error("Failed to clean up D1 persistence:", e);
    }
  });

  describe("User CRUD Operations", () => {
    it("should insert a new user", async () => {
      const result = await db
        .prepare(
          `INSERT INTO users (email, name, profile_picture, user_type)
           VALUES (?, ?, ?, ?)`
        )
        .bind(
          "newuser@example.com",
          "New User",
          "https://example.com/pic.jpg",
          'STANDARD'
        )
        .run();

      expect(result.success).toBe(true);
      expect(result.meta.last_row_id).toBeDefined();

      // Verify insertion
      const user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind("newuser@example.com")
        .first();

      expect(user).toBeDefined();
      expect(user?.email).toBe("newuser@example.com");
      expect(user?.name).toBe("New User");
      expect(user?.user_type).toBe('STANDARD');
    });

    it("should query users by email", async () => {
      await seedTestData(db);

      const user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .first();

      expect(user).toBeDefined();
      expect(user?.email).toBe("admin@test.com");
      expect(user?.name).toBe("Test Admin");
      expect(user?.user_type).toBe('ADMIN');
    });

    it("should query all admin users", async () => {
      await seedTestData(db);

      const admins = await db
        .prepare(`SELECT * FROM users WHERE user_type = 'ADMIN'`)
        .all();

      expect(admins.results.length).toBeGreaterThanOrEqual(1);
      expect(admins.results.every((u: any) => u.user_type === 'ADMIN')).toBe(true);
    });

    it("should update user information", async () => {
      await seedTestData(db);

      const result = await db
        .prepare(
          `UPDATE users SET name = ?, updated_at = datetime('now') WHERE email = ?`
        )
        .bind("Updated Name", "user@test.com")
        .run();

      expect(result.success).toBe(true);

      const user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind("user@test.com")
        .first();

      expect(user?.name).toBe("Updated Name");
    });

    it("should update last_login_at timestamp", async () => {
      await seedTestData(db);

      const loginTime = new Date().toISOString();
      await db
        .prepare(`UPDATE users SET last_login_at = ? WHERE email = ?`)
        .bind(loginTime, "user@test.com")
        .run();

      const user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind("user@test.com")
        .first();

      expect(user?.last_login_at).toBe(loginTime);
    });

    it("should delete a user", async () => {
      await seedTestData(db);

      await db
        .prepare(`DELETE FROM users WHERE email = ?`)
        .bind("user@test.com")
        .run();

      const user = await db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind("user@test.com")
        .first();

      expect(user).toBeNull();
    });
  });

  describe("Session Operations", () => {
    it("should create a new session", async () => {
      await seedTestData(db);

      // Get actual user ID
      const user = await db
        .prepare(`SELECT id FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .first();
      const userId = (user as any).id;

      const sessionId = "new-session-123";
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const result = await db
        .prepare(
          `INSERT INTO sessions (id, user_id, expires_at)
           VALUES (?, ?, ?)`
        )
        .bind(sessionId, userId, expiresAt)
        .run();

      expect(result.success).toBe(true);

      const session = await db
        .prepare(`SELECT * FROM sessions WHERE id = ?`)
        .bind(sessionId)
        .first();

      expect(session).toBeDefined();
      expect(session?.user_id).toBe(userId);
      expect(session?.expires_at).toBe(expiresAt);
    });

    it("should query session with user data", async () => {
      await seedTestData(db);

      const result = await db
        .prepare(
          `SELECT s.*, u.email, u.name, u.profile_picture, u.user_type
           FROM sessions s
           INNER JOIN users u ON s.user_id = u.id
           WHERE s.id = ?`
        )
        .bind("test-session-admin")
        .first();

      expect(result).toBeDefined();
      expect(result?.email).toBe("admin@test.com");
      expect(result?.user_type).toBe('ADMIN');
    });

    it("should update session last_used_at timestamp", async () => {
      await seedTestData(db);

      const newTime = new Date().toISOString();
      await db
        .prepare(`UPDATE sessions SET last_used_at = ? WHERE id = ?`)
        .bind(newTime, "test-session-user")
        .run();

      const session = await db
        .prepare(`SELECT * FROM sessions WHERE id = ?`)
        .bind("test-session-user")
        .first();

      expect(session?.last_used_at).toBe(newTime);
    });

    it("should delete expired sessions", async () => {
      await seedTestData(db);

      // Get actual user ID
      const user = await db
        .prepare(`SELECT id FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .first();
      const userId = (user as any).id;

      // Create expired session (use 1 day ago to ensure it's clearly expired)
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await db
        .prepare(
          `INSERT INTO sessions (id, user_id, expires_at)
           VALUES (?, ?, ?)`
        )
        .bind("expired-session", userId, expiredDate)
        .run();

      // Delete expired sessions
      const now = new Date().toISOString();
      await db
        .prepare(`DELETE FROM sessions WHERE expires_at < ?`)
        .bind(now)
        .run();

      // Verify expired session is gone
      const expiredSession = await db
        .prepare(`SELECT * FROM sessions WHERE id = ?`)
        .bind("expired-session")
        .first();

      expect(expiredSession).toBeNull();

      // Verify valid sessions still exist
      const validSession = await db
        .prepare(`SELECT * FROM sessions WHERE id = ?`)
        .bind("test-session-user")
        .first();

      expect(validSession).toBeDefined();
    });

    it("should get all sessions for a user", async () => {
      await seedTestData(db);

      // Get actual user ID
      const user = await db
        .prepare(`SELECT id FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .first();
      const userId = (user as any).id;

      // Add another session for the user
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .prepare(
          `INSERT INTO sessions (id, user_id, expires_at)
           VALUES (?, ?, ?)`
        )
        .bind("test-session-admin-2", userId, expiresAt)
        .run();

      const sessions = await db
        .prepare(`SELECT * FROM sessions WHERE user_id = ?`)
        .bind(userId)
        .all();

      expect(sessions.results.length).toBeGreaterThanOrEqual(2);
      expect(sessions.results.every((s: any) => s.user_id === userId)).toBe(true);
    });

    it("should delete a session", async () => {
      await seedTestData(db);

      await db
        .prepare(`DELETE FROM sessions WHERE id = ?`)
        .bind("test-session-user")
        .run();

      const session = await db
        .prepare(`SELECT * FROM sessions WHERE id = ?`)
        .bind("test-session-user")
        .first();

      expect(session).toBeNull();
    });
  });

  describe("Complex Queries", () => {
    it("should get all active sessions with user details", async () => {
      await seedTestData(db);

      const now = new Date().toISOString();
      const result = await db
        .prepare(
          `SELECT
            s.id as session_id,
            s.created_at as session_created_at,
            s.expires_at,
            s.last_used_at,
            u.id as user_id,
            u.email,
            u.name,
            u.user_type
           FROM sessions s
           INNER JOIN users u ON s.user_id = u.id
           WHERE s.expires_at > ?
           ORDER BY s.last_used_at DESC`
        )
        .bind(now)
        .all();

      expect(result.results.length).toBeGreaterThan(0);
      result.results.forEach((row: any) => {
        expect(row.session_id).toBeDefined();
        expect(row.email).toBeDefined();
        expect(row.name).toBeDefined();
      });
    });

    it("should count sessions per user", async () => {
      await seedTestData(db);

      const result = await db
        .prepare(
          `SELECT u.email, COUNT(s.id) as session_count
           FROM users u
           LEFT JOIN sessions s ON u.id = s.user_id
           GROUP BY u.id, u.email`
        )
        .all();

      expect(result.results.length).toBeGreaterThanOrEqual(2);
      result.results.forEach((row: any) => {
        expect(row.email).toBeDefined();
        expect(typeof row.session_count).toBe("number");
      });
    });

    it("should use indexes efficiently", async () => {
      await seedTestData(db);

      // Query that should use idx_users_email
      const explainEmail = await db
        .prepare(`EXPLAIN QUERY PLAN SELECT * FROM users WHERE email = ?`)
        .bind("admin@test.com")
        .all();

      const planText = JSON.stringify(explainEmail.results);
      // Check that the query uses an index on email (could be idx_users_email or sqlite_autoindex)
      expect(planText.toLowerCase()).toMatch(/(idx_users_email|email)/i);

      // Query that should use idx_sessions_expires_at
      const now = new Date().toISOString();
      const explainExpiry = await db
        .prepare(`EXPLAIN QUERY PLAN SELECT * FROM sessions WHERE expires_at > ?`)
        .bind(now)
        .all();

      const expiryPlanText = JSON.stringify(explainExpiry.results);
      expect(expiryPlanText).toContain("idx_sessions_expires_at");
    });
  });

  describe("Transaction-like Operations", () => {
    it("should handle batch inserts", async () => {
      const users = [
        ["user1@example.com", "User One"],
        ["user2@example.com", "User Two"],
        ["user3@example.com", "User Three"],
      ];

      for (const [email, name] of users) {
        await db
          .prepare(`INSERT INTO users (email, name) VALUES (?, ?)`)
          .bind(email, name)
          .run();
      }

      const allUsers = await db
        .prepare(`SELECT * FROM users`)
        .all();

      expect(allUsers.results.length).toBe(3);
    });

    it("should handle D1 batch API", async () => {
      const results = await db.batch([
        db.prepare(`INSERT INTO users (email, name) VALUES (?, ?)`).bind("batch1@example.com", "Batch One"),
        db.prepare(`INSERT INTO users (email, name) VALUES (?, ?)`).bind("batch2@example.com", "Batch Two"),
        db.prepare(`SELECT COUNT(*) as count FROM users`),
      ]);

      expect(results.length).toBe(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);

      const countResult = results[2] as any;
      expect(countResult.results[0].count).toBe(2);
    });
  });
});
