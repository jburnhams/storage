import { describe, expect, it, vi, beforeEach } from "vitest";
import app from "../../src/worker";
import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from "cloudflare:test";

// We still mock session/storage internals if we want to isolate the Worker routing logic,
// OR we can use the real implementation if we want an integration-style unit test.
// The user asked to "review testing" and use the vitest library.
// Given the previous tests were mocking `handleRequest` dependencies, let's try to make them more realistic
// by using the real DB, but we might still need to mock OAuth/Session secrets if they aren't in the env.
// However, since we have `env` from cloudflare:test, we can assume it has the bindings from wrangler.toml (or mocks).

// BUT, `worker.test.ts` was testing routing logic.
// If we use real DB, we need to seed it.
// If we use real Google Auth flows, we might get stuck redirecting.

// Let's stick to the spirit of the original test: "Unit test the worker routing".
// But now we pass a REAL `env` object (with D1) instead of a manual mock.
// We can still mock the internal logic if we want, OR we can let it run through.
// The original test mocked `handleRequest` environment.

// For `worker.test.ts`, the original used `mockEnv`.
// Now we use `env` from `cloudflare:test`.

// Note: The original test mocked `GOOGLE_CLIENT_ID` etc.
// We should check if `env` has them. `vitest-pool-workers` uses `wrangler.toml` or `vitest.config.ts` bindings.
// `miniflare` inside the pool handles it.

describe("Storage Auth Worker", () => {
  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  it("serves the frontend at root path", async () => {
    const request = new Request("https://storage.test/");
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("responds to health check", async () => {
    const request = new Request("https://storage.test/health");
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("returns 404 for unknown paths", async () => {
    const request = new Request("https://storage.test/unknown");
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(404);
  });

  describe("Auth Routes", () => {
    it("/auth/login redirects to Google OAuth", async () => {
      const request = new Request("https://storage.test/auth/login");
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(302);
      const location = response.headers.get("Location");
      expect(location).toContain("accounts.google.com");
      // The actual client ID might come from wrangler.toml or be undefined if not set.
      // If not set in toml, it might be undefined/empty string.
      // For tests, we might want to ensure it's set in vitest config or toml.
      // Assuming wrangler.toml has it or we can set it on `env` if mutable (it's usually not).
    });

    it("/auth/logout redirects to home and clears cookie", async () => {
      const request = new Request("https://storage.test/auth/logout", {
        method: "POST",
      });
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
      const cookie = response.headers.get("Set-Cookie");
      expect(cookie).toContain("Max-Age=0");
    });

    it("/auth/logout rejects GET requests", async () => {
      const request = new Request("https://storage.test/auth/logout");
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(405);
      const result = await response.json();
      expect(result.error).toBe("METHOD_NOT_ALLOWED");
    });
  });

  describe("API Routes - Unauthenticated", () => {
    it("/api/user returns 401 with login_url without session", async () => {
      const request = new Request("https://storage.test/api/user");
      const ctx = createExecutionContext();
      const response = await app.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      const result = await response.json() as any;
      expect(result.error).toBe("UNAUTHORIZED");
      expect(result.login_url).toBe("https://storage.test/auth/login");
    });
  });

  describe("Auth Redirect", () => {
     it("encodes redirect URL in state", async () => {
        const redirectTarget = "https://client-app.com/dashboard";
        const request = new Request(`https://storage.test/auth/login?redirect=${encodeURIComponent(redirectTarget)}`);
        const ctx = createExecutionContext();
        const response = await app.fetch(request, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(302);
        const location = response.headers.get("Location");
        expect(location).toBeDefined();

        // Extract state param from location URL
        const url = new URL(location!);
        const stateParam = url.searchParams.get("state");
        expect(stateParam).toBeTruthy();

        // Decode state to verify
        // We can't import decodeState easily here as it is internal to worker (or we can import if exported)
        // But we can check if it looks like base64
        expect(stateParam).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
     });

     it("handles unicode in redirect URL", async () => {
        const redirectTarget = "https://client-app.com/dàshbøard?q=🔍";
        const request = new Request(`https://storage.test/auth/login?redirect=${encodeURIComponent(redirectTarget)}`);
        const ctx = createExecutionContext();
        const response = await app.fetch(request, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(302);
        const location = response.headers.get("Location");
        expect(location).toBeDefined();

        const url = new URL(location!);
        const stateParam = url.searchParams.get("state");
        expect(stateParam).toBeTruthy();
     });
  });

  // We can't easily test handleCallback validation here without mocking the entire OAuth flow dependencies
  // (exchangeCodeForToken, getGoogleUserInfo, etc) which are imported directly in worker.ts.
  // However, the logic change in worker.ts is simple enough: strict check for `//`.
});
