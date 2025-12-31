import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuildTimestampBadge } from "./BuildTimestampBadge";

// Mock the imported JSON
vi.mock("../build-metadata.json", () => ({
  default: {
    timestamp: "2023-10-27T10:00:00.000Z",
  },
}));

describe("BuildTimestampBadge", () => {
  it("renders with the mocked timestamp", () => {
    render(<BuildTimestampBadge />);
    const badge = screen.getByText(/Built:/i);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain("Oct 27, 2023");
  });

  it("handles invalid date gracefully", () => {
    // Unmock to test fallback behavior or override via prop
    // Since we mocked the module, we can rely on the prop override behavior we implemented for testing
    render(<BuildTimestampBadge timestamp="invalid-date" />);
    const badge = screen.getByText("Build time unavailable");
    expect(badge).toBeInTheDocument();
  });
});
