import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Miniflare } from "miniflare";
import { createMiniflareInstance, seedTestData } from "./setup";
import { readFileSync, rmSync } from "fs";
import { join } from "path";

describe("Collection API Integration", () => {
    let mf: Miniflare;
    let persistPath: string;
    let db: D1Database;
    const adminSessionId = "test-session-admin";
    const userSessionId = "test-session-user";

    beforeAll(async () => {
        const esbuild = await import("esbuild");

        const result = await esbuild.build({
            entryPoints: ["src/worker.ts"],
            bundle: true,
            format: "esm",
            platform: "browser",
            mainFields: ["browser", "module", "main"],
            write: false,
            external: ["cloudflare:workers"],
            alias: {
                "buffer": "buffer",
            },
            define: {
                "process.env.NODE_ENV": '"test"'
            }
        });

        const scriptContent = result.outputFiles[0].text;

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

    // NOTE: The cookie name is "storage_session" as per src/cookie.ts

    it("should list collections (empty initially)", async () => {
        const res = await mf.dispatchFetch("http://localhost/api/collections", {
            headers: { "Cookie": `storage_session=${userSessionId}` }
        });
        expect(res.status).toBe(200);
        const data = await res.json() as any[];
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it("should create a collection", async () => {
        const res = await mf.dispatchFetch("http://localhost/api/collections", {
            method: "POST",
            headers: {
                "Cookie": `storage_session=${userSessionId}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: "My First Collection", description: "Testing" })
        });
        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data.name).toBe("My First Collection");
        expect(data.id).toBeDefined();
    });

    it("should list created collection", async () => {
        const res = await mf.dispatchFetch("http://localhost/api/collections", {
            headers: { "Cookie": `storage_session=${userSessionId}` }
        });
        const data = await res.json() as any[];
        expect(data.length).toBe(1);
        expect(data[0].name).toBe("My First Collection");
    });

    it("should allow editing collection", async () => {
        // Get list to find ID
        const listRes = await mf.dispatchFetch("http://localhost/api/collections", {
            headers: { "Cookie": `storage_session=${userSessionId}` }
        });
        const list = await listRes.json() as any[];
        const id = list[0].id;

        const res = await mf.dispatchFetch(`http://localhost/api/collections/${id}`, {
            method: "PUT",
            headers: {
                "Cookie": `storage_session=${userSessionId}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: "Renamed Collection" })
        });
        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data.name).toBe("Renamed Collection");
    });

    it("should delete collection", async () => {
        // Create another one to delete
        const createRes = await mf.dispatchFetch("http://localhost/api/collections", {
             method: "POST",
             headers: { "Cookie": `storage_session=${userSessionId}`, "Content-Type": "application/json" },
             body: JSON.stringify({ name: "To Delete" })
        });
        const created = await createRes.json() as any;

        const delRes = await mf.dispatchFetch(`http://localhost/api/collections/${created.id}`, {
            method: "DELETE",
            headers: { "Cookie": `storage_session=${userSessionId}` }
        });
        expect(delRes.status).toBe(200);

        // Verify gone
        const getRes = await mf.dispatchFetch(`http://localhost/api/collections/${created.id}`, {
            headers: { "Cookie": `storage_session=${userSessionId}` }
        });
        expect(getRes.status).toBe(404);
    });

    it("should access collection via public secret", async () => {
         const listRes = await mf.dispatchFetch("http://localhost/api/collections", {
            headers: { "Cookie": `storage_session=${userSessionId}` }
        });
        const list = await listRes.json() as any[];
        const col = list[0];
        const secret = col.secret;

        const publicRes = await mf.dispatchFetch(`http://localhost/api/public/collection?secret=${secret}`);
        expect(publicRes.status).toBe(200);
        const data = await publicRes.json() as any;
        expect(data.name).toBe(col.name);
        expect(Array.isArray(data.contents)).toBe(true);
    });
});
