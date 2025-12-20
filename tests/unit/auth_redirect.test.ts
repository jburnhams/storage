import { describe, expect, it, beforeEach } from "vitest";
import { handleRequest } from "../../src/worker";
import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from "cloudflare:test";

describe("Unauthorized Redirect Logic", () => {
  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  it("should include redirect param from query string in login_url", async () => {
    const redirectUrl = "https://example.com/dashboard";
    const request = new Request(`https://storage.test/api/session?redirect=${encodeURIComponent(redirectUrl)}`);
    const ctx = createExecutionContext();
    const response = await handleRequest(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    const result = await response.json() as any;
    expect(result.error).toBe("UNAUTHORIZED");
    expect(result.login_url).toBe(`https://storage.test/auth/login?redirect=${encodeURIComponent(redirectUrl)}`);
  });

  it("should include redirect param from Referer header in login_url", async () => {
    const referer = "https://example.com/dashboard";
    const request = new Request("https://storage.test/api/session", {
      headers: {
        "Referer": referer
      }
    });
    const ctx = createExecutionContext();
    const response = await handleRequest(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    const result = await response.json() as any;
    expect(result.error).toBe("UNAUTHORIZED");
    expect(result.login_url).toBe(`https://storage.test/auth/login?redirect=${encodeURIComponent(referer)}`);
  });

  it("should prioritize query param over Referer header", async () => {
    const queryRedirect = "https://example.com/query";
    const refererRedirect = "https://example.com/referer";
    const request = new Request(`https://storage.test/api/session?redirect=${encodeURIComponent(queryRedirect)}`, {
      headers: {
        "Referer": refererRedirect
      }
    });
    const ctx = createExecutionContext();
    const response = await handleRequest(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    const result = await response.json() as any;
    expect(result.error).toBe("UNAUTHORIZED");
    expect(result.login_url).toBe(`https://storage.test/auth/login?redirect=${encodeURIComponent(queryRedirect)}`);
  });

  it("should not include redirect param if neither query param nor Referer is present", async () => {
    const request = new Request("https://storage.test/api/session");
    const ctx = createExecutionContext();
    const response = await handleRequest(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    const result = await response.json() as any;
    expect(result.error).toBe("UNAUTHORIZED");
    expect(result.login_url).toBe("https://storage.test/auth/login");
  });
});
