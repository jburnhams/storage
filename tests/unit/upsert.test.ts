import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEntry, getEntryById, listEntries } from '../../src/storage';
import { registerEntryRoutes } from '../../src/routes/entries';
import { registerEntryJsonRoutes } from '../../src/routes/entries_json';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '../../src/types';
import { createMiddleware } from '../../src/middleware';

// Helper to setup app with mocked session
async function setupApp(userId: number) {
  const app = new OpenAPIHono<{ Bindings: Env }>();

  // Mock middleware to inject session
  app.use('*', async (c, next) => {
    c.set('session', {
      user_id: userId,
      session_id: 'test-session',
      is_admin: false,
      type: 'user'
    });
    await next();
  });

  registerEntryRoutes(app as any);
  registerEntryJsonRoutes(app as any);
  return app;
}

describe('Upsert Logic', () => {
  let user: any;
  let collection: any;

  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

    // Create User
    await env.DB.prepare("INSERT INTO users (email, name) VALUES (?, ?)").bind('test@example.com', 'Test User').run();
    user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind('test@example.com').first();

    // Create Collection
    await env.DB.prepare("INSERT INTO key_value_collections (name, secret, user_id) VALUES (?, ?, ?)").bind('Test Collection', 'secret123', user.id).run();
    collection = await env.DB.prepare("SELECT * FROM key_value_collections WHERE user_id = ?").bind(user.id).first();
  });

  it('should overwrite existing entry in collection via JSON endpoint', async () => {
    const app = await setupApp(user.id);

    // 1. Create initial entry
    const res1 = await app.request('/api/storage/entry/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'config.json',
        type: 'application/json',
        string_value: '{"version": 1}',
        collection_id: collection.id
      })
    }, env);

    expect(res1.status).toBe(200);
    const entry1 = await res1.json();
    expect(entry1.string_value).toBe('{"version": 1}');
    expect(entry1.collection_id).toBe(collection.id);

    // Verify it exists in DB via listEntries
    const initialList = await listEntries(env, user, undefined, undefined, collection.id);
    expect(initialList.length).toBe(1);
    expect(initialList[0].key).toBe('config.json');

    // 2. Create again with same key and collection (should update)
    const res2 = await app.request('/api/storage/entry/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'config.json',
        type: 'application/json',
        string_value: '{"version": 2}',
        collection_id: collection.id
      })
    }, env);

    expect(res2.status).toBe(200);
    const entry2 = await res2.json();
    expect(entry2.id).toBe(entry1.id); // Same ID (update)
    expect(entry2.string_value).toBe('{"version": 2}'); // New value

    // Verify DB count
    const entries = await listEntries(env, user, undefined, undefined, collection.id);
    expect(entries.length).toBe(1);
  });

  it('should allow duplicates if collection_id is null via JSON endpoint', async () => {
    const app = await setupApp(user.id);

    // 1. Create root entry
    const res1 = await app.request('/api/storage/entry/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'root.txt',
        type: 'text/plain',
        string_value: 'First',
        // no collection_id
      })
    }, env);
    expect(res1.status).toBe(200);

    // 2. Create again (should duplicate)
    const res2 = await app.request('/api/storage/entry/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'root.txt',
        type: 'text/plain',
        string_value: 'Second',
      })
    }, env);
    expect(res2.status).toBe(200);

    const entry1 = await res1.json();
    const entry2 = await res2.json();
    expect(entry1.id).not.toBe(entry2.id);

    // Verify DB count
    const entries = await listEntries(env, user);
    // filter by key
    const matching = entries.filter((e: any) => e.key === 'root.txt');
    expect(matching.length).toBe(2);
  });

  it('should overwrite existing entry in collection via FormData endpoint', async () => {
    const app = await setupApp(user.id);

    // 1. Create initial
    const formData1 = new FormData();
    formData1.append('key', 'image.png');
    formData1.append('type', 'image/png');
    formData1.append('string_value', 'fake-image-1');
    formData1.append('collection_id', String(collection.id));

    const res1 = await app.request('/api/storage/entry', {
      method: 'POST',
      body: formData1
    }, env);
    expect(res1.status).toBe(200);
    const entry1 = await res1.json();

    // 2. Create again (Update)
    const formData2 = new FormData();
    formData2.append('key', 'image.png');
    formData2.append('type', 'image/png');
    formData2.append('string_value', 'fake-image-2');
    formData2.append('collection_id', String(collection.id));

    const res2 = await app.request('/api/storage/entry', {
      method: 'POST',
      body: formData2
    }, env);
    expect(res2.status).toBe(200);
    const entry2 = await res2.json();

    expect(entry2.id).toBe(entry1.id);
    expect(entry2.string_value).toBe('fake-image-2');
  });
});
