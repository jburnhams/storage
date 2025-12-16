import type { CalculationOperation, CalculationResult } from "./types";

export function calculate(
  a: number,
  b: number,
  operation: CalculationOperation
): number {
  switch (operation) {
    case "add":
      return a + b;
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "divide":
      if (b === 0) {
        throw new Error("Division by zero");
      }
      return a / b;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

export function createCalculationResult(
  a: number,
  b: number,
  operation: CalculationOperation
): CalculationResult {
  const result = calculate(a, b, operation);
  return {
    result,
    operation,
    operands: { a, b },
  };
}
