import { useState } from "react";
import type { CalculationOperation, CalculationResult, ErrorResponse } from "../types";

interface CalculatorProps {
  onResult: (result: CalculationResult) => void;
  onError: (error: string) => void;
}

export function Calculator({ onResult, onError }: CalculatorProps) {
  const [operandA, setOperandA] = useState<string>("");
  const [operandB, setOperandB] = useState<string>("");
  const [operation, setOperation] = useState<CalculationOperation>("add");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError("");

    const a = parseFloat(operandA);
    const b = parseFloat(operandB);

    if (isNaN(a) || isNaN(b)) {
      onError("Please enter valid numbers");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ a, b, operation }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as ErrorResponse;
        onError(errorData.message || "Calculation failed");
        return;
      }

      onResult(data as CalculationResult);
    } catch (err) {
      onError(`Network error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="calculator" onSubmit={handleSubmit}>
      <div className="calculator__row">
        <label htmlFor="operand-a">First Number:</label>
        <input
          id="operand-a"
          type="number"
          step="any"
          value={operandA}
          onChange={(e) => setOperandA(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="calculator__row">
        <label htmlFor="operation">Operation:</label>
        <select
          id="operation"
          value={operation}
          onChange={(e) => setOperation(e.target.value as CalculationOperation)}
          disabled={loading}
        >
          <option value="add">Add (+)</option>
          <option value="subtract">Subtract (-)</option>
          <option value="multiply">Multiply (×)</option>
          <option value="divide">Divide (÷)</option>
        </select>
      </div>

      <div className="calculator__row">
        <label htmlFor="operand-b">Second Number:</label>
        <input
          id="operand-b"
          type="number"
          step="any"
          value={operandB}
          onChange={(e) => setOperandB(e.target.value)}
          required
          disabled={loading}
        />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? "Calculating..." : "Calculate"}
      </button>
    </form>
  );
}
