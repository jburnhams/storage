import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
import {
  createMiniflareInstance,
  cleanDatabase,
  seedTestData,
  bundleWorker,
} from "./setup";

describe("Storage Lifecycle Integration Tests", () => {
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
    const { cleanDatabase } = await import('./setup');
    await cleanDatabase(db);
    await seedTestData(db);
  });

  afterAll(async () => {
    // Singleton handles cleanup
  });

  it("should create, update, and delete an entry", async () => {
    // 1. Create Entry
    const formData = new FormData();
    formData.append("key", "test_lifecycle.txt");
    formData.append("type", "text/plain");
    formData.append("string_value", "initial content");

    const payload = new Response(formData);
    const bodyBuffer = Buffer.from(await payload.arrayBuffer());

    const createRes = await mf.dispatchFetch("http://localhost/api/storage/entry", {
      method: "POST",
      headers: {
        "Cookie": "storage_session=test-session-admin",
        "Content-Type": payload.headers.get("Content-Type")!,
      },
      body: bodyBuffer
    });

    expect(createRes.status).toBe(200);
    const created = await createRes.json() as any;
    expect(created.key).toBe("test_lifecycle.txt");
    expect(created.string_value).toBe("initial content");
    const entryId = created.id;

    // 2. Update Entry (Change Key and Content)
    const updateForm = new FormData();
    updateForm.append("key", "updated_name.txt");
    updateForm.append("type", "text/plain");
    updateForm.append("string_value", "updated content");

    const updatePayload = new Response(updateForm);
    const updateBody = Buffer.from(await updatePayload.arrayBuffer());

    const updateRes = await mf.dispatchFetch(`http://localhost/api/storage/entry/${entryId}`, {
      method: "PUT",
      headers: {
        "Cookie": "storage_session=test-session-admin",
        "Content-Type": updatePayload.headers.get("Content-Type")!,
      },
      body: updateBody
    });

    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json() as any;
    expect(updated.key).toBe("updated_name.txt");
    expect(updated.string_value).toBe("updated content");

    // 3. Verify Update via Get
    const getRes = await mf.dispatchFetch(`http://localhost/api/storage/entry/${entryId}`, {
        headers: { "Cookie": "storage_session=test-session-admin" }
    });
    const fetched = await getRes.json() as any;
    expect(fetched.key).toBe("updated_name.txt");
    expect(fetched.string_value).toBe("updated content");

    // 4. Delete Entry
    const deleteRes = await mf.dispatchFetch(`http://localhost/api/storage/entry/${entryId}`, {
        method: "DELETE",
        headers: { "Cookie": "storage_session=test-session-admin" }
    });
    expect(deleteRes.status).toBe(200);

    // 5. Verify Deletion
    const getDeleted = await mf.dispatchFetch(`http://localhost/api/storage/entry/${entryId}`, {
        headers: { "Cookie": "storage_session=test-session-admin" }
    });
    expect(getDeleted.status).toBe(404);
  });

  it("should handle public sharing", async () => {
    // 1. Create Entry
    const formData = new FormData();
    formData.append("key", "shared.txt");
    formData.append("type", "text/plain");
    formData.append("string_value", "shared secret content");

    const payload = new Response(formData);
    const bodyBuffer = Buffer.from(await payload.arrayBuffer());

    const createRes = await mf.dispatchFetch("http://localhost/api/storage/entry", {
      method: "POST",
      headers: {
        "Cookie": "storage_session=test-session-admin",
        "Content-Type": payload.headers.get("Content-Type")!,
      },
      body: bodyBuffer
    });
    const created = await createRes.json() as any;
    const secret = created.secret;
    expect(secret).toBeDefined();

    // 2. Access via Public Share URL
    // /api/public/share?key=...&secret=...
    const shareUrl = `http://localhost/api/public/share?key=shared.txt&secret=${secret}`;

    const shareRes = await mf.dispatchFetch(shareUrl);
    expect(shareRes.status).toBe(200);
    const sharedData = await shareRes.json() as any;
    expect(sharedData.string_value).toBe("shared secret content");

    // 3. Access with Wrong Secret
    const wrongUrl = `http://localhost/api/public/share?key=shared.txt&secret=wrong`;
    const wrongRes = await mf.dispatchFetch(wrongUrl);
    expect(wrongRes.status).toBe(404);

    // 4. Access with Raw Param
    const rawUrl = `http://localhost/api/public/share?key=shared.txt&secret=${secret}&raw=true`;
    const rawRes = await mf.dispatchFetch(rawUrl);
    expect(rawRes.status).toBe(200);
    expect(await rawRes.text()).toBe("shared secret content");
    expect(rawRes.headers.get("Content-Type")).toContain("text/plain");
  });
});
