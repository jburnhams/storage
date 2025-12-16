import { useState, useEffect } from "react";
import { useSearchParams, useParams } from "react-router-dom";

interface PublicEntry {
    id: number;
    key: string;
    string_value: string | null;
    type: string;
    filename: string | null;
    has_blob: boolean;
    secret: string; // The secret matching the request
}

export function PublicShareView() {
    // URL pattern: /share/:key?secret=...
    // But :key can contain slashes. React router handles splats with *.
    // Route path="/share/*" matches /share/foo/bar
    // Params will capture the rest.

    // Actually, looking at App.tsx: <Route path="/share/*" ... />
    // We can extract the key from location.pathname manually or use splat.

    // NOTE: The user requested URL format: /share/:key?secret=:secret
    // If key has slashes, e.g. /share/folder/file?secret=...
    // react-router-dom v6 uses "*" for splats.

    const params = useParams();
    const [searchParams] = useSearchParams();
    const secret = searchParams.get("secret");

    const [entry, setEntry] = useState<PublicEntry | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>("");

    // The key is everything after /share/
    // We can use the splat param if configured as path="/share/*"
    const splat = params["*"];
    const key = splat;

    useEffect(() => {
        if (!key || !secret) {
            setError("Invalid link");
            setLoading(false);
            return;
        }

        fetch(`/api/public/share?key=${encodeURIComponent(key)}&secret=${encodeURIComponent(secret)}`)
            .then(res => {
                if (!res.ok) throw new Error("Entry not found or access denied");
                return res.json();
            })
            .then(data => {
                setEntry(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [key, secret]);

    if (loading) return <div className="loading">Loading shared entry...</div>;
    if (error) return <div className="error">{error}</div>;
    if (!entry) return <div className="error">Entry not found</div>;

    const downloadUrl = `/api/public/share?key=${encodeURIComponent(entry.key)}&secret=${encodeURIComponent(entry.secret)}&download=true`;
    const previewUrl = `/api/public/share?key=${encodeURIComponent(entry.key)}&secret=${encodeURIComponent(entry.secret)}&raw=true`;

    return (
        <div className="public-share-view">
            <header>
                <h1>Shared Entry</h1>
            </header>
            <div className="entry-content">
                <h2>{entry.key}</h2>
                <div className="meta">
                    <span className="type-badge">{entry.type}</span>
                    {entry.filename && <span className="filename">File: {entry.filename}</span>}
                </div>

                <div className="preview-area">
                    {entry.type.startsWith("image/") && (
                        <img src={previewUrl} alt="Preview" style={{maxWidth: '100%'}} />
                    )}

                    {(entry.type === "application/json" || entry.type.startsWith("text/")) && entry.string_value && (
                        <pre className="code-block">{entry.string_value}</pre>
                    )}

                    {/* Fallback for blob without string value that isn't image */}
                    {entry.has_blob && !entry.type.startsWith("image/") && (
                        <div className="file-placeholder">
                            <p>File content available for download.</p>
                        </div>
                    )}
                </div>

                <div className="actions">
                    {entry.has_blob && (
                        <a href={downloadUrl} className="btn primary" download>Download File</a>
                    )}
                </div>
            </div>
        </div>
    );
}
