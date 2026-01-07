import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare } from "miniflare";
import { createMiniflareInstance, seedTestData, bundleWorker } from "./setup";
import { rmSync } from "fs";
import { FormData } from "undici"; // Explicitly use undici FormData if needed, but fetch normally handles it

describe("Bulk Operations Integration", () => {
    let mf: Miniflare;
    let persistPath: string;
    let db: D1Database;
    const userSessionId = "test-session-user";

    beforeAll(async () => {
        const scriptContent = await bundleWorker();

        const instance = await createMiniflareInstance({ script: scriptContent });
        mf = instance.mf;
        persistPath = instance.persistPath;

        db = await mf.getD1Database("DB");
        await seedTestData(db);
    });

    afterAll(async () => {
        if (mf) await mf.dispose();
        if (persistPath) {
            try {
                rmSync(persistPath, { recursive: true, force: true });
            } catch (e) { console.error(e); }
        }
    });

    it("should delete multiple entries", async () => {
        // Use standard FormData, undici handles boundaries automatically if we don't set Content-Type header manually
        const fd1 = new FormData();
        fd1.append("key", "bulk1");
        fd1.append("type", "text/plain");
        fd1.append("string_value", "v1");

        const create1 = await mf.dispatchFetch("http://localhost/api/storage/entry", {
            method: "POST",
            headers: { "Cookie": `storage_session=${userSessionId}` },
            body: fd1
        });
        const e1 = await create1.json() as any;

        const fd2 = new FormData();
        fd2.append("key", "bulk2");
        fd2.append("type", "text/plain");
        fd2.append("string_value", "v2");

        const create2 = await mf.dispatchFetch("http://localhost/api/storage/entry", {
            method: "POST",
            headers: { "Cookie": `storage_session=${userSessionId}` },
            body: fd2
        });
        const e2 = await create2.json() as any;

        // Bulk Delete
        const res = await mf.dispatchFetch("http://localhost/api/storage/bulk/delete", {
            method: "POST",
            headers: { "Cookie": `storage_session=${userSessionId}`, "Content-Type": "application/json" },
            body: JSON.stringify({ entry_ids: [e1.id, e2.id] })
        });
        expect(res.status).toBe(200);

        // Verify gone
        const get1 = await mf.dispatchFetch(`http://localhost/api/storage/entry/${e1.id}`, {
             headers: { "Cookie": `storage_session=${userSessionId}` }
        });
        expect(get1.status).toBe(404);
    });

    it("should export multiple entries", async () => {
        const fd = new FormData();
        fd.append("key", "export1");
        fd.append("type", "text/plain");
        fd.append("string_value", "val");

        const create = await mf.dispatchFetch("http://localhost/api/storage/entry", {
            method: "POST",
            headers: { "Cookie": `storage_session=${userSessionId}` },
            body: fd
        });
        const e = await create.json() as any;

        const res = await mf.dispatchFetch("http://localhost/api/storage/bulk/export", {
            method: "POST",
            headers: { "Cookie": `storage_session=${userSessionId}`, "Content-Type": "application/json" },
            body: JSON.stringify({ entry_ids: [e.id] })
        });
        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(Array.isArray(data.contents)).toBe(true);
        expect(data.contents[0].key).toBe("export1");
    });
});
