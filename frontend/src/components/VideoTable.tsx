import React from 'react';
import type { YoutubeVideo } from '../types';

interface VideoTableProps {
    videos: YoutubeVideo[];
    sortConfig?: { by: string; order: 'asc' | 'desc' };
    onSort?: (column: string) => void;
    onVideoClick: (videoId: string) => void;
    onChannelClick?: (channelId: string) => void;
    showChannelColumn?: boolean;
}

export function VideoTable({
    videos,
    sortConfig,
    onSort,
    onVideoClick,
    onChannelClick,
    showChannelColumn = true
}: VideoTableProps) {
    if (!videos || videos.length === 0) return null;

    const renderSortIcon = (col: string) => {
        if (!sortConfig || !onSort) return null;
        if (sortConfig.by !== col) return <span style={{ opacity: 0.3 }}>⇅</span>;
        return sortConfig.order === 'asc' ? '↑' : '↓';
    };

    const headers = [
        { label: 'Title', key: 'title' },
        { label: 'Published', key: 'published_at' },
        { label: 'Views', key: 'statistics.viewCount' }, // Keeping the key string for now, caller handles logic
    ];

    if (showChannelColumn) {
        headers.push({ label: 'Channel', key: 'channel_id' });
    }

    return (
        <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px', border: '1px solid var(--color-border)' }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', background: 'var(--color-surface)' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Thumb</th>
                        {headers.map(h => (
                            <th
                                key={h.key}
                                style={{
                                    padding: '0.75rem',
                                    textAlign: 'left',
                                    cursor: onSort ? 'pointer' : 'default',
                                    userSelect: 'none'
                                }}
                                onClick={() => onSort && onSort(h.key)}
                            >
                                {h.label} {renderSortIcon(h.key)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {videos.map(video => {
                        let views = 'N/A';
                        try {
                            // Handle both raw string statistics and parsed object (if pre-parsed)
                            // But type says string.
                            const stats = typeof video.statistics === 'string' ? JSON.parse(video.statistics) : video.statistics;
                            views = stats.viewCount || 'N/A';
                        } catch (e) {}

                        return (
                            <tr key={video.youtube_id} style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                                <td style={{ padding: '0.75rem' }}>
                                    <img
                                        src={video.thumbnail_url}
                                        alt=""
                                        style={{ height: '60px', borderRadius: '4px', cursor: 'pointer' }}
                                        onClick={() => onVideoClick(video.youtube_id)}
                                    />
                                </td>
                                <td style={{ padding: '0.75rem', maxWidth: '300px' }}>
                                    <div
                                        style={{ fontWeight: 'bold', marginBottom: '0.25rem', cursor: 'pointer', color: 'var(--color-primary)' }}
                                        onClick={() => onVideoClick(video.youtube_id)}
                                    >
                                        {video.title}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>{video.duration}</div>
                                </td>
                                <td style={{ padding: '0.75rem' }}>{new Date(video.published_at).toLocaleDateString()}</td>
                                <td style={{ padding: '0.75rem' }}>{parseInt(views).toLocaleString()}</td>
                                {showChannelColumn && (
                                    <td style={{ padding: '0.75rem' }}>
                                        <button
                                            onClick={() => onChannelClick && onChannelClick(video.channel_id)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--color-primary)',
                                                cursor: 'pointer',
                                                textDecoration: 'underline',
                                                padding: 0,
                                                fontFamily: 'inherit',
                                                fontSize: 'inherit'
                                            }}
                                        >
                                            {video.channel_title || video.channel_id}
                                        </button>
                                    </td>
                                )}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    );
}
