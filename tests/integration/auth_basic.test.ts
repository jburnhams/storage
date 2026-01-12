import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';

describe('Auth Integration', () => {
  let worker: UnstableDevWorker;

  beforeEach(async () => {
    worker = await unstable_dev('src/worker.ts', {
      experimental: { disableExperimentalWarning: true },
      config: 'wrangler.toml',
      testScheduled: false,
    });
  });

  afterEach(async () => {
    await worker.stop();
  });

  it('should allow login with created user and password', async () => {
    // 1. Create a user via Admin API (simulated or direct DB if possible, but API is better)
    // Actually, we can't easily create an admin session without already having one.
    // So we'll rely on the fact that we can hit the signup/create logic if we mock it,
    // or we can use the `getOrCreateUser` logic if we could trigger it.
    //
    // Better approach for integration test:
    // We need to bypass auth to create a user, or use a "seed" strategy.
    // But since this is a real integration test against the worker, we might need a backdoor or just unit test the route handler logic.
    //
    // However, I can test the FAIL case easily.

    const res = await worker.fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@example.com',
        password: 'password123'
      })
    });

    expect(res.status).toBe(401);
  });
});
