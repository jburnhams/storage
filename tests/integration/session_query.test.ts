import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createMiniflareInstance, seedTestData } from './setup';
import type { Miniflare } from 'miniflare';
import { Response } from 'undici';

describe('Session Authentication via Query Parameter', () => {
  let mf: Miniflare;
  let sessionToken: string;

  beforeAll(async () => {
    // Import bundleWorker to ensure worker.js is built
    const { bundleWorker } = await import('./setup');
    const workerScript = await bundleWorker();

    const instance = await createMiniflareInstance({ script: workerScript });
    mf = instance.mf;
    const db = await mf.getD1Database('DB');

    // Seed test data using the shared helper
    await seedTestData(db);

    // We can use the hardcoded session from seedTestData
    sessionToken = 'test-session-admin';
  });

  afterAll(async () => {
    await mf.dispose();
  });

  it('should allow access with valid session in query param (no cookie)', async () => {
    const res = await mf.dispatchFetch(`http://localhost:8787/api/storage/entries?session=${sessionToken}`);
    expect(res.status).toBe(200);
    const data = await res.json() as any[];
    expect(Array.isArray(data)).toBe(true);
  });

  it('should allow access with valid session in cookie (no query param)', async () => {
    const res = await mf.dispatchFetch('http://localhost:8787/api/storage/entries', {
      headers: {
        'Cookie': `storage_session=${sessionToken}`
      }
    });
    expect(res.status).toBe(200);
  });

  it('should prioritize query param over cookie if both present', async () => {
    // If query param is valid and cookie is invalid, it should work
    const res = await mf.dispatchFetch(`http://localhost:8787/api/storage/entries?session=${sessionToken}`, {
      headers: {
        'Cookie': 'storage_session=invalid-token'
      }
    });
    expect(res.status).toBe(200);
  });

  it('should fall back to cookie if query param is missing', async () => {
    const res = await mf.dispatchFetch('http://localhost:8787/api/storage/entries', {
        headers: {
            'Cookie': `storage_session=${sessionToken}`
        }
    });
    expect(res.status).toBe(200);
  });

  it('should reject invalid session in query param', async () => {
    const res = await mf.dispatchFetch('http://localhost:8787/api/storage/entries?session=invalid-session-id');
    expect(res.status).toBe(401);
  });

  it('should reject missing session (both query and cookie)', async () => {
    const res = await mf.dispatchFetch('http://localhost:8787/api/storage/entries');
    expect(res.status).toBe(401);
  });

  it('should reject empty session query param', async () => {
      const res = await mf.dispatchFetch('http://localhost:8787/api/storage/entries?session=');
      expect(res.status).toBe(401);
  });
});
