import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../src/App";

describe("App", () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = vi.fn();
  });

  it("shows loading state initially", async () => {
    // Create a promise we can resolve manually
    let resolveFetch: (value: any) => void;
    const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
    });

    global.fetch = vi.fn(() => fetchPromise);

    await act(async () => {
        render(
          <MemoryRouter>
            <App />
          </MemoryRouter>
        );
    });

    // Check loading state while the promise is pending
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // Now resolve the promise to complete the effect cycle and avoid teardown errors
    await act(async () => {
        resolveFetch!({
            ok: false,
            json: async () => ({})
        });
    });
  });

  it("shows login page when not authenticated", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({}),
      })
    ) as any;

    await act(async () => {
        render(
          <MemoryRouter>
            <App />
          </MemoryRouter>
        );
    });

    await waitFor(() => {
      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    });
  });

  it("shows user dashboard when authenticated", async () => {
    const mockUser = {
      id: 1,
      email: "test@example.com",
      name: "Test User",
      profile_picture: null,
      is_admin: false,
      created_at: "2025-12-16T00:00:00Z",
      updated_at: "2025-12-16T00:00:00Z",
      last_login_at: "2025-12-16T00:00:00Z",
    };

    const mockSession = {
      id: "session123",
      user_id: 1,
      created_at: new Date().toISOString(),
      expires_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      user: mockUser,
    };

    // Need to mock fetch calls made by dashboard too if any?
    // UserDashboard likely fetches stats or entries.
    // We should mock them to avoid warnings or errors.

    global.fetch = vi.fn((url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("/api/user")) {
            return Promise.resolve({
                ok: true,
                json: async () => mockUser,
            });
        }
        if (urlStr.includes("/api/session")) {
             return Promise.resolve({
                ok: true,
                json: async () => mockSession,
            });
        }
        if (urlStr.includes("/api/storage/entries") || urlStr.includes("/api/collections")) {
             return Promise.resolve({
                ok: true,
                json: async () => [],
            });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
    }) as any;

    await act(async () => {
        render(
          <MemoryRouter>
            <App />
          </MemoryRouter>
        );
    });

    await waitFor(() => {
      expect(screen.getByText("Storage Auth Service")).toBeInTheDocument();
      expect(screen.getByText("Test User")).toBeInTheDocument();
    });
  });
});
