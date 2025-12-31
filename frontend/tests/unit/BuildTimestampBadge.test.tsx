import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuildTimestampBadge } from "../../src/components/BuildTimestampBadge";

// Mock the imported JSON
vi.mock("../../src/build-metadata.json", () => ({
  default: {
    timestamp: "2023-10-27T10:00:00.000Z",
  },
}));

describe("BuildTimestampBadge", () => {
  it("renders with the mocked timestamp from JSON when no prop is provided", () => {
    render(<BuildTimestampBadge />);
    const badge = screen.getByText(/Built:/i);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain("Oct 27, 2023");
  });

  it("prioritizes the timestamp prop over the JSON fallback", () => {
    // Override the mock with a prop
    const propTimestamp = "2024-01-01T12:00:00.000Z";
    render(<BuildTimestampBadge timestamp={propTimestamp} />);
    const badge = screen.getByText(/Built:/i);
    expect(badge.textContent).toContain("Jan 1, 2024");
  });

  it("handles invalid date gracefully", () => {
    render(<BuildTimestampBadge timestamp="invalid-date" />);
    // If invalid prop is passed, it should fail parsing and show fallback text
    const badge = screen.getByText("Build time unavailable");
    expect(badge).toBeInTheDocument();
  });
});
