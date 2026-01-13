import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import {
  createMiniflareInstance,
  seedTestData,
  cleanDatabase,
  bundleWorker,
} from './setup';

describe('Auth Basic Integration', () => {
  let mf: Miniflare;
  let db: D1Database;
  let workerScript: string;
  let persistPath: string;

  beforeAll(async () => {
    workerScript = await bundleWorker();

    const result = await createMiniflareInstance({
      script: workerScript,
    });
    mf = result.mf;
    persistPath = result.persistPath;

    db = await mf.getD1Database("DB");
  });

  beforeEach(async () => {
    db = await mf.getD1Database("DB");
    await cleanDatabase(db);
    await seedTestData(db);
  });

  afterAll(async () => {
    if (mf) await mf.dispose();
  });

  it('should return 401 for nonexistent user', async () => {
    const res = await mf.dispatchFetch('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@example.com',
        password: 'password123'
      })
    });

    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error).toBe('INVALID_CREDENTIALS');
  });
});

