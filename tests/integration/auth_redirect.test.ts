import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Miniflare } from "miniflare";
import {
  createMiniflareInstance,
  seedTestData,
  cleanDatabase,
  bundleWorker,
} from "./setup";

describe("Auth Redirect Integration Tests", () => {
  let mf: Miniflare;
  let db: D1Database;
  let workerScript: string;
  let persistPath: string;

  beforeAll(async () => {
    workerScript = await bundleWorker();

    const result = await createMiniflareInstance({
      secrets: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
      script: workerScript,
    });
    mf = result.mf;
    persistPath = result.persistPath;

    db = await mf.getD1Database("DB");
  });

  beforeEach(async () => {
    db = await mf.getD1Database("DB");
    await cleanDatabase(db);
    await seedTestData(db);
  });

  afterAll(async () => {
    if (mf) await mf.dispose();
    try {
      const { rmSync } = await import("fs");
      if (persistPath) rmSync(persistPath, { recursive: true, force: true });
    } catch (e) {
      console.error("Failed to clean up D1 persistence:", e);
    }
  });

  it("should return 401 with login_url for unauthenticated API requests", async () => {
    const response = await mf.dispatchFetch("http://localhost/api/user");

    expect(response.status).toBe(401);
    const body = await response.json() as any;
    expect(body.error).toBe("UNAUTHORIZED");
    expect(body.login_url).toBe("http://localhost/auth/login");
  });

  it("should encode redirect URL in state parameter when initiating login", async () => {
    const redirectUrl = "http://client-app.com/dashboard";
    const response = await mf.dispatchFetch(`http://localhost/auth/login?redirect=${encodeURIComponent(redirectUrl)}`, {
        redirect: 'manual'
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toContain("accounts.google.com");

    // Extract state parameter
    const url = new URL(location!);
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();

    // Decode state (it's base64 encoded JSON, now with unicode support)
    // We need to mirror the decode logic from src/oauth.ts or just check if it parses
    // Client side decode logic for test:
    const decodedStr = atob(state!);
    const jsonStr = decodeURIComponent(decodedStr.split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const decodedState = JSON.parse(jsonStr);
    expect(decodedState.nonce).toBeDefined();
    expect(decodedState.redirect).toBe(redirectUrl);
  });

  it("should not include redirect in state if not provided", async () => {
    const response = await mf.dispatchFetch("http://localhost/auth/login", {
        redirect: 'manual'
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("Location");

    const url = new URL(location!);
    const state = url.searchParams.get("state");

    const decodedStr = atob(state!);
    const jsonStr = decodeURIComponent(decodedStr.split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const decodedState = JSON.parse(jsonStr);
    expect(decodedState.nonce).toBeDefined();
    expect(decodedState.redirect).toBeUndefined();
  });

  it("should support valid domains in redirect", async () => {
    // We can't easily test the full callback flow here because it requires mocking Google and the session creation.
    // However, the unit tests cover the logic inside handleCallback.
    // The integration tests confirm that handleLogin correctly encodes the redirect we pass.

    // We can at least verifying handleLogin accepts "evil.com" and encodes it.
    // The validation happens at handleCallback (decoding time).

    const redirectUrl = "http://evil.com/login";
    const response = await mf.dispatchFetch(`http://localhost/auth/login?redirect=${encodeURIComponent(redirectUrl)}`, {
        redirect: 'manual'
    });

    expect(response.status).toBe(302);
    // The worker should still ENCODE it into the state (because validation happens on callback)
    const location = response.headers.get("Location");
    const url = new URL(location!);
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
  });
});
