import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30000, // Integration tests may take longer
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
});
