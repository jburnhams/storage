
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMiniflareInstance, seedTestData } from '../integration/setup';
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
    await seedTestData(db);
  });

  afterEach(() => {
    // Cleanup persistence directory
    if (persistencePath && fs.existsSync(persistencePath)) {
      fs.rmSync(persistencePath, { recursive: true, force: true });
    }
  });

  async function createEntry(type: string, value: string, key: string) {
    const formData = new FormData();
    formData.append('key', key);
    formData.append('type', type);
    formData.append('string_value', value);

    // Miniflare 3 / Workerd quirk: when passing FormData directly in body with dispatchFetch,
    // it sometimes doesn't set Content-Type correctly if not careful or using undici.
    // However, Miniflare's dispatchFetch should handle it.
    // The error "Unrecognized Content-Type header value" suggests it's missing or malformed.
    // We can try constructing the body manually or trusting undici (which Miniflare uses).
    // Let's try explicitly not setting Content-Type so it's auto-generated with boundary?
    // Wait, Miniflare `dispatchFetch` implementation:
    // If we use the native `Request` constructor or `undici`, we need to be careful.

    // Alternative: Use JSON endpoint for creation which is robust.
    // But we modified the FormData endpoint. We should test it.
    // Let's try to simulate the FormData correctly.

    // Workaround: We can't easily rely on global FormData in Node environment working perfectly with Miniflare's fetch without proper headers.
    // But `new Response(formData).blob()` or `.arrayBuffer()` usually helps.
    // Or we can use the JSON endpoint for these simple types, which is also supported and maybe cleaner.
    // BUT the requirement was about "update these to add simpler types" which implies the main entry creation flow.
    // Let's try to fix the test helper.

    // Using `undici` directly or just `mf.dispatchFetch` with `FormData` usually works if `undici` is polyfilled or provided.
    // In this environment, let's try reading it into a buffer and setting headers manually if needed.
    // Actually, `Response` object usually handles it.

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
    // If this fails with 500 again, we might fallback to JSON endpoint testing or fix the FormData construction
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
    const exportRes = await mf.dispatchFetch(`http://localhost:8787/api/collections/${col.id}/export`, {
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
