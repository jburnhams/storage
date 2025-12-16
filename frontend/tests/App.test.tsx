import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";

describe("App", () => {
  it("renders the main heading", () => {
    render(<App />);
    expect(screen.getByText("Calculator App")).toBeInTheDocument();
  });

  it("renders the calculator form", () => {
    render(<App />);
    expect(screen.getByLabelText(/First Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Second Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Operation/i)).toBeInTheDocument();
  });

  it("renders the calculate button", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /Calculate/i })).toBeInTheDocument();
  });
});
