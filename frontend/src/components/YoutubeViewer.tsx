import React, { useState, useEffect } from 'react';
import type { YoutubeChannel, YoutubeVideo, YoutubeSyncResponse } from '../types';
import { VideoTable } from './VideoTable';

interface SearchResult {
    videos: YoutubeVideo[];
    limit: number;
    offset: number;
    total: number;
}

interface ChannelOption {
    youtube_id: string;
    title: string;
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
    const [selectedChannel, setSelectedChannel] = useState('');
    const [channels, setChannels] = useState<ChannelOption[]>([]);
    const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
    const [sortConfig, setSortConfig] = useState<{ by: string; order: 'asc' | 'desc' }>({ by: 'published_at', order: 'desc' });
    const [pagination, setPagination] = useState({ limit: 10, offset: 0 });

    // Common State
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync state
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState<YoutubeSyncResponse | null>(null);
    const [syncRange, setSyncRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
    const [totalFetched, setTotalFetched] = useState(0);

    const fetchChannelDetail = async (channelId: string) => {
        setLoading(true);
        setError(null);
        setSingleData(null);
        // Ensure UI state matches
        setViewMode('id');
        setType('channel');
        setId(channelId);

        try {
            const res = await fetch(`/api/youtube/channel/${channelId}`);
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

    const fetchVideoDetail = async (videoId: string) => {
        setLoading(true);
        setError(null);
        setSingleData(null);
        // Ensure UI state matches
        setViewMode('id');
        setType('video');
        setId(videoId);

        try {
            const res = await fetch(`/api/youtube/video/${videoId}`);
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

    const fetchChannels = async () => {
        try {
            const res = await fetch('/api/youtube/channels');
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.channels)) {
                    setChannels(data.channels);
                } else {
                    setChannels([]);
                }
            } else {
                 setChannels([]);
            }
        } catch (e) {
            console.error('Failed to fetch channels', e);
            setChannels([]);
        }
    };

    useEffect(() => {
        if (viewMode === 'search' && channels.length === 0) {
            fetchChannels();
        }
    }, [viewMode]);

    const handleSort = (column: string) => {
        setSortConfig(prev => {
            const isSame = prev.by === column;
            const newOrder = isSame && prev.order === 'desc' ? 'asc' : 'desc';
            return { by: column, order: newOrder };
        });
    };

    // Effect to trigger search when sort changes
    useEffect(() => {
        if (viewMode === 'search') {
            handleVideoSearch();
        }
    }, [sortConfig]); // Intentionally leave out pagination to handle it manually or add it if we want auto-refetch

    const totalPages = searchResults ? Math.ceil(searchResults.total / pagination.limit) : 0;
    const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

    const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLimit = parseInt(e.target.value);
        setPagination(prev => ({ ...prev, limit: newLimit, offset: 0 }));
        handleVideoSearch({ limit: newLimit, offset: 0 }); // Pass limit directly to ensure it uses new value
    };

    const handleVideoSearch = async (opts?: { offset?: number, limit?: number, channelId?: string, query?: string }) => {
        setLoading(true);
        setError(null);

        const currentOffset = opts?.offset !== undefined ? opts.offset : pagination.offset;
        const currentLimit = opts?.limit !== undefined ? opts.limit : pagination.limit;
        const currentChannel = opts?.channelId !== undefined ? opts.channelId : selectedChannel;
        const currentQuery = opts?.query !== undefined ? opts.query : searchQuery;

        try {
            const params = new URLSearchParams();
            if (currentQuery) params.append('title_contains', currentQuery);
            if (currentChannel) params.append('channel_id', currentChannel);
            params.append('sort_by', sortConfig.by);
            params.append('sort_order', sortConfig.order);
            params.append('limit', currentLimit.toString());
            params.append('offset', currentOffset.toString());

            const res = await fetch(`/api/youtube/videos?${params.toString()}`);
            const json = await res.json();

            if (!res.ok) {
                throw new Error(json.message || json.error || 'Failed to search');
            }

            setSearchResults(json);

            // Update pagination state
            setPagination(prev => ({
                ...prev,
                limit: currentLimit,
                offset: currentOffset
            }));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        if (!singleData || !('custom_url' in singleData)) return;
        setSyncing(true);
        setTotalFetched(0);
        setSyncProgress(null);
        setSyncRange({ start: null, end: null });
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

                // Update accumulated range
                setSyncRange(prev => {
                    let start = prev.start;
                    let end = prev.end;

                    if (progress.range_start) {
                        if (!start || progress.range_start < start) start = progress.range_start;
                    }
                    if (progress.range_end) {
                        if (!end || progress.range_end > end) end = progress.range_end;
                    }
                    return { start, end };
                });

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
                    {syncProgress && <div><strong>Total Stored Videos:</strong> {syncProgress.total_stored_videos}</div>}
                </div>
                {syncProgress?.sample_video && (
                     <div style={{ marginTop: '1rem' }}>
                        <strong>Sample Video from Sync:</strong>
                        <VideoTable
                            videos={[syncProgress.sample_video]}
                            onVideoClick={fetchVideoDetail}
                            onChannelClick={fetchChannelDetail}
                        />
                    </div>
                )}
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
                        <div style={{ color: 'var(--color-text-dim)', marginBottom: '1rem' }}>
                            {isChannel ? (
                                'Channel'
                            ) : (
                                <>
                                    Video by{' '}
                                    <button
                                        onClick={() => fetchChannelDetail((singleData as YoutubeVideo).channel_id)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: 0,
                                            color: 'var(--color-primary)',
                                            textDecoration: 'underline',
                                            cursor: 'pointer',
                                            fontSize: 'inherit',
                                            fontFamily: 'inherit'
                                        }}
                                    >
                                        {(singleData as YoutubeVideo).channel_title || (singleData as YoutubeVideo).channel_id}
                                    </button>
                                </>
                            )}{' '}
                            • {new Date(singleData.published_at).toLocaleDateString()}
                        </div>
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
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                    <button onClick={handleSync} disabled={syncing} style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}>{syncing ? 'Syncing...' : 'Sync Videos'}</button>
                                    <button
                                        onClick={() => {
                                            setViewMode('search');
                                            setSelectedChannel(singleData.youtube_id);
                                            setSearchQuery('');
                                            handleVideoSearch({ channelId: singleData.youtube_id, query: '', offset: 0 });
                                        }}
                                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                                    >
                                        See Channel Videos
                                    </button>
                                </div>
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

        return (
            <div style={{ marginTop: '2rem' }}>
                <VideoTable
                    videos={searchResults.videos}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    onVideoClick={fetchVideoDetail}
                    onChannelClick={fetchChannelDetail}
                />

                {/* Pagination */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div>
                            Total Results: <strong>{searchResults.total}</strong>
                        </div>
                        <div>
                            Page Size:
                            <select value={pagination.limit} onChange={handlePageSizeChange} style={{ marginLeft: '0.5rem' }}>
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                            disabled={currentPage === 1 || loading}
                            onClick={() => handleVideoSearch({ offset: 0 })}
                        >
                            First
                        </button>
                        <button
                            disabled={currentPage === 1 || loading}
                            onClick={() => handleVideoSearch({ offset: Math.max(0, (currentPage - 2) * pagination.limit) })}
                        >
                            Previous
                        </button>

                        <span style={{ margin: '0 0.5rem' }}>
                            Page
                            <input
                                type="number"
                                min={1}
                                max={totalPages}
                                value={currentPage}
                                onChange={(e) => {
                                    const page = parseInt(e.target.value);
                                    if (page >= 1 && page <= totalPages) {
                                        handleVideoSearch({ offset: (page - 1) * pagination.limit });
                                    }
                                }}
                                style={{ width: '50px', marginLeft: '0.5rem', marginRight: '0.5rem' }}
                            />
                            of {totalPages}
                        </span>

                        <button
                            disabled={currentPage === totalPages || loading}
                            onClick={() => handleVideoSearch({ offset: currentPage * pagination.limit })}
                        >
                            Next
                        </button>
                        <button
                            disabled={currentPage === totalPages || loading}
                            onClick={() => handleVideoSearch({ offset: (totalPages - 1) * pagination.limit })}
                        >
                            Last
                        </button>
                    </div>
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
                    <form onSubmit={(e) => { e.preventDefault(); handleVideoSearch({ offset: 0 }); }} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                        <input
                            type="text"
                            placeholder="Search videos by title..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ flex: 1 }}
                        />
                         <select
                            value={selectedChannel}
                            onChange={(e) => setSelectedChannel(e.target.value)}
                            style={{ width: '200px' }}
                        >
                            <option value="">All Channels</option>
                            {(channels || []).map(c => (
                                <option key={c.youtube_id} value={c.youtube_id}>{c.title}</option>
                            ))}
                        </select>
                        <button type="submit" disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
                    </form>
                    {error && <div className="error">{error}</div>}
                    {renderTable()}
                </>
            )}
        </section>
    );
}
