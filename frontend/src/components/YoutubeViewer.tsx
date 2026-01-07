import React, { useState } from 'react';
import type { YoutubeChannel, YoutubeVideo } from '../types';

export function YoutubeViewer() {
    const [id, setId] = useState('');
    const [type, setType] = useState<'channel' | 'video'>('video');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<YoutubeChannel | YoutubeVideo | null>(null);

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

    const formatJSON = (jsonString: string) => {
        try {
            const obj = JSON.parse(jsonString);
            return JSON.stringify(obj, null, 2);
        } catch (e) {
            return jsonString;
        }
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

                        <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>{data.description}</p>
                    </div>
                </div>

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
