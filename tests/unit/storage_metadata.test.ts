import { describe, it, expect, vi, beforeEach } from "vitest";
import { env, applyD1Migrations } from "cloudflare:test";
import {
    createEntry,
    updateEntry,
    listEntries,
    getEntryById,
    createCollection,
    getCollection,
} from "../../src/storage";
import type { User } from "../../src/types";

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

describe("Storage Metadata and Origin", () => {
    beforeEach(async () => {
        // Apply migrations to the local D1 database
        // Need to ensure all migrations are applied including the new one
        await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
        // Create a user for foreign key constraints
        await env.DB.prepare("INSERT INTO users (id, email, name, user_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(1, "test@example.com", "Test User", "STANDARD", "now", "now").run();
    });

    it("should create an entry with metadata and origin", async () => {
        const metadata = JSON.stringify({ tag: "test", version: 1 });
        const origin = "https://example.com";

        const result = await createEntry(
            env, 1, "meta_test", "text/plain", "hello", null, undefined, null, metadata, origin
        );

        expect(result.metadata).toBe(metadata);
        expect(result.origin).toBe(origin);

        // Verify with DB
        const entry = await getEntryById(env, result.id);
        expect(entry?.metadata).toBe(metadata);
        expect(entry?.origin).toBe(origin);
    });

    it("should update an entry metadata", async () => {
        const created = await createEntry(env, 1, "update_meta", "text/plain", "content", null);

        const newMeta = JSON.stringify({ updated: true });
        const updated = await updateEntry(
            env, created.id, "update_meta", null, null, "text/plain", undefined, undefined, newMeta
        );

        expect(updated?.metadata).toBe(newMeta);

        // Verify value preserved
        expect(updated?.string_value).toBe("content");
    });

    it("should create collection with metadata and origin", async () => {
        const metadata = JSON.stringify({ project: "alpha" });
        const origin = "https://app.com";

        const collection = await createCollection(env, 1, "Meta Col", "desc", metadata, origin);

        expect(collection.metadata).toBe(metadata);
        expect(collection.origin).toBe(origin);

        const fetched = await getCollection(env, collection.id);
        expect(fetched?.metadata).toBe(metadata);
        expect(fetched?.origin).toBe(origin);
    });
});
