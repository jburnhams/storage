import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRequest } from "../../src/worker";
import * as storage from "../../src/storage";
import * as session from "../../src/session";
import type { Env, KeyValueEntryJoined, User } from "../../src/types";

// Mock dependencies
vi.mock("../../src/storage", async () => {
    const actual = await vi.importActual("../../src/storage");
    return {
        ...actual,
        createEntry: vi.fn(),
        updateEntry: vi.fn(),
        deleteEntry: vi.fn(),
        listEntries: vi.fn(),
        getEntryById: vi.fn(),
        getEntryByKeySecret: vi.fn(),
        // entryToResponse is preserved
    };
});
vi.mock("../../src/session");
vi.mock("../../src/cookie");

const mockEnv = {
  DB: {},
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

const mockAdminUser: User = {
  ...mockUser,
  id: 2,
  is_admin: 1
};

const mockEntry: KeyValueEntryJoined = {
    id: 1,
    key: "test.txt",
    value_id: 100,
    filename: "test.txt",
    user_id: 1,
    created_at: "now",
    updated_at: "now",
    hash: "hash",
    string_value: "content",
    blob_value: null,
    type: "text/plain"
};

describe("Worker Storage API", () => {
    beforeEach(async () => {
        vi.resetAllMocks();
        // Mock Session to return user
        vi.spyOn(session, "getSession").mockResolvedValue({ id: "sess", user_id: 1 } as any);
        vi.spyOn(session, "getUserById").mockResolvedValue(mockUser);
        // Mock cookie to return session id
        const cookie = await import("../../src/cookie");
        (cookie.getSessionIdFromCookie as any) = vi.fn().mockReturnValue("sess");
    });

    it("should list entries", async () => {
        (storage.listEntries as any).mockResolvedValue([mockEntry]);

        const req = new Request("http://localhost/api/storage/entries");
        const res = await handleRequest(req, mockEnv, { waitUntil: vi.fn() });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveLength(1);
        expect(data[0].key).toBe("test.txt");
    });

    it("should get entry", async () => {
        (storage.getEntryById as any).mockResolvedValue(mockEntry);

        const req = new Request("http://localhost/api/storage/entry/1");
        const res = await handleRequest(req, mockEnv, { waitUntil: vi.fn() });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.key).toBe("test.txt");
    });

    it("should deny access to other user's entry", async () => {
        (storage.getEntryById as any).mockResolvedValue({ ...mockEntry, user_id: 999 });

        const req = new Request("http://localhost/api/storage/entry/1");
        const res = await handleRequest(req, mockEnv, { waitUntil: vi.fn() });

        expect(res.status).toBe(403);
    });

    it("should create entry", async () => {
        (storage.createEntry as any).mockResolvedValue(mockEntry);

        const formData = new FormData();
        formData.append("key", "test.txt");
        formData.append("type", "text/plain");
        formData.append("string_value", "content");

        const req = new Request("http://localhost/api/storage/entry", {
            method: "POST",
            body: formData
        });

        const res = await handleRequest(req, mockEnv, { waitUntil: vi.fn() });

        expect(res.status).toBe(200);
        expect(storage.createEntry).toHaveBeenCalled();
    });

    it("should update entry", async () => {
        (storage.getEntryById as any).mockResolvedValue(mockEntry);
        (storage.updateEntry as any).mockResolvedValue(mockEntry);

        const formData = new FormData();
        formData.append("type", "text/plain");
        formData.append("string_value", "new content");

        const req = new Request("http://localhost/api/storage/entry/1", {
            method: "PUT",
            body: formData
        });

        const res = await handleRequest(req, mockEnv, { waitUntil: vi.fn() });

        expect(res.status).toBe(200);
        expect(storage.updateEntry).toHaveBeenCalled();
    });

    it("should delete entry", async () => {
        (storage.getEntryById as any).mockResolvedValue(mockEntry);
        (storage.deleteEntry as any).mockResolvedValue(undefined);

        const req = new Request("http://localhost/api/storage/entry/1", {
            method: "DELETE"
        });

        const res = await handleRequest(req, mockEnv, { waitUntil: vi.fn() });

        expect(res.status).toBe(200);
        expect(storage.deleteEntry).toHaveBeenCalledWith(expect.anything(), 1);
    });

    it("should access public share", async () => {
        (storage.getEntryByKeySecret as any).mockResolvedValue(mockEntry);

        const req = new Request("http://localhost/api/public/share?key=test.txt&secret=hash");
        const res = await handleRequest(req, mockEnv, { waitUntil: vi.fn() });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.key).toBe("test.txt");
    });

    it("should handle invalid id for get", async () => {
        const req = new Request("http://localhost/api/storage/entry/abc");
        const res = await handleRequest(req, mockEnv, { waitUntil: vi.fn() });
        expect(res.status).toBe(400);
    });

    it("should handle missing type for create", async () => {
        const formData = new FormData();
        formData.append("key", "test");
        const req = new Request("http://localhost/api/storage/entry", { method: "POST", body: formData });
        const res = await handleRequest(req, mockEnv, { waitUntil: vi.fn() });
        expect(res.status).toBe(400);
    });
});
