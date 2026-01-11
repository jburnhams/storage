import { describe, it, expect, beforeEach } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../../src/worker';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('DELETE /api/youtube/channel/:id', () => {
    beforeEach(async () => {
        await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
        // Clean database
        await env.DB.prepare('DELETE FROM youtube_channels').run();
        await env.DB.prepare('DELETE FROM youtube_videos').run();
        await env.DB.prepare('DELETE FROM sessions').run();
        await env.DB.prepare('DELETE FROM users').run();

        // Seed User and Session
        // users: id (int), email, name, ...
        const userResult = await env.DB.prepare("INSERT INTO users (email, name, created_at, updated_at) VALUES ('test@example.com', 'Test User', '2023-01-01', '2023-01-01') RETURNING id").first<{id: number}>();
        const userId = userResult!.id;

        await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('session-1', ?, '2099-01-01', '2023-01-01')").bind(userId).run();

        // Seed Channel and Video
        await env.DB.prepare(`
            INSERT INTO youtube_channels (youtube_id, title, description, thumbnail_url, published_at, statistics, raw_json, created_at, updated_at)
            VALUES ('UC_TEST', 'Test Channel', 'Desc', 'url', '2023-01-01', '{}', '{}', '2023-01-01', '2023-01-01')
        `).run();

        await env.DB.prepare(`
            INSERT INTO youtube_videos (youtube_id, title, description, published_at, channel_id, thumbnail_url, duration, statistics, raw_json, created_at, updated_at)
            VALUES ('VID_1', 'Video 1', 'Desc', '2023-01-01', 'UC_TEST', 'url', 'PT1M', '{}', '{}', '2023-01-01', '2023-01-01')
        `).run();
    });

    it('should delete channel and associated videos', async () => {
        const request = new IncomingRequest('http://example.com/api/youtube/channel/UC_TEST', {
            method: 'DELETE',
            headers: {
                'Cookie': 'storage_session=session-1'
            }
        });

        const ctx = createExecutionContext();
        const response = await worker.fetch(request, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ success: true });

        // Verify Database
        const channel = await env.DB.prepare('SELECT * FROM youtube_channels WHERE youtube_id = ?').bind('UC_TEST').first();
        expect(channel).toBeNull();

        const video = await env.DB.prepare('SELECT * FROM youtube_videos WHERE channel_id = ?').bind('UC_TEST').first();
        expect(video).toBeNull();
    });

    it('should return 401 if not authenticated', async () => {
        const request = new IncomingRequest('http://example.com/api/youtube/channel/UC_TEST', {
            method: 'DELETE'
        });

        const ctx = createExecutionContext();
        const response = await worker.fetch(request, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(401);
    });
});
