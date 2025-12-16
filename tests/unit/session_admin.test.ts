import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  MASTER_ADMIN_EMAILS,
  getOrCreateUser,
} from "../../src/session";
import type { Env } from "../../src/types";

// Mock D1 database
const mockDB = {
  prepare: vi.fn(),
};

const mockEnv = {
  DB: mockDB,
} as unknown as Env;

describe("Session Management (Admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreateUser with admin email", () => {
    it("should create new user as admin if email is in MASTER_ADMIN_EMAILS", async () => {
      const adminEmail = "admin@test.com";
      // Temporarily modify MASTER_ADMIN_EMAILS for test
      // Note: modifying exported const array is possible
      MASTER_ADMIN_EMAILS.push(adminEmail);

      const newUser = {
        id: 1,
        email: adminEmail,
        name: "Admin User",
        is_admin: 1
      };

      // Mock finding user (not found)
      mockDB.prepare.mockReturnValueOnce({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
      });

      // Mock insert
      const mockBind = vi.fn();
      mockDB.prepare.mockReturnValueOnce({
        bind: mockBind,
      });
      mockBind.mockReturnValue({
        first: vi.fn().mockResolvedValue(newUser),
      });

      await getOrCreateUser(
        adminEmail,
        "Admin User",
        "pic.jpg",
        mockEnv
      );

      // Check the 4th argument (is_admin) passed to bind
      expect(mockBind).toHaveBeenCalledWith(
        adminEmail,
        "Admin User",
        "pic.jpg",
        1, // is_admin should be 1
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );

      // Cleanup
      const index = MASTER_ADMIN_EMAILS.indexOf(adminEmail);
      if (index > -1) {
        MASTER_ADMIN_EMAILS.splice(index, 1);
      }
    });
  });
});
