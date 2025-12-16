import { useState } from "react";
import { Calculator } from "./components/Calculator";
import { ResultDisplay } from "./components/ResultDisplay";
import { BuildTimestampBadge } from "./components/BuildTimestampBadge";
import type { CalculationResult } from "./types";

export function App() {
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [error, setError] = useState<string>("");

  const handleResult = (newResult: CalculationResult) => {
    setResult(newResult);
    setError("");
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    if (errorMessage) {
      setResult(null);
    }
  };

  return (
    <main className="page">
      <header>
        <h1>Calculator App</h1>
        <p>A simple calculator with a Cloudflare Worker backend.</p>
      </header>

      <section>
        <h2>Calculate</h2>
        <Calculator onResult={handleResult} onError={handleError} />
      </section>

      {error && (
        <section className="error">
          <h2>Error</h2>
          <pre>{error}</pre>
        </section>
      )}

      {result && <ResultDisplay result={result} />}

      <footer className="build-info">
        <BuildTimestampBadge timestamp="__BUILD_TIMESTAMP__" />
      </footer>
    </main>
  );
}
