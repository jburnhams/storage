import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BuildTimestampBadge } from "../src/components/BuildTimestampBadge";

describe("BuildTimestampBadge", () => {
  it("shows default text when timestamp is not provided", () => {
    render(<BuildTimestampBadge />);
    expect(screen.getByText("Build time unavailable")).toBeInTheDocument();
  });

  it("shows default text when timestamp is placeholder", () => {
    render(<BuildTimestampBadge timestamp="__BUILD_TIMESTAMP__" />);
    expect(screen.getByText("Build time unavailable")).toBeInTheDocument();
  });

  it("formats valid timestamp", () => {
    const timestamp = "2025-01-15T10:30:00.000Z";
    const { container } = render(<BuildTimestampBadge timestamp={timestamp} />);
    const badge = container.querySelector("span");
    expect(badge?.textContent).toContain("Built:");
  });

  it("handles invalid timestamp gracefully", () => {
    render(<BuildTimestampBadge timestamp="invalid-date" />);
    expect(screen.getByText("Build time unavailable")).toBeInTheDocument();
  });

  it("shows default text when timestamp is empty", () => {
    render(<BuildTimestampBadge timestamp="" />);
    expect(screen.getByText("Build time unavailable")).toBeInTheDocument();
  });
});
