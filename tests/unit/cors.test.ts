import { describe, expect, it, beforeEach } from "vitest";
import app from "../../src/worker";
import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from "cloudflare:test";

describe("CORS Support", () => {
  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  const ALLOWED_ORIGINS = [
    "https://sub.jonathanburnhams.com",
    "https://app.jburnhams.workers.dev",
    "http://localhost:3000",
    "http://127.0.0.1:8787"
  ];

  const DISALLOWED_ORIGINS = [
    "https://evil.com",
    "https://notjonathanburnhams.com",
    "https://jburnhams.workers.dev.evil.com"
  ];

  describe("Preflight OPTIONS requests", () => {
    ALLOWED_ORIGINS.forEach(origin => {
      it(`returns correct CORS headers for allowed origin: ${origin}`, async () => {
        const request = new Request("https://storage.test/api/user", {
          method: "OPTIONS",
          headers: {
            "Origin": origin,
            "Access-Control-Request-Method": "GET"
          }
        });
        const ctx = createExecutionContext();
        const response = await app.fetch(request, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
        expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
        expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      });
    });

    DISALLOWED_ORIGINS.forEach(origin => {
        it(`does not return CORS headers for disallowed origin: ${origin}`, async () => {
          const request = new Request("https://storage.test/api/user", {
            method: "OPTIONS",
            headers: {
              "Origin": origin,
              "Access-Control-Request-Method": "GET"
            }
          });
          const ctx = createExecutionContext();
          const response = await app.fetch(request, env, ctx);
          await waitOnExecutionContext(ctx);

          // Should probably still be 204 or maybe 403, but definitely no allow-origin header
          expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
        });
      });
  });

  describe("Simple requests (GET/POST)", () => {
      // We'll test with a simple endpoint like /health or an API endpoint that would fail auth but still return headers?
      // Or /api/user which returns 401. 401 response should also have CORS headers so the browser can read the 401.

      ALLOWED_ORIGINS.forEach(origin => {
        it(`adds CORS headers to response for allowed origin: ${origin}`, async () => {
            const request = new Request("https://storage.test/api/user", {
                method: "GET",
                headers: {
                    "Origin": origin
                }
            });
            const ctx = createExecutionContext();
            const response = await app.fetch(request, env, ctx);
            await waitOnExecutionContext(ctx);

            // It might return 401 because we are not authenticated, but headers should be there
            expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
            expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
        });
      });

      DISALLOWED_ORIGINS.forEach(origin => {
        it(`does not add CORS headers for disallowed origin: ${origin}`, async () => {
            const request = new Request("https://storage.test/api/user", {
                method: "GET",
                headers: {
                    "Origin": origin
                }
            });
            const ctx = createExecutionContext();
            const response = await app.fetch(request, env, ctx);
            await waitOnExecutionContext(ctx);

            expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
        });
      });
  });
});
