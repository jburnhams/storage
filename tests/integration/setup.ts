import { Miniflare } from "miniflare";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { build } from "esbuild";

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
 * Applies D1 migrations using Wrangler
 */
export function applyWranglerMigrations(persistPath: string) {
  try {
    // We use --no-confirm to avoid interactive prompts (wrangler v3.114.x doesn't support --no-confirm, but it falls back to yes in non-interactive)
    // We use --local because we are testing locally
    // Removed --no-confirm as it's causing "Unknown argument: confirm" errors with the installed wrangler version
    execSync(
      `npx wrangler d1 migrations apply DB --local --persist-to "${persistPath}"`,
      { stdio: "inherit" } // Inherit stdio to see output in tests if needed
    );
  } catch (error) {
    console.error("Failed to apply migrations:", error);
    throw error;
  }
}

/**
 * Bundle the worker for testing
 */
export async function bundleWorker(): Promise<string> {
  const outdir = join(process.cwd(), ".test-build");

  if (!existsSync(outdir)) {
    mkdirSync(outdir, { recursive: true });
  }

  await build({
    entryPoints: [join(process.cwd(), "src", "worker.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    outfile: join(outdir, "worker.js"),
    mainFields: ["browser", "module", "main"],
    external: ["cloudflare:*"],
    alias: {
        "buffer": "buffer",
    },
    define: {
        "process.env.NODE_ENV": '"test"'
    }
  });

  return readFileSync(join(outdir, "worker.js"), "utf-8");
}

/**
 * Creates a Miniflare instance configured for testing
 * with D1 database and secrets
 */
export async function createMiniflareInstance(options: {
  secrets?: Record<string, string>;
  persistPath?: string;
  script?: string;
}): Promise<{ mf: Miniflare; persistPath: string }> {
  const { secrets = {}, persistPath: providedPersistPath, script = "" } = options;

  // Use provided path or create a temporary one
  const persistPath = providedPersistPath || mkdtempSync(join(tmpdir(), "miniflare-test-"));

  // Apply migrations to the persistence path
  // Only apply if we created the path (fresh) OR if explicitly asked?
  // Actually, wrangler is idempotent so we can always apply, but it might be slow.
  // Ideally we only apply on creation.
  // But for simplicity, let's keep it here.
  applyWranglerMigrations(persistPath);

  // Wrangler creates a nested directory structure: <persistPath>/v3/d1
  const d1PersistPath = join(persistPath, "v3", "d1");

  const mf = new Miniflare({
    modules: true,
    script: script,
    d1Databases: {
      // Must match the binding name and ID in wrangler.toml or the one used in migration apply
      DB: "b1c3f037-ad29-4440-a670-f2cfdfdb36a3",
    },
    d1Persist: d1PersistPath,
    bindings: {
      GOOGLE_CLIENT_ID: secrets.GOOGLE_CLIENT_ID || "test-client-id",
      GOOGLE_CLIENT_SECRET: secrets.GOOGLE_CLIENT_SECRET || "test-client-secret",
      SESSION_SECRET: secrets.SESSION_SECRET || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
  });

  return { mf, persistPath };
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

  // We need to order deletions to avoid constraint violations if CASCADE isn't working for some reason,
  // though it should be.
  await db.prepare("DELETE FROM sessions").run();
  await db.prepare("DELETE FROM users").run();
}
