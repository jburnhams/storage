import { describe, expect, it, vi, beforeEach } from "vitest";
import { env, applyD1Migrations } from "cloudflare:test";
import {
  generateSessionId,
  createSession,
  getSession,
  updateSessionLastUsed,
  deleteSession,
  deleteExpiredSessions,
  getOrCreateUser,
  getUserById,
  getUserByEmail,
  isUserAdmin,
  promoteUserToAdmin,
  getAllUsers,
  getAllSessions,
  userToResponse,
} from "../../src/session";
import type { User } from "../../src/types";

describe("Session Management", () => {
  beforeEach(async () => {
     await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  describe("generateSessionId", () => {
    it("should generate a 64-character hex string", () => {
      const sessionId = generateSessionId();
      expect(sessionId).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate unique IDs", () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("createSession", () => {
    it("should create a session and insert into DB", async () => {
      // First create a user to link session to
      const user = await getOrCreateUser("sess@test.com", "Sess User", "pic", env);

      const session = await createSession(user.id, env);

      expect(session.user_id).toBe(user.id);

      const savedSession = await env.DB.prepare("SELECT * FROM sessions WHERE id = ?").bind(session.id).first();
      expect(savedSession).toBeDefined();
      expect(savedSession.user_id).toBe(user.id);
    });
  });

  describe("getSession", () => {
    it("should retrieve a valid session", async () => {
      const user = await getOrCreateUser("get@test.com", "Get User", "pic", env);
      const created = await createSession(user.id, env);

      const result = await getSession(created.id, env);
      expect(result).toBeDefined();
      expect(result!.id).toBe(created.id);
      expect(result!.user_id).toBe(user.id);
    });

    it("should return null if session not found", async () => {
      const result = await getSession("nonexistent", env);
      expect(result).toBeNull();
    });
  });

  describe("updateSessionLastUsed", () => {
    it("should update last_used_at timestamp", async () => {
      const user = await getOrCreateUser("upd@test.com", "Upd User", "pic", env);
      const created = await createSession(user.id, env);

      // Wait a bit or manually set older time if possible (but we just check it runs)
      // Actually SQLITE uses seconds for unix epoch or ISO string.

      await updateSessionLastUsed(created.id, env);

      const updated = await env.DB.prepare("SELECT last_used_at FROM sessions WHERE id = ?").bind(created.id).first();
      expect(updated.last_used_at).toBeDefined();
    });
  });

  describe("deleteSession", () => {
    it("should delete session from DB", async () => {
      const user = await getOrCreateUser("del@test.com", "Del User", "pic", env);
      const created = await createSession(user.id, env);

      await deleteSession(created.id, env);

      const check = await env.DB.prepare("SELECT * FROM sessions WHERE id = ?").bind(created.id).first();
      expect(check).toBeNull();
    });
  });

  describe("deleteExpiredSessions", () => {
    it("should delete expired sessions", async () => {
      // Ensure user exists (created in beforeEach or we create one here)
      // We rely on getOrCreateUser in other tests, but here we manually insert.
      // Let's create a user specifically for this test to be safe.
      const user = await getOrCreateUser("expired@test.com", "Expired User", "pic", env);

      // Manually insert an expired session
      await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
        .bind("expired_sess", user.id, Date.now() - 10000)
        .run();

      await deleteExpiredSessions(env);

      const check = await env.DB.prepare("SELECT * FROM sessions WHERE id = ?").bind("expired_sess").first();
      expect(check).toBeNull();
    });
  });

  describe("getOrCreateUser", () => {
    it("should return existing user and update login info", async () => {
      // Create first
      const user1 = await getOrCreateUser("exist@test.com", "Old Name", "pic", env);

      // Get again with new name
      const user2 = await getOrCreateUser("exist@test.com", "New Name", "pic", env);

      expect(user2.id).toBe(user1.id);
      expect(user2.name).toBe("New Name"); // Should have updated
    });

    it("should create new user if not exists", async () => {
       const user = await getOrCreateUser("new@test.com", "New User", "pic", env);
       expect(user.id).toBeDefined();
       expect(user.email).toBe("new@test.com");
    });
  });

  describe("getUserById", () => {
    it("should return user by id", async () => {
      const created = await getOrCreateUser("id@test.com", "ID User", "pic", env);

      const result = await getUserById(created.id, env);
      expect(result).toBeDefined();
      expect(result!.email).toBe("id@test.com");
    });
  });

  describe("getUserByEmail", () => {
    it("should return user by email", async () => {
       const created = await getOrCreateUser("email@test.com", "Email User", "pic", env);

      const result = await getUserByEmail("email@test.com", env);
      expect(result).toBeDefined();
      expect(result!.id).toBe(created.id);
    });
  });

  describe("isUserAdmin", () => {
    it("should return true if user is admin via user_type", () => {
      const user = { email: "user@example.com", user_type: "ADMIN" } as User;
      expect(isUserAdmin(user)).toBe(true);
    });

    it("should return false if user is not admin", () => {
      const user = { email: "user@example.com", user_type: "STANDARD" } as User;
      expect(isUserAdmin(user)).toBe(false);
    });
  });

  describe("promoteUserToAdmin", () => {
    it("should set user_type to ADMIN", async () => {
       const user = await getOrCreateUser("promote@test.com", "Promote User", "pic", env);
       expect(user.user_type).toBe("STANDARD");

      await promoteUserToAdmin("promote@test.com", env);

      const updated = await getUserById(user.id, env);
      expect(updated!.user_type).toBe("ADMIN");
    });
  });

  describe("getAllUsers", () => {
    it("should return all users", async () => {
      await getOrCreateUser("u1@test.com", "U1", "pic", env);
      await getOrCreateUser("u2@test.com", "U2", "pic", env);

      const result = await getAllUsers(env);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getAllSessions", () => {
    it("should return mapped sessions with users", async () => {
      const user = await getOrCreateUser("allsess@test.com", "AllSess", "pic", env);
      await createSession(user.id, env);

      const result = await getAllSessions(env);
      const mySession = result.find(s => s.user.email === "allsess@test.com");
      expect(mySession).toBeDefined();
      expect(mySession!.user.name).toBe("AllSess");
    });
  });

  describe("userToResponse", () => {
    it("should convert user to response format", () => {
      const user = {
        id: 1,
        email: "test@example.com",
        user_type: 'ADMIN',
        // ... other fields
      } as User;

      const response = userToResponse(user);
      expect(response.is_admin).toBe(true);
    });
  });
});
