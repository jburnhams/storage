export type CalculationOperation = "add" | "subtract" | "multiply" | "divide";

export interface CalculationRequest {
  a: number;
  b: number;
  operation: CalculationOperation;
}

export interface CalculationResult {
  result: number;
  operation: CalculationOperation;
  operands: {
    a: number;
    b: number;
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
}
