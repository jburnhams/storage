import { describe, it, expect } from 'vitest';
import { generateSalt, hashPassword } from '../../src/utils/crypto';

describe('Crypto Utils', () => {
  it('should generate a random salt', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    expect(salt1).toHaveLength(32); // Default 16 bytes * 2 hex chars
    expect(salt1).not.toBe(salt2);
  });

  it('should hash a password consistently', async () => {
    const password = 'mySecretPassword';
    const salt = generateSalt();

    const hash1 = await hashPassword(password, salt);
    const hash2 = await hashPassword(password, salt);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(password);
  });

  it('should produce different hashes for different salts', async () => {
    const password = 'mySecretPassword';
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    const hash1 = await hashPassword(password, salt1);
    const hash2 = await hashPassword(password, salt2);

    expect(hash1).not.toBe(hash2);
  });
});
