import { Miniflare } from "miniflare";
import { readFileSync } from "fs";
import { join } from "path";

export interface TestEnv {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

export interface UserRow {
  id: number;
  email: string;
  name: string;
  profile_picture: string | null;
  is_admin: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface SessionRow {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  last_used_at: string;
}

/**
 * Creates a Miniflare instance configured for testing
 * with D1 database and secrets
 */
export async function createMiniflareInstance(options: {
  secrets?: Record<string, string>;
  persistPath?: string;
}): Promise<Miniflare> {
  const { secrets = {}, persistPath } = options;

  const mf = new Miniflare({
    modules: true,
    script: "",
    d1Databases: {
      DB: persistPath || ":memory:",
    },
    bindings: {
      GOOGLE_CLIENT_ID: secrets.GOOGLE_CLIENT_ID || "test-client-id",
      GOOGLE_CLIENT_SECRET: secrets.GOOGLE_CLIENT_SECRET || "test-client-secret",
      SESSION_SECRET: secrets.SESSION_SECRET || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
  });

  return mf;
}

/**
 * Runs database migrations on a D1 database
 */
export async function runMigrations(db: D1Database): Promise<void> {
  // Enable foreign keys (required for D1/SQLite)
  await db.prepare("PRAGMA foreign_keys = ON").run();

  const migrationPath = join(process.cwd(), "migrations", "0001_create_users_and_sessions.sql");
  const migrationSQL = readFileSync(migrationPath, "utf-8");

  // Remove comments and split by semicolon
  const cleanedSQL = migrationSQL
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  // Split by semicolon and execute each statement
  const statements = cleanedSQL
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    try {
      // Add IF NOT EXISTS to index creation for idempotency
      let finalStatement = statement;
      if (statement.toUpperCase().includes('CREATE INDEX')) {
        finalStatement = statement.replace(/CREATE INDEX/i, 'CREATE INDEX IF NOT EXISTS');
      }
      await db.prepare(finalStatement).run();
    } catch (error) {
      // Ignore "already exists" errors for idempotency
      if (error instanceof Error && !error.message.includes('already exists')) {
        console.error("Failed to execute statement:", statement);
        throw error;
      }
    }
  }
}

/**
 * Seeds test data into the database
 */
export async function seedTestData(db: D1Database) {
  // Enable foreign keys
  await db.prepare("PRAGMA foreign_keys = ON").run();

  // Insert test users
  const adminResult = await db
    .prepare(
      `INSERT INTO users (email, name, profile_picture, is_admin)
       VALUES (?, ?, ?, ?)`
    )
    .bind(
      "admin@test.com",
      "Test Admin",
      "https://example.com/admin.jpg",
      1
    )
    .run();

  const userResult = await db
    .prepare(
      `INSERT INTO users (email, name, profile_picture, is_admin)
       VALUES (?, ?, ?, ?)`
    )
    .bind(
      "user@test.com",
      "Test User",
      "https://example.com/user.jpg",
      0
    )
    .run();

  // Get the actual user IDs
  const adminId = adminResult.meta.last_row_id;
  const userId = userResult.meta.last_row_id;

  // Insert test sessions
  const now = new Date();
  const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at)
       VALUES (?, ?, ?)`
    )
    .bind("test-session-admin", adminId, futureDate.toISOString())
    .run();

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at)
       VALUES (?, ?, ?)`
    )
    .bind("test-session-user", userId, futureDate.toISOString())
    .run();
}

/**
 * Cleans up all data from the database
 */
export async function cleanDatabase(db: D1Database): Promise<void> {
  // Enable foreign keys to ensure cascade deletes work
  await db.prepare("PRAGMA foreign_keys = ON").run();
  await db.prepare("DELETE FROM sessions").run();
  await db.prepare("DELETE FROM users").run();
}
