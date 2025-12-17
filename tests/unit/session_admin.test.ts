import { describe, expect, it, vi, beforeEach } from "vitest";
import { env, applyD1Migrations } from "cloudflare:test";
import {
  MASTER_ADMIN_EMAILS,
  getOrCreateUser,
} from "../../src/session";

describe("Session Management (Admin)", () => {
  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  describe("getOrCreateUser with admin email", () => {
    it("should create new user as admin if email is in MASTER_ADMIN_EMAILS", async () => {
      const adminEmail = "admin@test.com";
      // Temporarily modify MASTER_ADMIN_EMAILS for test
      MASTER_ADMIN_EMAILS.push(adminEmail);

      try {
        const user = await getOrCreateUser(
            adminEmail,
            "Admin User",
            "pic.jpg",
            env
        );

        expect(user.is_admin).toBe(1);

        // Verify in DB
        const saved = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(adminEmail).first();
        expect(saved.is_admin).toBe(1);

      } finally {
        // Cleanup
        const index = MASTER_ADMIN_EMAILS.indexOf(adminEmail);
        if (index > -1) {
            MASTER_ADMIN_EMAILS.splice(index, 1);
        }
      }
    });
  });
});
