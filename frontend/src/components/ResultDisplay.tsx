import type { CalculationResult } from "../types";

interface ResultDisplayProps {
  result: CalculationResult;
}

const OPERATION_SYMBOLS: Record<string, string> = {
  add: "+",
  subtract: "-",
  multiply: "×",
  divide: "÷",
};

export function ResultDisplay({ result }: ResultDisplayProps) {
  const symbol = OPERATION_SYMBOLS[result.operation] || result.operation;

  return (
    <section className="result">
      <h2>Result</h2>
      <div className="result__calculation">
        <div className="result__expression">
          {result.operands.a} {symbol} {result.operands.b} = {result.result}
        </div>
        <div className="result__value">{result.result}</div>
      </div>
    </section>
  );
}
