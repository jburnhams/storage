import { describe, expect, it, vi, beforeEach } from "vitest";
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
import type { Env, User } from "../../src/types";

// Mock D1 database
const mockDB = {
  prepare: vi.fn(),
};

const mockEnv = {
  DB: mockDB,
} as unknown as Env;

describe("Session Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const userId = 123;
      const mockRun = vi.fn().mockResolvedValue({});
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: mockRun,
        }),
      });

      const session = await createSession(userId, mockEnv);

      expect(session.user_id).toBe(userId);
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO sessions")
      );
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe("getSession", () => {
    it("should retrieve a valid session", async () => {
      const sessionId = "test-session";
      const mockSession = { id: sessionId, user_id: 123 };

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockSession),
        }),
      });

      const result = await getSession(sessionId, mockEnv);
      expect(result).toEqual(mockSession);
    });

    it("should return null if session not found or expired", async () => {
      const sessionId = "test-session";

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      const result = await getSession(sessionId, mockEnv);
      expect(result).toBeNull();
    });
  });

  describe("updateSessionLastUsed", () => {
    it("should update last_used_at timestamp", async () => {
      const sessionId = "test-session";
      const mockRun = vi.fn().mockResolvedValue({});

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: mockRun,
        }),
      });

      await updateSessionLastUsed(sessionId, mockEnv);
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE sessions SET last_used_at")
      );
    });
  });

  describe("deleteSession", () => {
    it("should delete session from DB", async () => {
      const sessionId = "test-session";
      const mockRun = vi.fn().mockResolvedValue({});

      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: mockRun,
        }),
      });

      await deleteSession(sessionId, mockEnv);
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM sessions")
      );
    });
  });

  describe("deleteExpiredSessions", () => {
    it("should delete expired sessions", async () => {
      const mockRun = vi.fn().mockResolvedValue({});

      mockDB.prepare.mockReturnValue({
        run: mockRun,
      });

      await deleteExpiredSessions(mockEnv);
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM sessions WHERE expires_at")
      );
    });
  });

  describe("getOrCreateUser", () => {
    it("should return existing user and update login info", async () => {
      const existingUser = { id: 1, email: "test@example.com", name: "Old Name" };
      const mockRun = vi.fn().mockResolvedValue({});

      // Mock finding user
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(existingUser),
        }),
      });

      // Mock update
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          run: mockRun,
        }),
      });

      const user = await getOrCreateUser(
        "test@example.com",
        "New Name",
        "pic.jpg",
        mockEnv
      );

      expect(user.id).toBe(1);
      expect(user.name).toBe("New Name");
      expect(mockRun).toHaveBeenCalled();
    });

    it("should create new user if not exists", async () => {
      const newUser = { id: 1, email: "new@example.com", name: "New User" };

      // Mock finding user (not found)
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      // Mock insert
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(newUser),
        }),
      });

      const user = await getOrCreateUser(
        "new@example.com",
        "New User",
        "pic.jpg",
        mockEnv
      );

      expect(user).toEqual(newUser);
    });

    it("should throw error if creation fails", async () => {
      // Mock finding user (not found)
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      // Mock insert returning null
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        getOrCreateUser("fail@example.com", "Fail", "pic.jpg", mockEnv)
      ).rejects.toThrow("Failed to create user");
    });
  });

  describe("getUserById", () => {
    it("should return user by id", async () => {
      const mockUser = { id: 1 };
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockUser),
        }),
      });

      const result = await getUserById(1, mockEnv);
      expect(result).toEqual(mockUser);
    });
  });

  describe("getUserByEmail", () => {
    it("should return user by email", async () => {
      const mockUser = { id: 1, email: "test@example.com" };
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockUser),
        }),
      });

      const result = await getUserByEmail("test@example.com", mockEnv);
      expect(result).toEqual(mockUser);
    });
  });

  describe("isUserAdmin", () => {
    it("should return true if user is admin in DB", () => {
      const user = { is_admin: 1, email: "user@example.com" } as User;
      expect(isUserAdmin(user)).toBe(true);
    });

    it("should return false if user is not admin", () => {
      const user = { is_admin: 0, email: "user@example.com" } as User;
      expect(isUserAdmin(user)).toBe(false);
    });
  });

  describe("promoteUserToAdmin", () => {
    it("should set is_admin to 1", async () => {
      const mockRun = vi.fn().mockResolvedValue({});
      mockDB.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: mockRun,
        }),
      });

      await promoteUserToAdmin("user@example.com", mockEnv);
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE users SET is_admin = 1")
      );
    });
  });

  describe("getAllUsers", () => {
    it("should return all users", async () => {
      const mockUsers = [{ id: 1 }, { id: 2 }];
      mockDB.prepare.mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockUsers }),
      });

      const result = await getAllUsers(mockEnv);
      expect(result).toEqual(mockUsers);
    });

    it("should return empty array if no results", async () => {
      mockDB.prepare.mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: null }),
      });

      const result = await getAllUsers(mockEnv);
      expect(result).toEqual([]);
    });
  });

  describe("getAllSessions", () => {
    it("should return mapped sessions with users", async () => {
      const mockData = [
        {
          session_id: "s1",
          session_user_id: 1,
          user_id: 1,
          user_email: "test@example.com",
          user_is_admin: 0,
        },
      ];

      mockDB.prepare.mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockData }),
      });

      const result = await getAllSessions(mockEnv);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("s1");
      expect(result[0].user.email).toBe("test@example.com");
    });

     it("should return empty array if no results", async () => {
      mockDB.prepare.mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: null }),
      });

      const result = await getAllSessions(mockEnv);
      expect(result).toEqual([]);
    });
  });

  describe("userToResponse", () => {
    it("should convert user to response format", () => {
      const user = {
        id: 1,
        email: "test@example.com",
        is_admin: 1,
        // ... other fields
      } as User;

      const response = userToResponse(user);
      expect(response.is_admin).toBe(true);
    });
  });
});
