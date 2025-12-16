import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    createEntry,
    updateEntry,
    listEntries,
    getEntryById,
    deleteEntry,
    getEntryByKeySecret
} from "../../src/storage";
import type { Env, User } from "../../src/types";

// Mock D1 Database
const mockD1 = {
  prepare: vi.fn(),
  batch: vi.fn(),
  exec: vi.fn(),
  dump: vi.fn(),
} as unknown as D1Database;

// Mock Env
const env = {
  DB: mockD1,
  GOOGLE_CLIENT_ID: "mock",
  GOOGLE_CLIENT_SECRET: "mock",
  SESSION_SECRET: "mock",
} as Env;

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

describe("Storage Logic", () => {
    beforeEach(() => {
        vi.resetAllMocks();

        // Mock crypto.subtle.digest for MD5
        Object.defineProperty(global, 'crypto', {
            value: {
                subtle: {
                    digest: vi.fn().mockImplementation(async (algorithm, data) => {
                        if (algorithm === 'MD5') {
                            // Return a fake hash buffer
                             // "5d41402abc4b2a76b9719d911017c592" -> hello
                            if (new TextDecoder().decode(data) === "hello") {
                                return new Uint8Array([
                                    0x5d, 0x41, 0x40, 0x2a, 0xbc, 0x4b, 0x2a, 0x76,
                                    0xb9, 0x71, 0x9d, 0x91, 0x10, 0x17, 0xc5, 0x92
                                ]).buffer;
                            }
                            return new Uint8Array(16).fill(0).buffer; // Default fake hash
                        }
                        return new ArrayBuffer(0);
                    })
                }
            },
            writable: true
        });
    });

    it("should create an entry with string value", async () => {
        const mockValue = {
            id: 100,
            hash: "5d41402abc4b2a76b9719d911017c592",
            string_value: "hello",
            blob_value: null,
            type: "text/plain",
            created_at: "now"
        };
        const mockEntry = {
            id: 1,
            key: "test",
            value_id: 100,
            filename: null,
            user_id: 1,
            created_at: "now",
            updated_at: "now"
        };

        const stmtFirst = {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn()
                .mockResolvedValueOnce(null) // First call: find existing (not found)
                .mockResolvedValueOnce(mockValue) // Second call: create value (returning)
                .mockResolvedValueOnce(mockEntry) // Third call: create entry
        };
        (env.DB.prepare as any).mockReturnValue(stmtFirst);

        const result = await createEntry(env, 1, "test", "text/plain", "hello", null);

        // findOrCreateValue: SELECT ...
        expect(env.DB.prepare).toHaveBeenNthCalledWith(1, expect.stringContaining("SELECT * FROM value_entries"));
        // findOrCreateValue: INSERT ...
        expect(env.DB.prepare).toHaveBeenNthCalledWith(2, expect.stringContaining("INSERT INTO value_entries"));
        // createEntry: INSERT ...
        expect(env.DB.prepare).toHaveBeenNthCalledWith(3, expect.stringContaining("INSERT INTO key_value_entries"));

        expect(result).toEqual({ ...mockEntry, ...mockValue, secret: mockValue.hash });
    });

    it("should create an entry with blob value (deduping)", async () => {
        const blob = new TextEncoder().encode("file content").buffer;
        const mockValue = {
            id: 101,
            hash: "00000000000000000000000000000000",
            string_value: null,
            blob_value: blob,
            type: "text/plain",
            created_at: "now"
        };
        const mockEntry = {
            id: 2,
            key: "file.txt",
            value_id: 101,
            filename: "file.txt",
            user_id: 1
        };

        const stmt = {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn()
                .mockResolvedValueOnce(mockValue) // First call: find existing (FOUND!)
                .mockResolvedValueOnce(mockEntry) // Second call: create entry
        };
        (env.DB.prepare as any).mockReturnValue(stmt);

        const result = await createEntry(env, 1, "file.txt", "text/plain", null, blob, "file.txt");

        // Should NOT call insert value
        expect(env.DB.prepare).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ ...mockEntry, ...mockValue, secret: mockValue.hash });
    });

    it("should update an entry with only rename (null values)", async () => {
        const mockResult = {
            id: 1,
            key: "renamed.txt",
            value_id: 100,
            user_id: 1
        };

        const mockJoinedResult = {
            ...mockResult,
            hash: "hash",
            string_value: "old",
            blob_value: null,
            type: "text/plain"
        };

        const stmt = {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn()
                .mockResolvedValueOnce(mockResult) // UPDATE key_value ... RETURNING
                .mockResolvedValueOnce(mockJoinedResult) // SELECT joined
        };
        (env.DB.prepare as any).mockReturnValue(stmt);

        const result = await updateEntry(env, 1, "renamed.txt", null, null, "text/plain");

        expect(env.DB.prepare).toHaveBeenNthCalledWith(1, expect.stringContaining("UPDATE key_value_entries"));
        expect(env.DB.prepare).toHaveBeenNthCalledWith(2, expect.stringContaining("SELECT k.*"));
        expect(result).toEqual(mockJoinedResult);
    });

    it("should get entry by id", async () => {
        const mockJoinedResult = { id: 1, key: "test" };
        const stmt = { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(mockJoinedResult) };
        (env.DB.prepare as any).mockReturnValue(stmt);

        const result = await getEntryById(env, 1);
        expect(result).toEqual(mockJoinedResult);
    });

    it("should delete entry", async () => {
        const stmt = { bind: vi.fn().mockReturnThis(), run: vi.fn() };
        (env.DB.prepare as any).mockReturnValue(stmt);

        await deleteEntry(env, 1);
        expect(stmt.run).toHaveBeenCalled();
    });

    it("should list entries", async () => {
        const stmt = { bind: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue({ results: [] }) };
        (env.DB.prepare as any).mockReturnValue(stmt);

        await listEntries(env, mockUser, "prefix", "search");
        expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("SELECT k.id"));
    });

    it("should throw if creating entry with both string and blob", async () => {
        await expect(createEntry(env, 1, "key", "type", "val", new ArrayBuffer(1)))
            .rejects.toThrow("Either string_value or blob_value must be set");
    });

    it("should throw if updating entry with both string and blob", async () => {
        await expect(updateEntry(env, 1, "key", "val", new ArrayBuffer(1), "type"))
            .rejects.toThrow("Either string_value or blob_value must be set");
    });
});
