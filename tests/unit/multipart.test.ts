import { describe, it, expect, beforeEach } from "vitest";
import { env, applyD1Migrations } from "cloudflare:test";
import { createEntry, getEntryById, updateEntry } from "../../src/storage";

describe("Multipart Storage (Unit)", () => {
    // 1MB test chunk
    const LARGE_BLOB_SIZE = 3 * 1024 * 1024; // 3MB

    beforeEach(async () => {
        await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

        // Create user
        await env.DB.prepare("INSERT INTO users (email, name, is_admin) VALUES (?, ?, ?)").bind("test@test.com", "Test User", 1).run();
    });

    it("should store a large blob as multipart", async () => {
        const largeData = new Uint8Array(LARGE_BLOB_SIZE);
        for(let i=0; i<largeData.length; i++) largeData[i] = i % 256;

        const entry = await createEntry(env, 1, "large-blob", "application/octet-stream", null, largeData.buffer);

        expect(entry.is_multipart).toBe(1);
        expect(entry.size).toBe(LARGE_BLOB_SIZE);
        expect(entry.blob_value).toBeNull();

        // Verify in DB
        const valueEntry = await env.DB.prepare("SELECT * FROM value_entries WHERE id = ?").bind(entry.value_id).first<any>();
        expect(valueEntry.is_multipart).toBe(1);
        expect(valueEntry.blob_value).toBeNull();

        // Verify parts
        const parts = await env.DB.prepare("SELECT * FROM blob_parts WHERE value_id = ? ORDER BY part_index ASC").bind(entry.value_id).all<any>();
        expect(parts.results.length).toBeGreaterThan(1);

        // Check parts data types (based on debug findings, they come back as Arrays in test env)
        const part0 = parts.results[0].data;
        expect(Array.isArray(part0) || part0 instanceof ArrayBuffer).toBe(true);
    });

    it("should retrieve a large blob correctly", async () => {
        const largeData = new Uint8Array(LARGE_BLOB_SIZE);
        for(let i=0; i<largeData.length; i++) largeData[i] = i % 256;

        const created = await createEntry(env, 1, "large-blob-retrieval", "application/octet-stream", null, largeData.buffer);

        const retrieved = await getEntryById(env, created.id);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.is_multipart).toBe(1);
        expect(retrieved!.blob_value).not.toBeNull();

        const retrievedBuffer = retrieved!.blob_value as ArrayBuffer;
        expect(retrievedBuffer.byteLength).toBe(LARGE_BLOB_SIZE);

        const retrievedUint8 = new Uint8Array(retrievedBuffer);
        // Check start, middle, end
        expect(retrievedUint8[0]).toBe(0);
        expect(retrievedUint8[100]).toBe(100);
        expect(retrievedUint8[LARGE_BLOB_SIZE - 1]).toBe((LARGE_BLOB_SIZE - 1) % 256);
    });

    it("should deduplicate large blobs", async () => {
        const largeData = new Uint8Array(LARGE_BLOB_SIZE);
        for(let i=0; i<largeData.length; i++) largeData[i] = 1; // All 1s

        const entry1 = await createEntry(env, 1, "blob-1", "application/octet-stream", null, largeData.buffer);

        // Verify parts count
        const count1 = await env.DB.prepare("SELECT COUNT(*) as c FROM blob_parts").first<any>();
        const partsCount = count1.c;

        const entry2 = await createEntry(env, 1, "blob-2", "application/octet-stream", null, largeData.buffer);

        expect(entry2.value_id).toBe(entry1.value_id);

        const count2 = await env.DB.prepare("SELECT COUNT(*) as c FROM blob_parts").first<any>();
        expect(count2.c).toBe(partsCount); // Should not increase
    });

    it("should handle small blobs normally", async () => {
        const smallData = new TextEncoder().encode("hello world");
        const entry = await createEntry(env, 1, "small-blob", "text/plain", null, smallData.buffer);

        expect(entry.is_multipart).toBe(0);

        // Let's verify DB state
        const valueEntry = await env.DB.prepare("SELECT * FROM value_entries WHERE id = ?").bind(entry.value_id).first<any>();
        expect(valueEntry.is_multipart).toBe(0);
        expect(valueEntry.blob_value).not.toBeNull();

        const parts = await env.DB.prepare("SELECT * FROM blob_parts WHERE value_id = ?").bind(entry.value_id).all();
        expect(parts.results.length).toBe(0);
    });
});
