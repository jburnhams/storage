import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    createEntry,
    updateEntry,
    deleteEntry,
    listEntries,
    getEntryByKeySecret
} from "../src/storage";
import type { Env, User } from "../src/types";

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
        const mockResult = {
            id: 1,
            key: "test",
            string_value: "hello",
            blob_value: null,
            secret: "5d41402abc4b2a76b9719d911017c592", // md5("hello")
            type: "text/plain",
            user_id: 1
        };

        const stmt = {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(mockResult)
        };
        (env.DB.prepare as any).mockReturnValue(stmt);

        const result = await createEntry(env, 1, "test", "text/plain", "hello", null);

        expect(env.DB.prepare).toHaveBeenCalled();
        expect(stmt.bind).toHaveBeenCalledWith("test", "hello", null, expect.any(String), "text/plain", null, 1);
        expect(result).toEqual(mockResult);
    });

    it("should create an entry with blob value", async () => {
        const blob = new TextEncoder().encode("file content").buffer;
        const mockResult = {
            id: 2,
            key: "file.txt",
            string_value: null,
            blob_value: blob,
            secret: "00000000000000000000000000000000",
            type: "text/plain",
            user_id: 1
        };

        const stmt = {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(mockResult)
        };
        (env.DB.prepare as any).mockReturnValue(stmt);

        const result = await createEntry(env, 1, "file.txt", "text/plain", null, blob, "file.txt");

        expect(stmt.bind).toHaveBeenCalledWith("file.txt", null, blob, expect.any(String), "text/plain", "file.txt", 1);
        expect(result).toEqual(mockResult);
    });

    it("should list entries filtered by user", async () => {
        const mockResults = [
            { id: 1, key: "a", user_id: 1 },
            { id: 2, key: "b", user_id: 1 }
        ];

        const stmt = {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: mockResults })
        };
        (env.DB.prepare as any).mockReturnValue(stmt);

        const results = await listEntries(env, mockUser);

        expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("user_id = ?"));
        expect(results).toEqual(mockResults);
    });

    it("should filter by prefix", async () => {
        const stmt = {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [] })
        };
        (env.DB.prepare as any).mockReturnValue(stmt);

        await listEntries(env, mockUser, "folder/");

        expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("key LIKE ?"));
        expect(stmt.bind).toHaveBeenCalledWith(mockUser.id, "folder/%");
    });

    it("should update an entry with rename", async () => {
        const mockResult = {
            id: 1,
            key: "newname.txt",
            string_value: "content",
            secret: "hash",
            type: "text/plain",
            user_id: 1
        };

        const stmt = {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(mockResult)
        };
        (env.DB.prepare as any).mockReturnValue(stmt);

        const result = await updateEntry(env, 1, "newname.txt", "content", null, "text/plain");

        expect(env.DB.prepare).toHaveBeenCalledWith(expect.stringContaining("UPDATE key_value_entries"));
        expect(stmt.bind).toHaveBeenCalledWith("newname.txt", "content", null, expect.any(String), "text/plain", null, 1);
        expect(result).toEqual(mockResult);
    });

    it("should update an entry with only rename (preserving content)", async () => {
        // This test simulates the logic we'd expect if we passed nulls,
        // but note that the preservation logic is in worker.ts, not storage.ts.
        // storage.ts is dumb and updates what it's given.
        // So this test mainly confirms storage.ts handles what it receives.

        // However, to test the full flow we'd need to test worker.ts or integration.
        // For unit test here, we just verify updateEntry works with passed values.

        const mockResult = {
            id: 1,
            key: "renamed.txt",
            string_value: "oldcontent", // Preserved
            secret: "hash",
            type: "text/plain",
            user_id: 1
        };

        const stmt = {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(mockResult)
        };
        (env.DB.prepare as any).mockReturnValue(stmt);

        // Call with old content passed in (simulating worker logic)
        const result = await updateEntry(env, 1, "renamed.txt", "oldcontent", null, "text/plain");

        expect(stmt.bind).toHaveBeenCalledWith("renamed.txt", "oldcontent", null, expect.any(String), "text/plain", null, 1);
        expect(result).toEqual(mockResult);
    });
});
