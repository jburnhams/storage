import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import {
  createMiniflareInstance,
  seedTestData,
  cleanDatabase,
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

describe("CORS Integration Tests", () => {
  let mf: Miniflare;
  let db: D1Database;
  let workerScript: string;
  let persistPath: string;

  beforeAll(async () => {
    workerScript = await bundleWorker();

    const result = await createMiniflareInstance({
      secrets: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
      script: workerScript,
    });
    mf = result.mf;
    persistPath = result.persistPath;

    db = await mf.getD1Database("DB");
  });

  beforeEach(async () => {
    db = await mf.getD1Database("DB");
    await cleanDatabase(db);
    await seedTestData(db);
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

  const ALLOWED_ORIGIN = "https://sub.jonathanburnhams.com";

  it("should handle OPTIONS preflight request with CORS headers for allowed origin", async () => {
    const response = await mf.dispatchFetch("http://localhost/api/user", {
      method: "OPTIONS",
      headers: {
        "Origin": ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "GET"
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("should include CORS headers in API responses for allowed origin", async () => {
    const response = await mf.dispatchFetch("http://localhost/api/user", {
      method: "GET",
      headers: {
        "Origin": ALLOWED_ORIGIN
      }
    });

    // Even if 401, headers should be present
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("should NOT include CORS headers for disallowed origin", async () => {
    const response = await mf.dispatchFetch("http://localhost/api/user", {
      method: "GET",
      headers: {
        "Origin": "https://malicious-site.com"
      }
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
