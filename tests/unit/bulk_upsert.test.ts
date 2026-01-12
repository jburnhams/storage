import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { listEntries } from '../../src/storage';
import { registerEntryJsonRoutes } from '../../src/routes/entries_json';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '../../src/types';

// Helper to setup app with mocked session
async function setupApp(userId: number) {
  const app = new OpenAPIHono<{ Bindings: Env }>();

  // Mock middleware to inject session
  app.use('*', async (c, next) => {
    c.set('session', {
      user_id: userId,
      session_id: 'test-session',
      user: { user_type: 'STANDARD' },
      type: 'user'
    });
    await next();
  });

  registerEntryJsonRoutes(app as any);
  return app;
}

describe('Bulk Upsert Logic', () => {
  let user: any;
  let collection: any;

  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

    // Create User
    await env.DB.prepare("INSERT INTO users (email, name) VALUES (?, ?)").bind('test@example.com', 'Test User').run();
    user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind('test@example.com').first();

    // Create Collection
    await env.DB.prepare("INSERT INTO key_value_collections (name, secret, user_id) VALUES (?, ?, ?)").bind('Bulk Collection', 'secret456', user.id).run();
    collection = await env.DB.prepare("SELECT * FROM key_value_collections WHERE user_id = ?").bind(user.id).first();
  });

  it('should create multiple entries in bulk', async () => {
    const app = await setupApp(user.id);

    const payload = [
        {
            key: 'file1.txt',
            type: 'text/plain',
            string_value: 'Content 1',
            collection_id: collection.id
        },
        {
            key: 'file2.txt',
            type: 'text/plain',
            string_value: 'Content 2',
            collection_id: collection.id
        }
    ];

    const res = await app.request('/api/storage/entry/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, env);

    expect(res.status).toBe(200);
    const results = await res.json();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
    expect(results[0].key).toBe('file1.txt');
    expect(results[1].key).toBe('file2.txt');

    // Verify DB
    const entries = await listEntries(env, user, undefined, undefined, collection.id);
    expect(entries.length).toBe(2);
  });

  it('should upsert mixed new and existing entries', async () => {
    const app = await setupApp(user.id);

    // 1. Create initial entry
    await app.request('/api/storage/entry/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          key: 'existing.txt',
          type: 'text/plain',
          string_value: 'Old Content',
          collection_id: collection.id
      })
    }, env);

    // 2. Bulk upsert
    const payload = [
        {
            key: 'existing.txt', // Should update
            type: 'text/plain',
            string_value: 'New Content',
            collection_id: collection.id
        },
        {
            key: 'new.txt', // Should create
            type: 'text/plain',
            string_value: 'Created Content',
            collection_id: collection.id
        }
    ];

    const res = await app.request('/api/storage/entry/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, env);

    expect(res.status).toBe(200);
    const results = await res.json();
    expect(results.length).toBe(2);

    expect(results[0].key).toBe('existing.txt');
    expect(results[0].string_value).toBe('New Content');

    expect(results[1].key).toBe('new.txt');
    expect(results[1].string_value).toBe('Created Content');

    // Verify DB count
    const entries = await listEntries(env, user, undefined, undefined, collection.id);
    expect(entries.length).toBe(2); // existing + new = 2 total (existing was overwritten)
  });

  it('should fail whole request if one item fails (e.g. invalid type)', async () => {
      const app = await setupApp(user.id);

      const payload = [
          {
              key: 'valid.txt',
              type: 'text/plain',
              string_value: 'Valid',
              collection_id: collection.id
          },
          {
              key: 'invalid.txt',
              type: 'text/plain',
              string_value: null,
              blob_value: null, // Invalid: must have one
              collection_id: collection.id
          }
      ];

      const res = await app.request('/api/storage/entry/json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }, env);

        // Depending on implementation, schema validation might catch it first?
        // Actually, CreateEntryJsonRequestSchema doesn't validate payload items individually in Zod array unless Zod iterates.
        // Yes, Zod array schema validates all items.
        // The .refine() in CreateEntryJsonRequestSchema will fail for the second item.
        // So Zod will throw 400 Bad Request before hitting handler.

        expect(res.status).toBe(400);
  });
});
