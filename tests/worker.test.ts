import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/worker";

// Mock environment with minimal D1 database
const mockEnv = {
  DB: {
    prepare: () => ({
      bind: () => ({
        run: async () => ({}),
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
      run: async () => ({}),
      first: async () => null,
      all: async () => ({ results: [] }),
    }),
  },
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  SESSION_SECRET: "test-session-secret",
};

const dummyCtx = {
  waitUntil: () => {},
};

describe("Storage Auth Worker", () => {
  it("serves the frontend at root path", async () => {
    const request = new Request("https://storage.test/");
    const response = await handleRequest(request, mockEnv, dummyCtx);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("responds to health check", async () => {
    const request = new Request("https://storage.test/health");
    const response = await handleRequest(request, mockEnv, dummyCtx);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("returns 404 for unknown paths", async () => {
    const request = new Request("https://storage.test/unknown");
    const response = await handleRequest(request, mockEnv, dummyCtx);
    expect(response.status).toBe(404);
  });

  describe("Auth Routes", () => {
    it("/auth/login redirects to Google OAuth", async () => {
      const request = new Request("https://storage.test/auth/login");
      const response = await handleRequest(request, mockEnv, dummyCtx);
      expect(response.status).toBe(302);
      const location = response.headers.get("Location");
      expect(location).toContain("accounts.google.com");
      expect(location).toContain("client_id=test-client-id");
    });

    it("/auth/logout redirects to home and clears cookie", async () => {
      const request = new Request("https://storage.test/auth/logout", {
        method: "POST",
      });
      const response = await handleRequest(request, mockEnv, dummyCtx);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
      const cookie = response.headers.get("Set-Cookie");
      expect(cookie).toContain("Max-Age=0");
    });

    it("/auth/logout rejects GET requests", async () => {
      const request = new Request("https://storage.test/auth/logout");
      const response = await handleRequest(request, mockEnv, dummyCtx);
      expect(response.status).toBe(405);
      const result = await response.json();
      expect(result.error).toBe("METHOD_NOT_ALLOWED");
    });
  });

  describe("API Routes - Unauthenticated", () => {
    it("/api/user returns 401 without session", async () => {
      const request = new Request("https://storage.test/api/user");
      const response = await handleRequest(request, mockEnv, dummyCtx);
      expect(response.status).toBe(401);
      const result = await response.json();
      expect(result.error).toBe("UNAUTHORIZED");
    });

    it("/api/session returns 401 without session", async () => {
      const request = new Request("https://storage.test/api/session");
      const response = await handleRequest(request, mockEnv, dummyCtx);
      expect(response.status).toBe(401);
      const result = await response.json();
      expect(result.error).toBe("UNAUTHORIZED");
    });

    it("/api/users returns 401 without session", async () => {
      const request = new Request("https://storage.test/api/users");
      const response = await handleRequest(request, mockEnv, dummyCtx);
      expect(response.status).toBe(401);
      const result = await response.json();
      expect(result.error).toBe("UNAUTHORIZED");
    });

    it("/api/sessions returns 401 without session", async () => {
      const request = new Request("https://storage.test/api/sessions");
      const response = await handleRequest(request, mockEnv, dummyCtx);
      expect(response.status).toBe(401);
      const result = await response.json();
      expect(result.error).toBe("UNAUTHORIZED");
    });
  });
});
