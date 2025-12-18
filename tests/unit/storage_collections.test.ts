import { describe, it, expect, vi, beforeEach } from "vitest";
import { env, applyD1Migrations } from "cloudflare:test";
import {
    createCollection,
    getCollection,
    listCollections,
    updateCollection,
    deleteCollection,
    createEntry,
    getEntryById,
    listEntries,
    getEntryInCollection
} from "../../src/storage";
import type { User } from "../../src/types";

const mockUser: User = {
    id: 1,
    email: "test@example.com",
    name: "Test User",
    profile_picture: null,
    is_admin: 0,
    created_at: "now",
    updated_at: "now",
    last_login_at: null
};

describe("Collection Storage Logic", () => {
    beforeEach(async () => {
        await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
        await env.DB.prepare("INSERT INTO users (id, email, name, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(1, "test@example.com", "Test User", 0, "now", "now").run();
    });

    it("should create a collection", async () => {
        const collection = await createCollection(env, 1, "My Collection", "Desc");
        expect(collection).toBeDefined();
        expect(collection.name).toBe("My Collection");
        expect(collection.description).toBe("Desc");
        expect(collection.secret).toBeDefined();
        expect(collection.user_id).toBe(1);
    });

    it("should get a collection by ID", async () => {
        const created = await createCollection(env, 1, "Test Get", "Desc");
        const fetched = await getCollection(env, created.id);
        expect(fetched).toBeDefined();
        expect(fetched!.id).toBe(created.id);
        expect(fetched!.name).toBe("Test Get");
    });

    it("should list collections for user", async () => {
        await createCollection(env, 1, "C1", "D1");
        await createCollection(env, 1, "C2", "D2");

        const list = await listCollections(env, 1);
        expect(list.length).toBeGreaterThanOrEqual(2);
        expect(list.find(c => c.name === "C1")).toBeDefined();
    });

    it("should update a collection", async () => {
        const created = await createCollection(env, 1, "Old Name", "Old Desc");
        const updated = await updateCollection(env, created.id, "New Name", "New Desc");

        expect(updated!.name).toBe("New Name");
        expect(updated!.description).toBe("New Desc");

        const fetched = await getCollection(env, created.id);
        expect(fetched!.name).toBe("New Name");
    });

    it("should delete a collection", async () => {
        const created = await createCollection(env, 1, "To Delete", "");
        await deleteCollection(env, created.id);
        const fetched = await getCollection(env, created.id);
        expect(fetched).toBeNull();
    });

    it("should create entry in collection", async () => {
        const collection = await createCollection(env, 1, "Collection A", "");
        const entry = await createEntry(env, 1, "file_in_col", "text/plain", "val", null, undefined, collection.id);

        expect(entry.collection_id).toBe(collection.id);

        // Fetch back
        const fetched = await getEntryById(env, entry.id);
        expect(fetched!.collection_id).toBe(collection.id);
    });

    it("should list entries filtered by collection", async () => {
        const c1 = await createCollection(env, 1, "C1", "");
        const c2 = await createCollection(env, 1, "C2", "");

        await createEntry(env, 1, "file1", "text/plain", "v", null, undefined, c1.id);
        await createEntry(env, 1, "file2", "text/plain", "v", null, undefined, c2.id);
        await createEntry(env, 1, "root_file", "text/plain", "v", null);

        const listC1 = await listEntries(env, mockUser, undefined, undefined, c1.id);
        expect(listC1.length).toBe(1);
        expect(listC1[0].key).toBe("file1");

        const listRoot = await listEntries(env, mockUser, undefined, undefined, null);
        expect(listRoot.some(e => e.key === "root_file")).toBe(true);
        expect(listRoot.some(e => e.key === "file1")).toBe(false);

        // Test includeCollections logic if needed?
        // Current implementation: listEntries(..., null) with no includeCollections param implies only root.
    });

    it("should delete entries when collection is deleted (cascade)", async () => {
        const c1 = await createCollection(env, 1, "C1", "");
        const entry = await createEntry(env, 1, "file1", "text/plain", "v", null, undefined, c1.id);

        await deleteCollection(env, c1.id);

        // Check if entry exists.
        // NOTE: D1/SQLite FK cascade must be enabled.
        // The migration has ON DELETE CASCADE.
        // But we need to ensure PRAGMA foreign_keys = ON; is active.
        // D1 usually has it on.

        const fetched = await getEntryById(env, entry.id);
        // Vitest D1 mock/real implementation behavior:
        // If cascade works, fetched should be null.
        expect(fetched).toBeNull();
    });

    it("should find entry in collection (getEntryInCollection)", async () => {
         const c1 = await createCollection(env, 1, "C1", "");
         await createEntry(env, 1, "file1", "text/plain", "v", null, undefined, c1.id);

         const found = await getEntryInCollection(env, 1, "file1", c1.id);
         expect(found).toBeDefined();

         const notFound = await getEntryInCollection(env, 1, "file1", null); // look in root
         expect(notFound).toBeNull();
    });
});
