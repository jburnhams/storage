import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Calculator } from "../src/components/Calculator";

describe("Calculator", () => {
  const mockOnResult = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    mockOnResult.mockClear();
    mockOnError.mockClear();
    global.fetch = vi.fn();
  });

  it("renders input fields and operation selector", () => {
    render(<Calculator onResult={mockOnResult} onError={mockOnError} />);
    expect(screen.getByLabelText(/First Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Second Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Operation/i)).toBeInTheDocument();
  });

  it("calls onError when invalid numbers are entered", async () => {
    render(<Calculator onResult={mockOnResult} onError={mockOnError} />);

    const form = screen.getByRole("button", { name: /Calculate/i }).closest("form")!;

    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith("Please enter valid numbers");
    });
  });

  it("submits calculation request to API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 8, operation: "add", operands: { a: 5, b: 3 } }),
    });
    global.fetch = mockFetch;

    render(<Calculator onResult={mockOnResult} onError={mockOnError} />);

    const firstInput = screen.getByLabelText(/First Number/i);
    const secondInput = screen.getByLabelText(/Second Number/i);
    const calculateButton = screen.getByRole("button", { name: /Calculate/i });

    fireEvent.change(firstInput, { target: { value: "5" } });
    fireEvent.change(secondInput, { target: { value: "3" } });
    fireEvent.click(calculateButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: 5, b: 3, operation: "add" }),
      });
      expect(mockOnResult).toHaveBeenCalledWith({
        result: 8,
        operation: "add",
        operands: { a: 5, b: 3 },
      });
    });
  });
});
