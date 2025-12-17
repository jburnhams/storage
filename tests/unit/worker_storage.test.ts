import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRequest } from "../../src/worker";
import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from "cloudflare:test";
import * as storage from "../../src/storage";
import * as session from "../../src/session";
import type { KeyValueEntryJoined, User } from "../../src/types";

// We will KEEP mocking the internal logic (storage/session) here because
// this test file specifically checks the "Controller" layer logic (status codes, JSON format)
// without needing to set up the full database state for every single test case if we don't want to.
// HOWEVER, if we are migrating to `cloudflare:test`, we usually *can* rely on the real DB easily.
// But the original test was mocking specific return values (like "deny access to other user's entry")
// which is harder to setup with real data (requires creating 2 users, etc).
// So keeping mocks for the *business logic* while using the *real worker environment* for request handling is a good hybrid.

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
    };
});
vi.mock("../../src/session");
vi.mock("../../src/cookie");

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
        await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
        vi.resetAllMocks();
        // Even though we mock storage/session, the worker might access DB for other things (like health check or session validation if not fully mocked).
        // But here we mock `session.getSession`, so it shouldn't hit DB for auth.

        vi.spyOn(session, "getSession").mockResolvedValue({ id: "sess", user_id: 1 } as any);
        vi.spyOn(session, "getUserById").mockResolvedValue(mockUser);

        const cookie = await import("../../src/cookie");
        (cookie.getSessionIdFromCookie as any) = vi.fn().mockReturnValue("sess");
    });

    it("should list entries", async () => {
        (storage.listEntries as any).mockResolvedValue([mockEntry]);

        const req = new Request("http://localhost/api/storage/entries");
        const ctx = createExecutionContext();
        const res = await handleRequest(req, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveLength(1);
        expect(data[0].key).toBe("test.txt");
    });

    it("should get entry", async () => {
        (storage.getEntryById as any).mockResolvedValue(mockEntry);

        const req = new Request("http://localhost/api/storage/entry/1");
        const ctx = createExecutionContext();
        const res = await handleRequest(req, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.key).toBe("test.txt");
    });

    it("should deny access to other user's entry", async () => {
        (storage.getEntryById as any).mockResolvedValue({ ...mockEntry, user_id: 999 });

        const req = new Request("http://localhost/api/storage/entry/1");
        const ctx = createExecutionContext();
        const res = await handleRequest(req, env, ctx);
        await waitOnExecutionContext(ctx);

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

        const ctx = createExecutionContext();
        const res = await handleRequest(req, env, ctx);
        await waitOnExecutionContext(ctx);

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

        const ctx = createExecutionContext();
        const res = await handleRequest(req, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);
        expect(storage.updateEntry).toHaveBeenCalled();
    });

    it("should delete entry", async () => {
        (storage.getEntryById as any).mockResolvedValue(mockEntry);
        (storage.deleteEntry as any).mockResolvedValue(undefined);

        const req = new Request("http://localhost/api/storage/entry/1", {
            method: "DELETE"
        });

        const ctx = createExecutionContext();
        const res = await handleRequest(req, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);
        expect(storage.deleteEntry).toHaveBeenCalledWith(expect.anything(), 1);
    });

    it("should access public share", async () => {
        (storage.getEntryByKeySecret as any).mockResolvedValue(mockEntry);

        const req = new Request("http://localhost/api/public/share?key=test.txt&secret=hash");
        const ctx = createExecutionContext();
        const res = await handleRequest(req, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.key).toBe("test.txt");
    });

    it("should handle invalid id for get", async () => {
        const req = new Request("http://localhost/api/storage/entry/abc");
        const ctx = createExecutionContext();
        const res = await handleRequest(req, env, ctx);
        await waitOnExecutionContext(ctx);
        expect(res.status).toBe(400);
    });

    it("should handle missing type for create", async () => {
        const formData = new FormData();
        formData.append("key", "test");
        const req = new Request("http://localhost/api/storage/entry", { method: "POST", body: formData });
        const ctx = createExecutionContext();
        const res = await handleRequest(req, env, ctx);
        await waitOnExecutionContext(ctx);
        expect(res.status).toBe(400);
    });
});
