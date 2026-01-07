import React, { useState, useEffect } from 'react';
import type { YoutubeChannel, YoutubeVideo, YoutubeSyncResponse } from '../types';

interface SearchResult {
    videos: YoutubeVideo[];
    limit: number;
    offset: number;
}

export function YoutubeViewer() {
    // Mode switcher
    const [viewMode, setViewMode] = useState<'id' | 'search'>('id');

    // ID Fetch State
    const [id, setId] = useState('');
    const [type, setType] = useState<'channel' | 'video'>('video');
    const [singleData, setSingleData] = useState<YoutubeChannel | YoutubeVideo | null>(null);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
    const [sortConfig, setSortConfig] = useState<{ by: string; order: 'asc' | 'desc' }>({ by: 'published_at', order: 'desc' });
    const [pagination, setPagination] = useState({ limit: 10, offset: 0 });

    // Common State
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync state
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState<YoutubeSyncResponse | null>(null);
    const [totalFetched, setTotalFetched] = useState(0);

    const handleIdSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;

        setLoading(true);
        setError(null);
        setSingleData(null);

        try {
            const res = await fetch(`/api/youtube/${type}/${id}`);
            const json = await res.json();

            if (!res.ok) {
                throw new Error(json.message || json.error || 'Failed to fetch');
            }

            setSingleData(json);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVideoSearch = async (overrideOffset?: number) => {
        setLoading(true);
        setError(null);

        const currentOffset = overrideOffset !== undefined ? overrideOffset : pagination.offset;

        try {
            const params = new URLSearchParams();
            if (searchQuery) params.append('title_contains', searchQuery);
            params.append('sort_by', sortConfig.by);
            params.append('sort_order', sortConfig.order);
            params.append('limit', pagination.limit.toString());
            params.append('offset', currentOffset.toString());

            const res = await fetch(`/api/youtube/videos?${params.toString()}`);
            const json = await res.json();

            if (!res.ok) {
                throw new Error(json.message || json.error || 'Failed to search');
            }

            setSearchResults(json);
            // If we overrode offset, update state
            if (overrideOffset !== undefined) {
                setPagination(prev => ({ ...prev, offset: overrideOffset }));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Trigger search when sort or pagination changes (but not offset if called directly via page buttons which call handleVideoSearch)
    // Actually, easier to just call handleVideoSearch manually on interactions.

    const handleSort = (column: string) => {
        setSortConfig(prev => {
            const isSame = prev.by === column;
            const newOrder = isSame && prev.order === 'desc' ? 'asc' : 'desc';
            return { by: column, order: newOrder };
        });
        // We need to wait for state update or pass new config directly.
        // Let's use useEffect for reacting to sort/pagination changes?
        // Or just fire request with new params immediately.
        // Simpler: Just update state and have a useEffect that watches sort/pagination?
        // Let's do explicit call to avoid double fetches or complexity.
    };

    // Effect to trigger search when sort changes
    useEffect(() => {
        if (viewMode === 'search') {
            handleVideoSearch();
        }
    }, [sortConfig]); // Intentionally leave out pagination to handle it manually or add it if we want auto-refetch

    const handleSync = async () => {
        if (!singleData || !('custom_url' in singleData)) return;
        setSyncing(true);
        setTotalFetched(0);
        setSyncProgress(null);
        setError(null);

        let isComplete = false;

        try {
            let safetyLimit = 100;
            while (!isComplete && safetyLimit > 0) {
                safetyLimit--;
                const res = await fetch(`/api/youtube/channel/${singleData.youtube_id}/sync`, { method: 'POST' });
                const json = await res.json();
                if (!res.ok) throw new Error(json.message || json.error || 'Sync failed');

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
             try {
                const res = await fetch(`/api/youtube/channel/${singleData.youtube_id}`);
                if (res.ok) setSingleData(await res.json());
            } catch (e) { console.error(e); }
        }
    };

    const formatJSON = (jsonString: string) => {
        try { return JSON.stringify(JSON.parse(jsonString), null, 2); } catch (e) { return jsonString; }
    };

    const renderSyncProgress = () => {
        if (!syncProgress && !syncing) return null;
        return (
            <div style={{ background: 'var(--color-bg)', padding: '1rem', borderRadius: '4px', marginTop: '1rem', border: '1px solid var(--color-border)' }}>
                <h3>Sync Progress</h3>
                {syncing && <div style={{ color: 'var(--color-primary)' }}>Syncing...</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '0.5rem' }}>
                    <div><strong>Total Fetched This Run:</strong> {totalFetched}</div>
                    <div><strong>Current Range:</strong><br/>{syncProgress ? <>{new Date(syncProgress.range_start).toLocaleDateString()} - {new Date(syncProgress.range_end).toLocaleDateString()}</> : 'Starting...'}</div>
                </div>
                {syncProgress?.is_complete && <div style={{ marginTop: '1rem', color: 'green', fontWeight: 'bold' }}>Sync Complete!</div>}
            </div>
        );
    };

    const renderSingleResult = () => {
        if (!singleData) return null;
        const isChannel = 'custom_url' in singleData;
        const stats = JSON.parse(singleData.statistics);
        return (
            <div className="youtube-result" style={{ marginTop: '2rem' }}>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                    <img src={singleData.thumbnail_url} alt={singleData.title} style={{ width: '200px', borderRadius: '8px' }} />
                    <div>
                        <h2 style={{ marginBottom: '0.5rem' }}>{singleData.title}</h2>
                        <div style={{ color: 'var(--color-text-dim)', marginBottom: '1rem' }}>{isChannel ? 'Channel' : 'Video'} • {new Date(singleData.published_at).toLocaleDateString()}</div>
                        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                            {Object.entries(stats).map(([key, value]) => (
                                <div key={key} style={{ background: 'var(--color-bg)', padding: '0.5rem', borderRadius: '4px' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                                    <div style={{ fontWeight: 'bold' }}>{String(value)}</div>
                                </div>
                            ))}
                        </div>
                        {isChannel && (
                            <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--color-text-dim)' }}>
                                <div><strong>Sync Status:</strong></div>
                                <div>Earliest: { (singleData as YoutubeChannel).sync_start_date ? new Date((singleData as YoutubeChannel).sync_start_date!).toLocaleDateString() : 'Never' }</div>
                                <button onClick={handleSync} disabled={syncing} style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}>{syncing ? 'Syncing...' : 'Sync Videos'}</button>
                            </div>
                        )}
                        <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{singleData.description}</p>
                    </div>
                </div>
                {renderSyncProgress()}
                <details style={{ marginTop: '2rem', background: 'var(--color-bg)', padding: '1rem', borderRadius: '4px' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Raw JSON</summary>
                    <pre style={{ marginTop: '1rem', overflowX: 'auto' }}>{formatJSON(singleData.raw_json)}</pre>
                </details>
            </div>
        );
    };

    const renderTable = () => {
        if (!searchResults || searchResults.videos.length === 0) {
            return searchResults ? <div style={{ marginTop: '2rem' }}>No results found.</div> : null;
        }

        const renderSortIcon = (col: string) => {
            if (sortConfig.by !== col) return <span style={{ opacity: 0.3 }}>⇅</span>;
            return sortConfig.order === 'asc' ? '↑' : '↓';
        };

        const headers = [
            { label: 'Title', key: 'title' },
            { label: 'Published', key: 'published_at' },
            { label: 'Views', key: 'statistics.viewCount' },
            { label: 'Channel', key: 'channel_id' },
        ];

        return (
            <div style={{ marginTop: '2rem', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Thumb</th>
                            {headers.map(h => (
                                <th
                                    key={h.key}
                                    style={{ padding: '0.75rem', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleSort(h.key)}
                                >
                                    {h.label} {renderSortIcon(h.key)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {searchResults.videos.map(video => {
                            let views = 'N/A';
                            try {
                                views = JSON.parse(video.statistics).viewCount || 'N/A';
                            } catch (e) {}

                            return (
                                <tr key={video.youtube_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <td style={{ padding: '0.75rem' }}>
                                        <img src={video.thumbnail_url} alt="" style={{ height: '60px', borderRadius: '4px' }} />
                                    </td>
                                    <td style={{ padding: '0.75rem', maxWidth: '300px' }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{video.title}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>{video.duration}</div>
                                    </td>
                                    <td style={{ padding: '0.75rem' }}>{new Date(video.published_at).toLocaleDateString()}</td>
                                    <td style={{ padding: '0.75rem' }}>{parseInt(views).toLocaleString()}</td>
                                    <td style={{ padding: '0.75rem', fontSize: '0.9rem', fontFamily: 'monospace' }}>{video.channel_id}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>

                {/* Pagination */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                    <button
                        disabled={pagination.offset === 0 || loading}
                        onClick={() => handleVideoSearch(Math.max(0, pagination.offset - pagination.limit))}
                    >
                        Previous
                    </button>
                    <span style={{ alignSelf: 'center' }}>
                        Page {Math.floor(pagination.offset / pagination.limit) + 1}
                    </span>
                    <button
                        disabled={searchResults.videos.length < pagination.limit || loading}
                        onClick={() => handleVideoSearch(pagination.offset + pagination.limit)}
                    >
                        Next
                    </button>
                </div>
            </div>
        );
    };

    return (
        <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2>YouTube Viewer</h2>
                <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--color-bg)', padding: '0.25rem', borderRadius: '4px' }}>
                    <button
                        onClick={() => setViewMode('id')}
                        style={{ background: viewMode === 'id' ? 'var(--color-primary)' : 'transparent', color: viewMode === 'id' ? 'white' : 'inherit', border: 'none' }}
                    >
                        Fetch ID
                    </button>
                    <button
                        onClick={() => setViewMode('search')}
                        style={{ background: viewMode === 'search' ? 'var(--color-primary)' : 'transparent', color: viewMode === 'search' ? 'white' : 'inherit', border: 'none' }}
                    >
                        Search Database
                    </button>
                </div>
            </div>

            {viewMode === 'id' ? (
                <>
                    <form onSubmit={handleIdSearch} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <select value={type} onChange={(e) => setType(e.target.value as 'channel' | 'video')} style={{ width: '150px' }}>
                            <option value="video">Video</option>
                            <option value="channel">Channel</option>
                        </select>
                        <input type="text" placeholder={type === 'channel' ? "Channel ID" : "Video ID"} value={id} onChange={(e) => setId(e.target.value)} style={{ flex: 1 }} />
                        <button type="submit" disabled={loading || !id}>{loading ? 'Loading...' : 'Fetch'}</button>
                    </form>
                    {error && <div className="error">{error}</div>}
                    {renderSingleResult()}
                </>
            ) : (
                <>
                    <form onSubmit={(e) => { e.preventDefault(); handleVideoSearch(0); }} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <input
                            type="text"
                            placeholder="Search videos by title..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <button type="submit" disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
                    </form>
                    {error && <div className="error">{error}</div>}
                    {renderTable()}
                </>
            )}
        </section>
    );
}
