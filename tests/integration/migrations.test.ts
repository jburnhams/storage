import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
import { createMiniflareInstance, runMigrations, cleanDatabase } from "./setup";

describe("D1 Database Migrations", () => {
  let mf: Miniflare;
  let db: D1Database;

  beforeAll(async () => {
    mf = await createMiniflareInstance({});
    db = await mf.getD1Database("DB");
    await runMigrations(db);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it("should successfully run migrations and create tables", async () => {
    // Verify users table exists
    const usersTableResult = await db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
      )
      .first();

    expect(usersTableResult).toBeDefined();
    expect(usersTableResult?.name).toBe("users");

    // Verify sessions table exists
    const sessionsTableResult = await db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'`
      )
      .first();

    expect(sessionsTableResult).toBeDefined();
    expect(sessionsTableResult?.name).toBe("sessions");
  });

  it("should create all required indexes", async () => {
    // Get all indexes
    const indexes = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index'`)
      .all();

    const indexNames = indexes.results.map((idx: any) => idx.name);

    // Verify user indexes
    expect(indexNames).toContain("idx_users_email");
    expect(indexNames).toContain("idx_users_is_admin");

    // Verify session indexes
    expect(indexNames).toContain("idx_sessions_user_id");
    expect(indexNames).toContain("idx_sessions_expires_at");
  });

  it("should have correct schema for users table", async () => {
    const schema = await db
      .prepare(`PRAGMA table_info(users)`)
      .all();

    const columns = schema.results.map((col: any) => col.name);

    expect(columns).toContain("id");
    expect(columns).toContain("email");
    expect(columns).toContain("name");
    expect(columns).toContain("profile_picture");
    expect(columns).toContain("is_admin");
    expect(columns).toContain("created_at");
    expect(columns).toContain("updated_at");
    expect(columns).toContain("last_login_at");
  });

  it("should have correct schema for sessions table", async () => {
    const schema = await db
      .prepare(`PRAGMA table_info(sessions)`)
      .all();

    const columns = schema.results.map((col: any) => col.name);

    expect(columns).toContain("id");
    expect(columns).toContain("user_id");
    expect(columns).toContain("created_at");
    expect(columns).toContain("expires_at");
    expect(columns).toContain("last_used_at");
  });

  it("should enforce foreign key constraint on sessions table", async () => {
    // Get foreign keys for sessions table
    const foreignKeys = await db
      .prepare(`PRAGMA foreign_key_list(sessions)`)
      .all();

    expect(foreignKeys.results.length).toBeGreaterThan(0);

    const fk = foreignKeys.results[0] as any;
    expect(fk.table).toBe("users");
    expect(fk.from).toBe("user_id");
    expect(fk.to).toBe("id");
    expect(fk.on_delete).toBe("CASCADE");
  });

  it("should handle idempotent migrations (IF NOT EXISTS)", async () => {
    // Run migrations again to test idempotency
    await runMigrations(db);

    // Should not throw and tables should still exist
    const tablesResult = await db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'sessions')`
      )
      .all();

    expect(tablesResult.results).toHaveLength(2);
  });

  it("should enforce unique constraint on user email", async () => {
    // Insert first user
    await db
      .prepare(`INSERT INTO users (email, name) VALUES (?, ?)`)
      .bind("test@example.com", "Test User")
      .run();

    // Try to insert duplicate email
    await expect(async () => {
      await db
        .prepare(`INSERT INTO users (email, name) VALUES (?, ?)`)
        .bind("test@example.com", "Another User")
        .run();
    }).rejects.toThrow();
  });

  it("should cascade delete sessions when user is deleted", async () => {
    // Insert user
    const userResult = await db
      .prepare(`INSERT INTO users (email, name) VALUES (?, ?)`)
      .bind("cascade@example.com", "Cascade Test")
      .run();

    const userId = userResult.meta.last_row_id;

    // Insert session for user
    await db
      .prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
      .bind("test-session", userId, new Date().toISOString())
      .run();

    // Verify session exists
    let sessionResult = await db
      .prepare(`SELECT * FROM sessions WHERE id = ?`)
      .bind("test-session")
      .first();
    expect(sessionResult).toBeDefined();

    // Delete user
    await db
      .prepare(`DELETE FROM users WHERE id = ?`)
      .bind(userId)
      .run();

    // Verify session was also deleted
    sessionResult = await db
      .prepare(`SELECT * FROM sessions WHERE id = ?`)
      .bind("test-session")
      .first();
    expect(sessionResult).toBeNull();
  });
});
