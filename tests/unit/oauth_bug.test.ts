import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import app from "../../src/worker";
import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from "cloudflare:test";
import * as oauth from "../../src/oauth";

// Mock the oauth module functions that communicate with Google
vi.mock("../../src/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof oauth>();
  return {
    ...actual,
    exchangeCodeForToken: vi.fn(),
    getGoogleUserInfo: vi.fn(),
  };
});

describe("OAuth Callback Bug Reproduction", () => {
  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should set the session cookie with the session ID string, not [object Object]", async () => {
    // Setup mocks
    const mockExchangeCodeForToken = vi.mocked(oauth.exchangeCodeForToken);
    mockExchangeCodeForToken.mockResolvedValue({
      access_token: "mock_access_token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "openid email profile",
      id_token: "mock_id_token",
    });

    const mockGetGoogleUserInfo = vi.mocked(oauth.getGoogleUserInfo);
    mockGetGoogleUserInfo.mockResolvedValue({
      id: "12345",
      email: "test@example.com",
      verified_email: true,
      name: "Test User",
      given_name: "Test",
      family_name: "User",
      picture: "https://example.com/pic.jpg",
      locale: "en",
    });

    // Generate valid state
    const nonce = "test-nonce";
    const state = oauth.encodeState(nonce, "/dashboard");

    // Create request
    const request = new Request(`https://storage.jonathanburnhams.com/auth/callback?code=mock_code&state=${state}`, {
      headers: {
        "Cookie": `oauth_state=${state}`,
        "Host": "storage.jonathanburnhams.com"
      }
    });

    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(302);

    // Check Set-Cookie header
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).not.toBeNull();

    // The bug is that it contains "storage_session=[object Object]"
    // The test should FAIL if the bug is present.
    // However, since I want to confirm the issue, I will assert what it CURRENTLY does (fail expectation of correctness)
    // or I can assert correctness and expect the test to fail.

    // I will assert that it DOES NOT contain [object Object] to fail the test and confirm the bug.
    expect(setCookie).not.toContain("storage_session=[object Object]");

    // It should contain a valid session ID (hex string)
    // We can't know the exact ID, but we can check the format if it wasn't [object Object]
  });
});
