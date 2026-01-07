import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare } from "miniflare";
import { createMiniflareInstance, bundleWorker } from "./setup";

describe("OpenAPI Integration Tests", () => {
  let mf: Miniflare;
  let workerScript: string;
  let persistPath: string;

  beforeAll(async () => {
    workerScript = await bundleWorker();

    const result = await createMiniflareInstance({
      script: workerScript,
    });
    mf = result.mf;
    persistPath = result.persistPath;
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

  it("should serve openapi.json with status 200 and valid content", async () => {
    const response = await mf.dispatchFetch("http://localhost/openapi.json");

    if (response.status !== 200) {
      console.error("OpenAPI Response Status:", response.status);
      console.error("OpenAPI Response Text:", await response.text());
    }

    expect(response.status).toBe(200);

    const data = await response.json() as any;
    expect(data).toBeDefined();
    expect(data.openapi).toBe("3.0.0");
    expect(data.info.title).toBe("Storage API");

    // Check if paths exist
    expect(data.paths).toBeDefined();
    expect(data.paths['/api/storage/entries']).toBeDefined();
    expect(data.paths['/api/storage/entry']).toBeDefined();
  });
});
