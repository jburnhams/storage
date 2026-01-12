import { describe, it, expect, vi, beforeEach } from "vitest";
import { env, applyD1Migrations } from "cloudflare:test";
import {
    createEntry,
    updateEntry,
    listEntries,
    getEntryById,
    deleteEntry,
} from "../../src/storage";
import type { User } from "../../src/types";

// Note: In Node environment (Vitest), crypto.subtle.digest for SHA-1 might not be available or might differ.
// However, the Cloudflare worker pool environment might shim it.
// The previous test mocked it. Let's see if we need to mock it or if the real one works.
// For D1, we use the real 'env.DB'.

const mockUser: User = {
    id: 1,
    email: "test@example.com",
    name: "Test User",
    profile_picture: null,
    user_type: "STANDARD",
    password_salt: null,
    password_hash: null,
    created_at: "now",
    updated_at: "now",
    last_login_at: null
};

describe("Storage Logic", () => {
    beforeEach(async () => {
        // Apply migrations to the local D1 database
        await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
        // Create a user for foreign key constraints
        await env.DB.prepare("INSERT INTO users (id, email, name, user_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(1, "test@example.com", "Test User", "STANDARD", "now", "now").run();
    });

    it("should create an entry with string value", async () => {
        const result = await createEntry(env, 1, "test", "text/plain", "hello", null);

        expect(result.key).toBe("test");
        expect(result.string_value).toBe("hello");
        expect(result.type).toBe("text/plain");
        expect(result.user_id).toBe(1);

        // Verify with direct DB query
        const entry = await env.DB.prepare("SELECT * FROM key_value_entries WHERE id = ?").bind(result.id).first();
        expect(entry).toBeDefined();
        expect(entry.key).toBe("test");

        const value = await env.DB.prepare("SELECT * FROM value_entries WHERE id = ?").bind(entry.value_id).first();
        expect(value.string_value).toBe("hello");
    });

    it("should create an entry with blob value (deduping)", async () => {
        const blob = new TextEncoder().encode("file content").buffer;

        // Create first entry
        const result1 = await createEntry(env, 1, "file1.txt", "text/plain", null, blob, "file1.txt");

        // Create second entry with SAME content
        const result2 = await createEntry(env, 1, "file2.txt", "text/plain", null, blob, "file2.txt");

        expect(result1.value_id).toBe(result2.value_id);

        // Check DB for deduplication
        const count = await env.DB.prepare("SELECT count(*) as c FROM value_entries").first("c");
        // Depending on previous tests, but we expect only 1 new value for these 2 entries
        // Since tests might run in parallel or sequence, isolation is key.
        // Vitest pool workers provides isolation per test file usually, but D1 might be shared if not careful.
        // But for a unit test suite, we generally assume clean slate or cleanup.
        // Actually, migrations run on a fresh DB per worker usually.
    });

    it("should update an entry with only rename", async () => {
        const created = await createEntry(env, 1, "original.txt", "text/plain", "content", null);

        const updated = await updateEntry(env, created.id, "renamed.txt", null, null, "text/plain");

        expect(updated.key).toBe("renamed.txt");
        expect(updated.string_value).toBe("content"); // Should preserve old value

        // Check DB
        const entry = await env.DB.prepare("SELECT * FROM key_value_entries WHERE id = ?").bind(created.id).first();
        expect(entry.key).toBe("renamed.txt");
    });

    it("should get entry by id", async () => {
        const created = await createEntry(env, 1, "get_test", "text/plain", "content", null);

        const fetched = await getEntryById(env, created.id);
        expect(fetched).toBeDefined();
        expect(fetched.key).toBe("get_test");
    });

    it("should delete entry", async () => {
        const created = await createEntry(env, 1, "delete_test", "text/plain", "content", null);

        await deleteEntry(env, created.id);

        const fetched = await getEntryById(env, created.id);
        expect(fetched).toBeNull();
    });

    it("should list entries", async () => {
        await createEntry(env, 1, "list_1", "text/plain", "content", null);
        await createEntry(env, 1, "list_2", "text/plain", "content", null);

        const results = await listEntries(env, mockUser, "", "");
        // Filter for these specific keys in case other tests polluted (though isolation should handle it)
        const myResults = results.filter(r => r.key === "list_1" || r.key === "list_2");
        expect(myResults.length).toBeGreaterThanOrEqual(2);
    });

    it("should throw if creating entry with both string and blob", async () => {
        await expect(createEntry(env, 1, "key", "type", "val", new ArrayBuffer(1)))
            .rejects.toThrow("Either string_value or blob_value must be set");
    });
});
