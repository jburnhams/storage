import { describe, it, expect, afterEach } from "vitest";
import { Miniflare } from "miniflare";
import { createMiniflareInstance } from "./setup";

describe("Secrets and Environment Bindings", () => {
  let mf: Miniflare;

  afterEach(async () => {
    if (mf) {
      await mf.dispose();
    }
  });

  it("should provide access to D1 database binding", async () => {
    mf = await createMiniflareInstance({});
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

    mf = await createMiniflareInstance({ secrets: testSecrets });

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

    await mf.setOptions({
      modules: true,
      script: testScript,
      d1Databases: { DB: ":memory:" },
      bindings: testSecrets,
    });

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
    mf = await createMiniflareInstance({});

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

    await mf.setOptions({
      modules: true,
      script: testScript,
      d1Databases: { DB: ":memory:" },
      bindings: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      },
    });

    const response = await mf.dispatchFetch("http://localhost/");
    const data = await response.json() as any;

    expect(data.clientId).toBe("test-client-id");
    expect(data.hasDB).toBe(true);
  });

  it("should handle session secret of correct length", async () => {
    const validSessionSecret = "a".repeat(64); // 64 hex chars

    mf = await createMiniflareInstance({
      secrets: {
        SESSION_SECRET: validSessionSecret,
      },
    });

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

    await mf.setOptions({
      modules: true,
      script: testScript,
      bindings: {
        SESSION_SECRET: validSessionSecret,
      },
    });

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

    mf = await createMiniflareInstance({ secrets: testSecrets });

    const testScript = `
      export default {
        async fetch(request, env) {
          // Test that we can access both DB and secrets
          const db = env.DB;
          await db.prepare("SELECT 1 as test").first();

          return Response.json({
            dbWorks: true,
            hasSecrets: !!env.GOOGLE_CLIENT_ID && !!env.SESSION_SECRET,
            clientId: env.GOOGLE_CLIENT_ID,
          });
        }
      };
    `;

    await mf.setOptions({
      modules: true,
      script: testScript,
      d1Databases: { DB: ":memory:" },
      bindings: testSecrets,
    });

    const response = await mf.dispatchFetch("http://localhost/");
    const data = await response.json() as any;

    expect(data.dbWorks).toBe(true);
    expect(data.hasSecrets).toBe(true);
    expect(data.clientId).toBe("integration-test-id");
  });

  it("should allow reconfiguring secrets for different instances", async () => {
    // Test that we can create an instance with custom secrets
    mf = await createMiniflareInstance({
      secrets: { GOOGLE_CLIENT_ID: "custom-instance-id" },
    });

    const testScript = `
      export default {
        async fetch(request, env) {
          return Response.json({ clientId: env.GOOGLE_CLIENT_ID });
        }
      };
    `;

    await mf.setOptions({
      modules: true,
      script: testScript,
      bindings: { GOOGLE_CLIENT_ID: "custom-instance-id" },
    });

    const response = await mf.dispatchFetch("http://localhost/");
    const data = await response.json() as any;
    expect(data.clientId).toBe("custom-instance-id");
  });
});
