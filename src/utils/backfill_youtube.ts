import type {
  YoutubeVideo,
  YoutubeChannel,
  YoutubeThumbnails,
  YoutubeThumbnail,
  YoutubeVideoResource,
  YoutubeChannelResource
} from '../types';

// Duplicating helpers here since they are private in service,
// or we could export them from service if we refactor.
// For now, standalone helpers are safer to avoid instantiating the service.

function parseDuration(duration: string): number {
    const regex = /P(?:([0-9]+)D)?T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?/;
    const matches = duration.match(regex);
    if (!matches) return 0;

    const days = parseInt(matches[1] || '0');
    const hours = parseInt(matches[2] || '0');
    const minutes = parseInt(matches[3] || '0');
    const seconds = parseInt(matches[4] || '0');

    return (days * 86400) + (hours * 3600) + (minutes * 60) + seconds;
}

function findBestThumbnail(thumbnails: YoutubeThumbnails): { url: string; width: number; height: number } | null {
    if (!thumbnails) return null;
    let best: YoutubeThumbnail | null = null;
    let maxPixels = 0;
    const keys = ['maxres', 'standard', 'high', 'medium', 'default'] as const;

    for (const key of keys) {
        if (thumbnails[key]) {
             const t = thumbnails[key]!;
             const pixels = t.width * t.height;
             if (pixels > maxPixels) {
                 maxPixels = pixels;
                 best = t;
             }
        }
    }

    if (best) return { url: best.url, width: best.width, height: best.height };

    for (const key of keys) {
        if (thumbnails[key]) {
            return {
                url: thumbnails[key]!.url,
                width: thumbnails[key]!.width || 0,
                height: thumbnails[key]!.height || 0
            };
        }
    }
    return null;
}

export async function backfillYoutubeData(db: D1Database): Promise<{ videosUpdated: number; channelsUpdated: number }> {
    // TODO: Remove this file after successful backfill in production.

    // 1. Backfill Videos
    // Fetch all videos. Ideally we would filter for NULL new columns, but raw_json is always present.
    // To be safe and idempotent, we process all.
    // For large datasets, this should be paginated. Assuming manageable size for now.
    const videos = await db.prepare('SELECT youtube_id, raw_json FROM youtube_videos').all<{youtube_id: string, raw_json: string}>();
    let vCount = 0;

    if (videos.results) {
        const batchStmts = [];
        for (const row of videos.results) {
            try {
                const item = JSON.parse(row.raw_json) as YoutubeVideoResource;
                const durationSeconds = parseDuration(item.contentDetails?.duration || '');
                const bestThumb = findBestThumbnail(item.snippet?.thumbnails || {});

                // Note: 'status' might not be in raw_json for old records, so these will be NULL/0
                // We use optional chaining heavily.

                batchStmts.push(db.prepare(`
                    UPDATE youtube_videos SET
                        duration_seconds = ?,
                        view_count = ?,
                        like_count = ?,
                        comment_count = ?,
                        best_thumbnail_url = ?,
                        best_thumbnail_width = ?,
                        best_thumbnail_height = ?,
                        definition = ?,
                        dimension = ?,
                        licensed_content = ?,
                        caption = ?,
                        privacy_status = ?,
                        embeddable = ?,
                        made_for_kids = ?
                    WHERE youtube_id = ?
                `).bind(
                    durationSeconds,
                    parseInt(item.statistics?.viewCount || '0'),
                    parseInt(item.statistics?.likeCount || '0'),
                    parseInt(item.statistics?.commentCount || '0'),
                    bestThumb?.url || null,
                    bestThumb?.width || null,
                    bestThumb?.height || null,
                    item.contentDetails?.definition || null,
                    item.contentDetails?.dimension || null,
                    item.contentDetails?.licensedContent ? 1 : 0,
                    item.contentDetails?.caption === 'true' ? 1 : 0,
                    item.status?.privacyStatus || null,
                    item.status?.embeddable ? 1 : 0,
                    item.status?.madeForKids ? 1 : 0,
                    row.youtube_id
                ));
                vCount++;
            } catch (e) {
                console.error(`Failed to parse video ${row.youtube_id}`, e);
            }
        }
        // Execute in chunks of 50
        for (let i = 0; i < batchStmts.length; i += 50) {
            await db.batch(batchStmts.slice(i, i + 50));
        }
    }

    // 2. Backfill Channels
    const channels = await db.prepare('SELECT youtube_id, raw_json FROM youtube_channels').all<{youtube_id: string, raw_json: string}>();
    let cCount = 0;

    if (channels.results) {
        const batchStmts = [];
        for (const row of channels.results) {
            try {
                const item = JSON.parse(row.raw_json) as YoutubeChannelResource;
                const bestThumb = findBestThumbnail(item.snippet?.thumbnails || {});

                batchStmts.push(db.prepare(`
                    UPDATE youtube_channels SET
                        view_count = ?,
                        subscriber_count = ?,
                        video_count = ?,
                        country = ?,
                        best_thumbnail_url = ?,
                        best_thumbnail_width = ?,
                        best_thumbnail_height = ?
                    WHERE youtube_id = ?
                `).bind(
                    parseInt(item.statistics?.viewCount || '0'),
                    parseInt(item.statistics?.subscriberCount || '0'),
                    parseInt(item.statistics?.videoCount || '0'),
                    item.snippet?.country || null,
                    bestThumb?.url || null,
                    bestThumb?.width || null,
                    bestThumb?.height || null,
                    row.youtube_id
                ));
                cCount++;
            } catch (e) {
                console.error(`Failed to parse channel ${row.youtube_id}`, e);
            }
        }
        // Execute in chunks
        for (let i = 0; i < batchStmts.length; i += 50) {
            await db.batch(batchStmts.slice(i, i + 50));
        }
    }

    return { videosUpdated: vCount, channelsUpdated: cCount };
}
