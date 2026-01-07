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

let sharedMf: Miniflare | undefined;
let sharedPersistPath: string | undefined;

/**
 * Creates a Miniflare instance configured for testing
 * with D1 database and secrets.
 * Reuses a single instance if called multiple times (singleton), unless isolated is requested.
 */
export async function createMiniflareInstance(options: {
  secrets?: Record<string, string>;
  persistPath?: string;
  script?: string;
  isolate?: boolean;
}): Promise<{ mf: Miniflare; persistPath: string }> {
  // If we already have a shared instance and isolation is not requested, return it.
  if (!options.isolate && sharedMf && sharedPersistPath) {
    if (options.script) {
        // Update the script if provided.
        // Note: This updates the shared instance, so subsequent tests will also see this script
        // until updated again. This is acceptable for most integration tests that use the same worker script.
        await sharedMf.setOptions({
            script: options.script,
            bindings: {
              ...await sharedMf.getBindings(),
              ...options.secrets
            } as any
        });
    } else if (options.secrets) {
        // Update secrets if provided
        await sharedMf.setOptions({
            bindings: {
                ...await sharedMf.getBindings(),
                ...options.secrets
            } as any
        });
    }

    return {
        mf: sharedMf,
        persistPath: sharedPersistPath
    };
  }

  const { secrets = {}, persistPath: providedPersistPath, script = "" } = options;

  // Use provided path or create a temporary one
  const persistPath = providedPersistPath || mkdtempSync(join(tmpdir(), "miniflare-test-"));

  // Apply migrations to the persistence path
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
      YOUTUBE_API_KEY: secrets.YOUTUBE_API_KEY || "test-youtube-key",
      ...(secrets.YOUTUBE_API_BASE_URL ? { YOUTUBE_API_BASE_URL: secrets.YOUTUBE_API_BASE_URL } : {}),
    },
  });

  if (!options.isolate) {
    // Monkey-patch dispose to prevent accidental disposal by tests
    const originalDispose = mf.dispose.bind(mf);
    mf.dispose = async () => {
        // No-op for shared instance
        return;
    };
    // If we ever really need to dispose it (e.g. teardown), we can use originalDispose.
    // But since it's singleton for the process, process exit cleans it up.

    sharedMf = mf;
    sharedPersistPath = persistPath;
  }

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
  // Turn off foreign keys to allow deleting in any order
  await db.prepare("PRAGMA foreign_keys = OFF").run();

  // Dynamically get all tables
  const tablesResult = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`
  ).all();

  const tables = tablesResult.results.map((r: any) => r.name);

  for (const table of tables) {
      await db.prepare(`DELETE FROM ${table}`).run();
  }

  // Re-enable foreign keys
  await db.prepare("PRAGMA foreign_keys = ON").run();
}
