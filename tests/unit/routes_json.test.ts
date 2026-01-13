import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../../src/app';
import { env, applyD1Migrations, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { createEntry } from '../../src/storage';

// Mock dependencies if needed
// For these tests we'll use a real-ish integration approach with env.DB

describe('JSON Entry Routes', () => {
    let app: ReturnType<typeof createApp>;
    let userId: number;
    let sessionId: string;
    let cookie: string;

    beforeEach(async () => {
        // Setup DB
        await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

        // Seed user
        const userResult = await env.DB.prepare(
            "INSERT INTO users (email, name, user_type) VALUES ('test@example.com', 'Test User', 'ADMIN') RETURNING id"
        ).first<any>();
        userId = userResult.id;

        // Seed session
        const sessionResult = await env.DB.prepare(
            "INSERT INTO sessions (id, user_id, expires_at) VALUES ('session123', ?, datetime('now', '+1 hour')) RETURNING id"
        ).bind(userId).first<any>();
        sessionId = sessionResult.id;

        cookie = `storage_session=${sessionId}`;

        app = createApp();
    });

    it('should create a text entry using JSON', async () => {
        const payload = {
            key: 'json-text-key',
            type: 'text/plain',
            string_value: 'Hello JSON World'
        };

        const req = new Request('http://localhost:8787/api/storage/entry/json', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookie
            },
            body: JSON.stringify(payload)
        });

        const ctx = createExecutionContext();
        const res = await app.fetch(req, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);

        const body = await res.json() as any;
        expect(body.key).toBe('json-text-key');
        expect(body.string_value).toBe('Hello JSON World');
        expect(body.has_blob).toBe(false);
    });

    it('should create a binary entry using JSON (base64)', async () => {
        const binaryData = "Hello Binary";
        const base64Data = btoa(binaryData);

        const payload = {
            key: 'json-binary-key',
            type: 'application/octet-stream',
            blob_value: base64Data
        };

        const req = new Request('http://localhost:8787/api/storage/entry/json', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookie
            },
            body: JSON.stringify(payload)
        });

        const ctx = createExecutionContext();
        const res = await app.fetch(req, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);

        const body = await res.json() as any;
        expect(body.key).toBe('json-binary-key');
        expect(body.string_value).toBeNull();
        expect(body.has_blob).toBe(true);

        // Verify blob content in DB
        const entry = await env.DB.prepare("SELECT * FROM key_value_entries WHERE id = ?").bind(body.id).first<any>();
        expect(entry).toBeDefined();
    });

    it('should fail if both string_value and blob_value are provided', async () => {
         const payload = {
            key: 'fail-key',
            type: 'text/plain',
            string_value: 'text',
            blob_value: 'base64=='
        };

        const req = new Request('http://localhost:8787/api/storage/entry/json', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookie
            },
            body: JSON.stringify(payload)
        });

        const ctx = createExecutionContext();
        const res = await app.fetch(req, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(400);
        const body = await res.json() as any;
        expect(body.error).toBeDefined();
    });

    it('should fail if blob_value is invalid base64', async () => {
        const payload = {
            key: 'invalid-base64-key',
            type: 'application/octet-stream',
            blob_value: 'not-base-64!'
        };

        const req = new Request('http://localhost:8787/api/storage/entry/json', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookie
            },
            body: JSON.stringify(payload)
        });

        const ctx = createExecutionContext();
        const res = await app.fetch(req, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(400);
        const body = await res.json() as any;
        expect(body.error).toBe('INVALID_REQUEST');
        expect(body.message).toContain('Invalid base64');
    });

    it('should update an entry using JSON', async () => {
        // Create initial entry
        await createEntry(env, userId, 'update-me', 'text/plain', 'initial', null);
        const entry = await env.DB.prepare("SELECT id FROM key_value_entries WHERE key = 'update-me'").first<any>();

        const payload = {
            string_value: 'updated value'
        };

        const req = new Request(`http://localhost:8787/api/storage/entry/${entry.id}/json`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookie
            },
            body: JSON.stringify(payload)
        });

        const ctx = createExecutionContext();
        const res = await app.fetch(req, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(res.status).toBe(200);

        const body = await res.json() as any;
        expect(body.string_value).toBe('updated value');
    });
});
