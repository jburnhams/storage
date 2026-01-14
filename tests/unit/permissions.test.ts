import { env, applyD1Migrations } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { checkAccess, grantAccess, revokeAccess } from "../../src/permissions";
import { createCollection, createEntry } from "../../src/storage";
import { createUser } from "../../src/session";
import { User, AccessLevel } from "../../src/types";

describe("Permissions Logic", () => {
  let owner: User;
  let viewer: User;
  let editor: User;
  let stranger: User;
  let admin: User;

  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

    // Create users
    owner = await createUser({ email: "owner@test.com", name: "Owner", user_type: "STANDARD" }, env);
    viewer = await createUser({ email: "viewer@test.com", name: "Viewer", user_type: "STANDARD" }, env);
    editor = await createUser({ email: "editor@test.com", name: "Editor", user_type: "STANDARD" }, env);
    stranger = await createUser({ email: "stranger@test.com", name: "Stranger", user_type: "STANDARD" }, env);
    admin = await createUser({ email: "admin@test.com", name: "Admin", user_type: "ADMIN" }, env);
  });

  describe("Collection Access", () => {
    it("should allow owner full access (ADMIN)", async () => {
      const col = await createCollection(env, owner.id, "Test Col");
      const level = await checkAccess(env, owner, "collection", col.id);
      expect(level).toBe("ADMIN");
    });

    it("should allow global admin full access (ADMIN)", async () => {
      const col = await createCollection(env, owner.id, "Test Col");
      const level = await checkAccess(env, admin, "collection", col.id);
      expect(level).toBe("ADMIN");
    });

    it("should allow granted user access", async () => {
      const col = await createCollection(env, owner.id, "Test Col");
      await grantAccess(env, viewer.id, "collection", col.id, "READONLY");

      const level = await checkAccess(env, viewer, "collection", col.id);
      expect(level).toBe("READONLY");
    });

    it("should allow updating access", async () => {
      const col = await createCollection(env, owner.id, "Test Col");
      await grantAccess(env, viewer.id, "collection", col.id, "READONLY");
      await grantAccess(env, viewer.id, "collection", col.id, "READWRITE");

      const level = await checkAccess(env, viewer, "collection", col.id);
      expect(level).toBe("READWRITE");
    });

    it("should deny access after revocation", async () => {
      const col = await createCollection(env, owner.id, "Test Col");
      await grantAccess(env, viewer.id, "collection", col.id, "READONLY");
      await revokeAccess(env, viewer.id, "collection", col.id);

      const level = await checkAccess(env, viewer, "collection", col.id);
      expect(level).toBeNull();
    });
  });

  describe("Entry Access (Standalone)", () => {
    it("should allow owner full access", async () => {
      const entry = await createEntry(env, owner.id, "key1", "text/plain", "val", null);
      const level = await checkAccess(env, owner, "entry", entry.id);
      expect(level).toBe("ADMIN");
    });

    it("should allow granted user access", async () => {
      const entry = await createEntry(env, owner.id, "key1", "text/plain", "val", null);
      await grantAccess(env, viewer.id, "entry", entry.id, "READONLY");

      const level = await checkAccess(env, viewer, "entry", entry.id);
      expect(level).toBe("READONLY");
    });
  });

  describe("Entry Access (Inheritance)", () => {
    it("should inherit collection access", async () => {
      const col = await createCollection(env, owner.id, "Parent Col");
      const entry = await createEntry(env, owner.id, "child", "text/plain", "val", null, undefined, col.id);

      await grantAccess(env, viewer.id, "collection", col.id, "READONLY");

      const level = await checkAccess(env, viewer, "entry", entry.id);
      expect(level).toBe("READONLY");
    });

    it("should override collection access with specific entry access", async () => {
      const col = await createCollection(env, owner.id, "Parent Col");
      const entry = await createEntry(env, owner.id, "child", "text/plain", "val", null, undefined, col.id);

      await grantAccess(env, viewer.id, "collection", col.id, "READONLY");
      // Grant READWRITE on specific entry
      await grantAccess(env, viewer.id, "entry", entry.id, "READWRITE");

      const level = await checkAccess(env, viewer, "entry", entry.id);
      expect(level).toBe("READWRITE");
    });

    it("should override collection access even if entry access is lower?", async () => {
       // Requirement: Specific entry permission overrides collection permission.
       const col = await createCollection(env, owner.id, "Parent Col");
       const entry = await createEntry(env, owner.id, "child", "text/plain", "val", null, undefined, col.id);

       await grantAccess(env, viewer.id, "collection", col.id, "READWRITE");
       await grantAccess(env, viewer.id, "entry", entry.id, "READONLY");

       const level = await checkAccess(env, viewer, "entry", entry.id);
       expect(level).toBe("READONLY");
    });
  });
});
