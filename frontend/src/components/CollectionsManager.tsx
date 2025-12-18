import { useState, useEffect } from "react";
import { UserResponse } from "../types";
import { StorageExplorer } from "./StorageExplorer";

interface Collection {
    id: number;
    name: string;
    description: string | null;
    secret: string;
    created_at: string;
    updated_at: string;
    metadata: string | null;
    origin: string | null;
}

interface Props {
    user: UserResponse;
}

export function CollectionsManager({ user }: Props) {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<Collection | null>(null);

    // View Mode
    const [viewingCollection, setViewingCollection] = useState<Collection | null>(null);

    const fetchCollections = () => {
        setLoading(true);
        fetch("/api/collections")
            .then(async res => {
                if (!res.ok) throw new Error("Failed to fetch collections");
                return res.json();
            })
            .then(data => {
                setCollections(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    useEffect(() => {
        if (!viewingCollection) {
            fetchCollections();
        }
    }, [viewingCollection]);

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure? This will delete the collection metadata (entries will remain or be deleted depending on cascade - usually entries are deleted).")) return;
        try {
            const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchCollections();
            } else {
                alert("Failed to delete");
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDownloadZip = (id: number, name: string) => {
        window.open(`/api/collections/${id}/download`, "_blank");
    };

    const handleExportJson = (id: number) => {
         window.open(`/api/collections/${id}/export`, "_blank");
    };

    if (viewingCollection) {
        return (
            <div className="collection-viewer">
                <div style={{ marginBottom: "10px" }}>
                    <button onClick={() => setViewingCollection(null)}>← Back to Collections</button>
                    <span style={{ marginLeft: "10px", fontWeight: "bold" }}>{viewingCollection.name}</span>
                </div>
                <StorageExplorer user={user} collection={viewingCollection} />
            </div>
        );
    }

    return (
        <div className="collections-manager">
            <div className="toolbar">
                <button onClick={() => { setEditingCollection(null); setIsModalOpen(true); }}>
                    + New Collection
                </button>
            </div>

            <div className="collection-list">
                {loading ? <p>Loading...</p> : (
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Meta</th>
                                <th>Secret</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {collections.map(c => (
                                <tr key={c.id}>
                                    <td>
                                        <a href="#" onClick={(e) => { e.preventDefault(); setViewingCollection(c); }}>
                                            {c.name}
                                        </a>
                                    </td>
                                    <td>{c.description}</td>
                                    <td>{c.metadata ? "✅" : ""}</td>
                                    <td>
                                        <code title="Use this secret for auth-less access">{c.secret}</code>
                                    </td>
                                    <td>
                                        <button onClick={() => { setEditingCollection(c); setIsModalOpen(true); }}>Edit</button>
                                        <button onClick={() => setViewingCollection(c)}>Browse</button>
                                        <button onClick={() => handleDownloadZip(c.id, c.name)}>Download ZIP</button>
                                        <button onClick={() => handleExportJson(c.id)}>Export JSON</button>
                                        <button onClick={() => handleDelete(c.id)}>Delete</button>
                                        <button onClick={() => {
                                            const link = `${window.location.origin}/api/public/collection?secret=${c.secret}`;
                                            navigator.clipboard.writeText(link);
                                            alert("Public JSON link copied!");
                                        }}>Share Link</button>
                                    </td>
                                </tr>
                            ))}
                            {collections.length === 0 && (
                                <tr><td colSpan={5}>No collections found</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {isModalOpen && (
                <CollectionModal
                    collection={editingCollection}
                    onClose={() => setIsModalOpen(false)}
                    onSave={() => { setIsModalOpen(false); fetchCollections(); }}
                />
            )}
        </div>
    );
}

function CollectionModal({ collection, onClose, onSave }: any) {
    const [name, setName] = useState(collection ? collection.name : "");
    const [description, setDescription] = useState(collection ? collection.description || "" : "");
    const [metadata, setMetadata] = useState(collection ? collection.metadata || "" : "");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        if (metadata) {
            try {
                JSON.parse(metadata);
            } catch (e) {
                setError("Metadata must be valid JSON");
                setSubmitting(false);
                return;
            }
        }

        const url = collection ? `/api/collections/${collection.id}` : "/api/collections";
        const method = collection ? "PUT" : "POST";

        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description, metadata })
            });

            if (!res.ok) throw new Error("Failed to save");
            onSave();
        } catch (e) {
            alert("Error saving collection");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <h2>{collection ? "Edit Collection" : "New Collection"}</h2>
                {error && <div className="error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Metadata (JSON)</label>
                        <textarea
                            value={metadata}
                            onChange={e => setMetadata(e.target.value)}
                            rows={4}
                            placeholder='{"project": "alpha"}'
                        />
                    </div>
                    <div className="actions">
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button type="submit" disabled={submitting}>Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
