import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60000, // Integration tests may take longer
    hookTimeout: 60000,
    // Run tests sequentially to avoid resource contention
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
});
