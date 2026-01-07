import React, { useState } from 'react';
import type { YoutubeChannel, YoutubeVideo, YoutubeSyncResponse } from '../types';

export function YoutubeViewer() {
    const [id, setId] = useState('');
    const [type, setType] = useState<'channel' | 'video'>('video');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<YoutubeChannel | YoutubeVideo | null>(null);

    // Sync state
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState<YoutubeSyncResponse | null>(null);
    const [totalFetched, setTotalFetched] = useState(0);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;

        setLoading(true);
        setError(null);
        setData(null);

        try {
            const res = await fetch(`/api/youtube/${type}/${id}`);
            const json = await res.json();

            if (!res.ok) {
                throw new Error(json.message || json.error || 'Failed to fetch');
            }

            setData(json);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        if (!data || !('custom_url' in data)) return;
        setSyncing(true);
        setTotalFetched(0);
        setSyncProgress(null);
        setError(null);

        let isComplete = false;

        try {
            // Safety break to prevent infinite loops in bad conditions
            let safetyLimit = 100;

            while (!isComplete && safetyLimit > 0) {
                safetyLimit--;
                const res = await fetch(`/api/youtube/channel/${data.youtube_id}/sync`, {
                    method: 'POST'
                });
                const json = await res.json();

                if (!res.ok) {
                    throw new Error(json.message || json.error || 'Sync failed');
                }

                const progress = json as YoutubeSyncResponse;
                setSyncProgress(progress);
                setTotalFetched(prev => prev + progress.count);
                isComplete = progress.is_complete;

                if (isComplete) break;
            }
        } catch (err: any) {
            setError(`Sync error: ${err.message}`);
        } finally {
            setSyncing(false);
            // Refresh channel data to show new sync dates.
            // We reuse the current search logic but need to be careful not to reset unrelated state
            // or trigger form submit event.
            // A simple re-fetch:
             try {
                const res = await fetch(`/api/youtube/channel/${data.youtube_id}`);
                if (res.ok) {
                    setData(await res.json());
                }
            } catch (e) { console.error(e); }
        }
    };

    const formatJSON = (jsonString: string) => {
        try {
            const obj = JSON.parse(jsonString);
            return JSON.stringify(obj, null, 2);
        } catch (e) {
            return jsonString;
        }
    };

    const renderSyncProgress = () => {
        if (!syncProgress && !syncing) return null;

        return (
            <div style={{ background: 'var(--color-bg)', padding: '1rem', borderRadius: '4px', marginTop: '1rem', border: '1px solid var(--color-border)' }}>
                <h3>Sync Progress</h3>
                {syncing && <div style={{ color: 'var(--color-primary)' }}>Syncing...</div>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '0.5rem' }}>
                    <div>
                        <strong>Total Fetched This Run:</strong> {totalFetched}
                    </div>
                    <div>
                         <strong>Current Range:</strong><br/>
                         {syncProgress ? (
                             <>
                                {new Date(syncProgress.range_start).toLocaleDateString()} - {new Date(syncProgress.range_end).toLocaleDateString()}
                             </>
                         ) : 'Starting...'}
                    </div>
                </div>

                {syncProgress?.sample_video && (
                     <div style={{ marginTop: '1rem' }}>
                        <strong>Latest Sample:</strong>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', alignItems: 'center' }}>
                            <img
                                src={syncProgress.sample_video.thumbnail_url}
                                style={{ height: '40px', borderRadius: '4px' }}
                            />
                            <div style={{ fontSize: '0.9rem' }}>
                                {syncProgress.sample_video.title} ({new Date(syncProgress.sample_video.published_at).toLocaleDateString()})
                            </div>
                        </div>
                     </div>
                )}

                {syncProgress?.is_complete && (
                    <div style={{ marginTop: '1rem', color: 'green', fontWeight: 'bold' }}>
                        Sync Complete! All videos up to channel creation fetched.
                    </div>
                )}
            </div>
        );
    };

    const renderData = () => {
        if (!data) return null;

        const isChannel = 'custom_url' in data;
        const stats = JSON.parse(data.statistics);

        return (
            <div className="youtube-result" style={{ marginTop: '2rem' }}>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                    <img
                        src={data.thumbnail_url}
                        alt={data.title}
                        style={{ width: '200px', borderRadius: '8px' }}
                    />
                    <div>
                        <h2 style={{ marginBottom: '0.5rem' }}>{data.title}</h2>
                        <div style={{ color: 'var(--color-text-dim)', marginBottom: '1rem' }}>
                            {isChannel ? 'Channel' : 'Video'} • {new Date(data.published_at).toLocaleDateString()}
                        </div>

                        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                            {Object.entries(stats).map(([key, value]) => (
                                <div key={key} style={{ background: 'var(--color-bg)', padding: '0.5rem', borderRadius: '4px' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', textTransform: 'capitalize' }}>
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </div>
                                    <div style={{ fontWeight: 'bold' }}>{String(value)}</div>
                                </div>
                            ))}
                        </div>

                         {/* Sync Stats for Channel */}
                        {isChannel && (
                            <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--color-text-dim)' }}>
                                <div><strong>Sync Status:</strong></div>
                                <div>Earliest: { (data as YoutubeChannel).sync_start_date ? new Date((data as YoutubeChannel).sync_start_date!).toLocaleDateString() : 'Never' }</div>
                                <div>Latest: { (data as YoutubeChannel).sync_end_date ? new Date((data as YoutubeChannel).sync_end_date!).toLocaleDateString() : 'Never' }</div>
                                <button
                                    onClick={handleSync}
                                    disabled={syncing}
                                    style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                                >
                                    {syncing ? 'Syncing...' : 'Sync Videos'}
                                </button>
                            </div>
                        )}

                        <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{data.description}</p>
                    </div>
                </div>

                {renderSyncProgress()}

                <details style={{ marginTop: '2rem', background: 'var(--color-bg)', padding: '1rem', borderRadius: '4px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Raw JSON</summary>
                    <pre style={{ marginTop: '1rem', overflowX: 'auto' }}>
                        {formatJSON(data.raw_json)}
                    </pre>
                </details>
            </div>
        );
    };

    return (
        <section>
            <h2>YouTube Viewer</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value as 'channel' | 'video')}
                    style={{ width: '150px' }}
                >
                    <option value="video">Video</option>
                    <option value="channel">Channel</option>
                </select>
                <input
                    type="text"
                    placeholder={type === 'channel' ? "Channel ID (e.g. UC...)" : "Video ID (e.g. dQw...)"}
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    style={{ flex: 1 }}
                />
                <button type="submit" disabled={loading || !id} style={{ marginTop: 0 }}>
                    {loading ? 'Loading...' : 'Fetch'}
                </button>
            </form>

            {error && <div className="error">{error}</div>}
            {renderData()}
        </section>
    );
}
