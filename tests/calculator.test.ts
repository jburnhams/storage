import { describe, expect, it } from "vitest";
import { calculate, createCalculationResult } from "../src/calculator";

describe("calculator", () => {
  describe("calculate", () => {
    it("adds two numbers", () => {
      expect(calculate(5, 3, "add")).toBe(8);
      expect(calculate(-2, 7, "add")).toBe(5);
      expect(calculate(0, 0, "add")).toBe(0);
    });

    it("subtracts two numbers", () => {
      expect(calculate(10, 3, "subtract")).toBe(7);
      expect(calculate(5, 10, "subtract")).toBe(-5);
      expect(calculate(0, 0, "subtract")).toBe(0);
    });

    it("multiplies two numbers", () => {
      expect(calculate(5, 4, "multiply")).toBe(20);
      expect(calculate(-3, 7, "multiply")).toBe(-21);
      expect(calculate(0, 10, "multiply")).toBe(0);
    });

    it("divides two numbers", () => {
      expect(calculate(10, 2, "divide")).toBe(5);
      expect(calculate(7, 2, "divide")).toBe(3.5);
      expect(calculate(-10, 2, "divide")).toBe(-5);
    });

    it("throws error on division by zero", () => {
      expect(() => calculate(10, 0, "divide")).toThrow("Division by zero");
    });
  });

  describe("createCalculationResult", () => {
    it("returns formatted result for addition", () => {
      const result = createCalculationResult(5, 3, "add");
      expect(result).toEqual({
        result: 8,
        operation: "add",
        operands: { a: 5, b: 3 },
      });
    });

    it("returns formatted result for multiplication", () => {
      const result = createCalculationResult(6, 7, "multiply");
      expect(result).toEqual({
        result: 42,
        operation: "multiply",
        operands: { a: 6, b: 7 },
      });
    });
  });
});
