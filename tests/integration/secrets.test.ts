import { describe, it, expect, afterEach } from "vitest";
import { Miniflare } from "miniflare";
import { createMiniflareInstance } from "./setup";

describe("Secrets and Environment Bindings", () => {
  let mf: Miniflare;
  let persistPaths: string[] = [];

  afterEach(async () => {
    if (mf) {
      await mf.dispose();
    }
    // Cleanup any paths created during tests
    for (const path of persistPaths) {
      try {
        const { rmSync } = await import("fs");
        rmSync(path, { recursive: true, force: true });
      } catch (e) {
        // Ignore errors
      }
    }
    persistPaths = [];
  });

  it("should provide access to D1 database binding", async () => {
    // Isolate to prevent affecting shared instance
    const result = await createMiniflareInstance({ isolate: true });
    mf = result.mf;
    persistPaths.push(result.persistPath);

    const db = await mf.getD1Database("DB");

    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe("function");
    expect(typeof db.batch).toBe("function");
  });

  it("should provide access to secrets as environment variables", async () => {
    const testSecrets = {
      GOOGLE_CLIENT_ID: "custom-client-id-123",
      GOOGLE_CLIENT_SECRET: "custom-secret-abc",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    };

    // Create a test worker to access bindings
    const testScript = `
      export default {
        async fetch(request, env) {
          return Response.json({
            hasClientId: !!env.GOOGLE_CLIENT_ID,
            hasClientSecret: !!env.GOOGLE_CLIENT_SECRET,
            hasSessionSecret: !!env.SESSION_SECRET,
            clientId: env.GOOGLE_CLIENT_ID,
            // Don't expose actual secrets in response
            secretLength: env.GOOGLE_CLIENT_SECRET?.length || 0,
            sessionSecretLength: env.SESSION_SECRET?.length || 0,
          });
        }
      };
    `;

    const result = await createMiniflareInstance({
      secrets: testSecrets,
      script: testScript,
      isolate: true // Isolate
    });
    mf = result.mf;
    persistPaths.push(result.persistPath);

    const response = await mf.dispatchFetch("http://localhost/");
    const data = await response.json() as any;

    expect(data.hasClientId).toBe(true);
    expect(data.hasClientSecret).toBe(true);
    expect(data.hasSessionSecret).toBe(true);
    expect(data.clientId).toBe("custom-client-id-123");
    expect(data.secretLength).toBe(testSecrets.GOOGLE_CLIENT_SECRET.length);
    expect(data.sessionSecretLength).toBe(64); // 64 hex chars
  });

  it("should provide default test secrets when none specified", async () => {
    const testScript = `
      export default {
        async fetch(request, env) {
          return Response.json({
            clientId: env.GOOGLE_CLIENT_ID,
            hasDB: !!env.DB,
          });
        }
      };
    `;

    // Initialize with script directly to ensure DB binding is preserved/set correctly
    const result = await createMiniflareInstance({
      script: testScript,
      isolate: true // Isolate
    });
    mf = result.mf;
    persistPaths.push(result.persistPath);

    const response = await mf.dispatchFetch("http://localhost/");
    const data = await response.json() as any;

    expect(data.clientId).toBe("test-client-id");
    expect(data.hasDB).toBe(true);
  });

  it("should handle session secret of correct length", async () => {
    const validSessionSecret = "a".repeat(64); // 64 hex chars

    const testScript = `
      export default {
        async fetch(request, env) {
          return Response.json({
            sessionSecretLength: env.SESSION_SECRET.length,
            isValidLength: env.SESSION_SECRET.length === 64,
          });
        }
      };
    `;

    const result = await createMiniflareInstance({
      secrets: {
        SESSION_SECRET: validSessionSecret,
      },
      script: testScript,
      isolate: true // Isolate
    });
    mf = result.mf;
    persistPaths.push(result.persistPath);

    const response = await mf.dispatchFetch("http://localhost/");
    const data = await response.json() as any;

    expect(data.sessionSecretLength).toBe(64);
    expect(data.isValidLength).toBe(true);
  });

  it("should allow accessing DB binding and secrets together", async () => {
    const testSecrets = {
      GOOGLE_CLIENT_ID: "integration-test-id",
      GOOGLE_CLIENT_SECRET: "integration-test-secret",
      SESSION_SECRET: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    };

    const testScript = `
      export default {
        async fetch(request, env) {
          // Test that we can access both DB and secrets
          const db = env.DB;
          try {
            await db.prepare("SELECT 1 as test").first();
          } catch (e) {
            return Response.json({ error: e.message }, { status: 500 });
          }

          return Response.json({
            dbWorks: true,
            hasSecrets: !!env.GOOGLE_CLIENT_ID && !!env.SESSION_SECRET,
            clientId: env.GOOGLE_CLIENT_ID,
          });
        }
      };
    `;

    const result = await createMiniflareInstance({
      secrets: testSecrets,
      script: testScript,
      isolate: true // Isolate
    });
    mf = result.mf;
    persistPaths.push(result.persistPath);

    const response = await mf.dispatchFetch("http://localhost/");
    const data = await response.json() as any;

    expect(data.dbWorks).toBe(true);
    expect(data.hasSecrets).toBe(true);
    expect(data.clientId).toBe("integration-test-id");
  });

  it("should allow reconfiguring secrets for different instances", async () => {
    const testScript = `
      export default {
        async fetch(request, env) {
          return Response.json({ clientId: env.GOOGLE_CLIENT_ID });
        }
      };
    `;

    // Test that we can create an instance with custom secrets
    const result = await createMiniflareInstance({
      secrets: { GOOGLE_CLIENT_ID: "custom-instance-id" },
      script: testScript,
      isolate: true // Isolate
    });
    mf = result.mf;
    persistPaths.push(result.persistPath);

    const response = await mf.dispatchFetch("http://localhost/");
    const data = await response.json() as any;
    expect(data.clientId).toBe("custom-instance-id");
  });
});
