import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations("./migrations");

  return {
    test: {
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
      deps: {
        optimizer: {
          ssr: {
            enabled: true,
          },
        },
      },
      globals: true,
      include: ["tests/unit/**/*.test.ts"],
      coverage: {
        provider: "istanbul",
        reporter: ["text", "lcov"],
      },
    },
  };
});
