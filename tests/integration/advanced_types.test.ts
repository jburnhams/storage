
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMiniflareInstance, seedTestData, cleanDatabase } from '../integration/setup';
import { Miniflare } from 'miniflare';
import fs from 'fs';

describe('Advanced Types Integration', () => {
  let mf: Miniflare;
  let persistencePath: string;
  const SESSION_COOKIE = 'storage_session=test-session-admin';

  beforeEach(async () => {
    const workerScript = await import('./setup').then(m => m.bundleWorker());
    const instance = await createMiniflareInstance({ script: workerScript });
    mf = instance.mf;
    persistencePath = instance.persistencePath;

    // Setup database
    const db = await mf.getD1Database('DB');
    // Ensure clean state before seeding
    await cleanDatabase(db);
    await seedTestData(db);
  });

  afterEach(async () => {
     // Don't delete persistencePath if it's the shared one.
     // Since createMiniflareInstance logic with isolate=false (default) returns shared,
     // we shouldn't delete it unless we know it's isolated.
     // But better yet, we just clean the DB for next test?
     // Actually `cleanDatabase` in `beforeEach` should handle it.

     // However, removing the persistence path *forcefully* while other tests might use it is bad.
     // If we are sharing, we shouldn't remove it.
     // Let's remove this aggressive cleanup or only do it if we passed `isolate: true` (which we didn't).
     // I'll comment it out to be safe for shared instance.
     /*
    if (persistencePath && fs.existsSync(persistencePath)) {
      fs.rmSync(persistencePath, { recursive: true, force: true });
    }
    */
  });

  async function createEntry(type: string, value: string, key: string) {
    const formData = new FormData();
    formData.append('key', key);
    formData.append('type', type);
    formData.append('string_value', value);

    const req = new Response(formData);
    const blob = await req.blob();

    const res = await mf.dispatchFetch('http://localhost:8787/api/storage/entry', {
      method: 'POST',
      headers: {
        'Cookie': SESSION_COOKIE,
        'Content-Type': blob.type || req.headers.get('Content-Type') || 'multipart/form-data; boundary=---'
      },
      body: await blob.arrayBuffer() as any
    });
    return res;
  }

  // Update helper also needs to be robust
  async function updateEntry(id: number, fd: FormData) {
      const req = new Response(fd);
      const blob = await req.blob();
      return await mf.dispatchFetch(`http://localhost:8787/api/storage/entry/${id}`, {
          method: 'PUT',
          headers: {
              'Cookie': SESSION_COOKIE,
              'Content-Type': blob.type
          },
          body: await blob.arrayBuffer() as any
      });
  }

  it('creates and exports boolean entry', async () => {
    const res = await createEntry('boolean', 'true', 'config/active');
    if (res.status === 500) {
        const err = await res.json() as any;
        console.error("Create failed:", err);
    }
    expect(res.status).toBe(200);
    const entry = await res.json() as any;

    // Create a collection
    const colRes = await mf.dispatchFetch('http://localhost:8787/api/collections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': SESSION_COOKIE
      },
      body: JSON.stringify({ name: 'Test Col' })
    });
    const col = await colRes.json() as any;

    // Add entry to collection (by update)
    const fd = new FormData();
    fd.append('type', 'boolean');
    fd.append('collection_id', String(col.id));
    fd.append('string_value', 'true');

    const updateRes = await updateEntry(entry.id, fd);
    expect(updateRes.status).toBe(200);

    // Export Collection
    const exportRes = await mf.dispatchFetch(`http://localhost:8787/api/collections/${col.id}`, {
      method: 'GET',
      headers: {
        'Cookie': SESSION_COOKIE
      }
    });
    expect(exportRes.status).toBe(200);
    const exportData = await exportRes.json() as any;

    expect(exportData.contents).toHaveLength(1);
    expect(exportData.contents[0]).toEqual(expect.objectContaining({
        key: 'config/active',
        type: 'json',
        value: true
    }));
  });

  it('rejects invalid integer', async () => {
    const res = await createEntry('integer', '12.5', 'bad/int');
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('creates and exports integer entry', async () => {
    const res = await createEntry('integer', '42', 'data/answer');
    expect(res.status).toBe(200);
    const entry = await res.json() as any;

    const getRes = await mf.dispatchFetch(`http://localhost:8787/api/storage/entry/${entry.id}`, {
         headers: {
        'Cookie': SESSION_COOKIE
      }
    });
    const fetched = await getRes.json() as any;
    expect(fetched.string_value).toBe("42"); // String in standard API
  });
});
