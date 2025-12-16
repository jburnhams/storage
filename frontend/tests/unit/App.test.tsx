import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../src/App";

describe("App", () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = vi.fn();
  });

  it("shows loading state initially", () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({}),
      })
    ) as any;

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows login page when not authenticated", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({}),
      })
    ) as any;

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

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

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => mockUser,
      })
    ) as any;

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Storage Auth Service")).toBeInTheDocument();
      expect(screen.getByText("Test User")).toBeInTheDocument();
    });
  });
});
