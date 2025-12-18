import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import {
  createMiniflareInstance,
  cleanDatabase,
  seedTestData,
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

describe("Multipart Upload Integration Tests", () => {
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
    await mf.dispose();
    try {
      const { rmSync } = await import("fs");
      rmSync(persistPath, { recursive: true, force: true });
    } catch (e) {
      console.error("Failed to clean up D1 persistence:", e);
    }
  });

  // Skipped due to instability in Miniflare/Undici handling of multipart requests in the test environment.
  // The core logic is verified in unit tests (tests/unit/multipart.test.ts).
  it("should upload and retrieve a SMALL file", async () => {
    const size = 1024; // 1KB
    const smallData = new Uint8Array(size);
    for(let i=0; i<size; i++) smallData[i] = i % 256;

    const formData = new FormData();
    formData.append("key", "small_file.bin");
    formData.append("type", "application/octet-stream");
    const blob = new Blob([smallData], { type: "application/octet-stream" });
    formData.append("file", blob, "small_file.bin");

    const payload = new Response(formData);
    const contentType = payload.headers.get("Content-Type");
    const bodyArrayBuffer = await payload.arrayBuffer();
    const bodyBuffer = Buffer.from(bodyArrayBuffer);

    const response = await mf.dispatchFetch("http://localhost/api/storage/entry", {
      method: "POST",
      headers: {
        "Cookie": "storage_session=test-session-admin",
        "Content-Type": contentType!,
      },
      body: bodyBuffer
    });

    if (response.status !== 200) {
        console.error("Small upload failed:", await response.text());
    }
    expect(response.status).toBe(200);
    const result = await response.json() as any;
    expect(result.key).toBe("small_file.bin");
  });

  // Skipped due to instability in Miniflare/Undici handling of multipart requests in the test environment.
  it("should upload and retrieve a LARGE file (> 2MB)", async () => {
    // 2.5MB file
    const size = 2.5 * 1024 * 1024;
    const largeData = new Uint8Array(size);
    for(let i=0; i<size; i++) largeData[i] = i % 256;

    const formData = new FormData();
    formData.append("key", "large_file.bin");
    formData.append("type", "application/octet-stream");

    // Create a Blob for the file
    const blob = new Blob([largeData], { type: "application/octet-stream" });
    formData.append("file", blob, "large_file.bin");

    // Serialize FormData using Response to get correct boundary and body
    const payload = new Response(formData);
    const contentType = payload.headers.get("Content-Type");
    const bodyArrayBuffer = await payload.arrayBuffer();
    const bodyBuffer = Buffer.from(bodyArrayBuffer);

    if (!contentType) {
        throw new Error("Failed to generate Content-Type from FormData");
    }

    // Upload
    const response = await mf.dispatchFetch("http://localhost/api/storage/entry", {
      method: "POST",
      headers: {
        "Cookie": "storage_session=test-session-admin",
        "Content-Type": contentType,
      },
      body: bodyBuffer
    });

    if (response.status !== 200) {
        console.error("Upload failed:", await response.text());
    }
    expect(response.status).toBe(200);
    const result = await response.json() as any;
    expect(result.key).toBe("large_file.bin");

    // Retrieve via API
    const getResponse = await mf.dispatchFetch(`http://localhost/api/storage/entry/${result.id}`, {
        headers: {
            "Cookie": "storage_session=test-session-admin",
        }
    });

    expect(getResponse.status).toBe(200);

    const entryData = await getResponse.json() as any;
    expect(entryData.is_multipart).toBe(1);
    expect(entryData.size).toBe(size);

    // Verify DB structure directly
    const valueEntry = await db.prepare("SELECT * FROM value_entries WHERE id = ?").bind(result.value_id).first<any>();
    expect(valueEntry.is_multipart).toBe(1);

    const partsCount = await db.prepare("SELECT COUNT(*) as c FROM blob_parts WHERE value_id = ?").bind(result.value_id).first<any>();
    expect(partsCount.c).toBeGreaterThan(1);
  });
});
