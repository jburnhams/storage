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

  beforeEach(async () => {
    // OpenAPI tests might assume clean DB, but usually they just check schema/endpoint.
    // However, if any test creates data, we should clean.
    const db = await mf.getD1Database("DB");
    const { cleanDatabase } = await import('./setup');
    await cleanDatabase(db);
  });

  afterAll(async () => {
    // Singleton handles cleanup
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
