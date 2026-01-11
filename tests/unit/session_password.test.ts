import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUser, updateUser } from '../../src/session';
import { hashPassword } from '../../src/utils/crypto';
import type { Env } from '../../src/types';

// Mock DB
const mockDB = {
  prepare: vi.fn(),
};

const mockEnv = {
  DB: mockDB,
} as unknown as Env;

describe('Session Logic - Password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createUser should hash provided password', async () => {
    const mockRun = vi.fn().mockReturnValue({
      id: 1, email: 'test@example.com', password_hash: 'hashed'
    });
    mockDB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: mockRun,
      }),
    });

    // Mock getUserByEmail to return null (user doesn't exist)
    const mockGetUser = vi.fn().mockResolvedValue(null);
    // We need to handle the first call to getUserByEmail inside createUser
    // But since we are mocking prepare, we can just mock the chain for the select first

    // Mock sequence:
    // 1. SELECT * FROM users WHERE email = ? (getUserByEmail)
    // 2. INSERT ... (createUser)

    mockDB.prepare
      .mockReturnValueOnce({ // for getUserByEmail
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null)
        })
      })
      .mockReturnValueOnce({ // for INSERT
        bind: vi.fn().mockImplementation((...args) => {
           // args: email, name, profile_picture, profile_pic_blob, user_type, is_admin, salt, hash, ...
           const [email, name, pp, ppb, type, admin, salt, hash] = args;
           expect(salt).toBeDefined();
           expect(hash).toBeDefined();
           expect(salt).toHaveLength(32); // 16 bytes hex
           return {
             first: vi.fn().mockResolvedValue({
                 id: 1, email, password_salt: salt, password_hash: hash
             })
           }
        })
      });

    await createUser({
      email: 'test@example.com',
      name: 'Test User',
      password: 'mypassword',
    }, mockEnv);

    expect(mockDB.prepare).toHaveBeenCalledTimes(2);
  });
});
