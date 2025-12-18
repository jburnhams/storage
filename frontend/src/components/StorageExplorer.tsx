import { useState, useEffect, useMemo } from "react";
import { UserResponse } from "../types";

interface KeyValueEntryResponse {
  id: number;
  key: string;
  string_value: string | null;
  has_blob: boolean;
  secret: string;
  type: string;
  filename: string | null;
  user_id: number;
  collection_id: number | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
  origin: string | null;
}

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
    collection?: Collection | null;
}

export function StorageExplorer({ user, collection }: Props) {
    const [entries, setEntries] = useState<KeyValueEntryResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPrefix, setSelectedPrefix] = useState<string>("");
    const [search, setSearch] = useState("");
    const [searchInFolder, setSearchInFolder] = useState(false);
    const [includeCollections, setIncludeCollections] = useState(false);

    // Multi-select
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // For Create/Edit Modal
    const [editingEntry, setEditingEntry] = useState<KeyValueEntryResponse | null>(null); // Null = creating new
    const [isModalOpen, setIsModalOpen] = useState(false);

    // For Zip Upload Modal (Collection Mode)
    const [isUploadZipOpen, setIsUploadZipOpen] = useState(false);

    const fetchEntries = () => {
        setLoading(true);
        let url = "/api/storage/entries?";
        const params = new URLSearchParams();

        if (collection) {
            params.set("collection_id", collection.id.toString());
        } else {
             if (includeCollections) {
                 params.set("include_collections", "true");
             }
        }

        fetch(url + params.toString())
            .then(async res => {
                if (!res.ok) {
                    throw new Error(`Failed to fetch: ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                if (Array.isArray(data)) {
                    setEntries(data);
                } else {
                    console.error("Expected array of entries, got:", data);
                    setEntries([]);
                }
                setLoading(false);
                setSelectedIds(new Set()); // Reset selection
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchEntries();
    }, [collection, includeCollections]);

    // Build Tree Structure
    const tree = useMemo(() => {
        const root: any = { name: "", path: "", children: {}, entries: [] };

        entries.forEach(entry => {
            const parts = entry.key.split("/");
            let current = root;

            // Navigate/Build folders
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        path: current.path ? `${current.path}/${part}` : part,
                        children: {},
                        entries: []
                    };
                }
                current = current.children[part];
            }

            // Add entry to the leaf folder
            current.entries.push(entry);
        });

        return root;
    }, [entries]);

    // Filtered List based on selection and search
    const filteredEntries = useMemo(() => {
        let result = entries;

        if (!search) {
             // Browser Mode
             if (selectedPrefix) {
                 // Exact match for parent directory
                 result = result.filter(e => {
                     const lastSlash = e.key.lastIndexOf("/");
                     const parent = lastSlash === -1 ? "" : e.key.substring(0, lastSlash);
                     return parent === selectedPrefix;
                 });
             } else {
                 // Root
                 result = result.filter(e => !e.key.includes("/"));
             }
        } else {
            // Search Mode
            if (searchInFolder) {
                result = result.filter(e => e.key.startsWith(selectedPrefix ? selectedPrefix + "/" : ""));
            }
            result = result.filter(e => e.key.toLowerCase().includes(search.toLowerCase()));
        }

        return result;
    }, [entries, selectedPrefix, search, searchInFolder]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const ids = new Set(filteredEntries.map(e => e.id));
            setSelectedIds(ids);
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelect = (id: number, checked: boolean) => {
        const newSet = new Set(selectedIds);
        if (checked) newSet.add(id);
        else newSet.delete(id);
        setSelectedIds(newSet);
    };

    const handleDelete = async (ids: number[]) => {
        if (!confirm(`Are you sure you want to delete ${ids.length} items?`)) return;

        if (ids.length === 1) {
            try {
                const res = await fetch(`/api/storage/entry/${ids[0]}`, { method: "DELETE" });
                if (res.ok) fetchEntries();
                else alert("Failed to delete");
            } catch (e) { console.error(e); }
        } else {
            // Bulk Delete
             try {
                const res = await fetch(`/api/storage/bulk/delete`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ entry_ids: ids })
                });
                if (res.ok) fetchEntries();
                else alert("Failed to delete");
            } catch (e) { console.error(e); }
        }
    };

    const handleBulkDownload = async () => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);

        // Use download endpoint (window.open with form post is tricky, fetch blob is better)
        try {
            const res = await fetch("/api/storage/bulk/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entry_ids: ids })
            });
            if (!res.ok) throw new Error("Download failed");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "download.zip";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert("Error downloading zip");
            console.error(e);
        }
    };

    const handleBulkExport = async () => {
         if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);

        try {
            const res = await fetch("/api/storage/bulk/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entry_ids: ids })
            });
            if (!res.ok) throw new Error("Export failed");

            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = window.URL.createObjectURL(blob);
             const a = document.createElement("a");
            a.href = url;
            a.download = "export.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (e) {
             alert("Error exporting json");
            console.error(e);
        }
    }

    return (
        <div className="storage-explorer">
            <div className="sidebar">
                <h3>{collection ? collection.name : "Explorer"}</h3>
                {!collection && (
                    <div className="toggle-wrapper" style={{marginBottom: '10px'}}>
                         <label>
                            <input
                                type="checkbox"
                                checked={includeCollections}
                                onChange={e => setIncludeCollections(e.target.checked)}
                            />
                            Show collection files
                         </label>
                    </div>
                )}
                <div className="tree-view">
                    <div
                        className={`tree-item ${selectedPrefix === "" ? "active" : ""}`}
                        onClick={() => setSelectedPrefix("")}
                    >
                        📁 Root
                    </div>
                    <FolderTree
                        node={tree}
                        selectedPath={selectedPrefix}
                        onSelect={setSelectedPrefix}
                    />
                </div>
            </div>

            <div className="main-content">
                <div className="toolbar" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => { setEditingEntry(null); setIsModalOpen(true); }}>
                        + New Entry
                    </button>
                    {collection && (
                        <>
                             <button onClick={() => setIsUploadZipOpen(true)}>Upload ZIP</button>
                             {/* Collection specific full download/export already in CollectionsManager, but could add here too if needed */}
                        </>
                    )}

                    {selectedIds.size > 0 && (
                        <>
                            <span style={{marginLeft: 'auto'}}>Selected: {selectedIds.size}</span>
                            <button onClick={handleBulkDownload}>Download ZIP</button>
                            <button onClick={handleBulkExport}>Export JSON</button>
                            <button onClick={() => handleDelete(Array.from(selectedIds))} style={{backgroundColor: '#e74c3c'}}>Delete</button>
                        </>
                    )}

                    <div className="search-box" style={{ marginLeft: selectedIds.size === 0 ? 'auto' : '10px' }}>
                        <input
                            type="text"
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <label>
                            <input
                                type="checkbox"
                                checked={searchInFolder}
                                onChange={(e) => setSearchInFolder(e.target.checked)}
                            />
                            Folder
                        </label>
                    </div>
                </div>

                <div className="entry-list">
                    {loading ? <p>Loading...</p> : (
                        <table>
                            <thead>
                                <tr>
                                    <th style={{width: '30px'}}>
                                        <input
                                            type="checkbox"
                                            checked={filteredEntries.length > 0 && filteredEntries.every(e => selectedIds.has(e.id))}
                                            onChange={e => handleSelectAll(e.target.checked)}
                                        />
                                    </th>
                                    <th>Key/Name</th>
                                    {!collection && includeCollections && <th>Col ID</th>}
                                    <th>Type</th>
                                    <th>Modified</th>
                                    <th>Meta</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEntries.map(entry => (
                                    <tr key={entry.id} className={selectedIds.has(entry.id) ? "selected" : ""}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(entry.id)}
                                                onChange={e => handleSelect(entry.id, e.target.checked)}
                                            />
                                        </td>
                                        <td title={entry.key}>
                                            {search ? entry.key : entry.key.split("/").pop()}
                                        </td>
                                        {!collection && includeCollections && <td>{entry.collection_id || "-"}</td>}
                                        <td>{entry.type}</td>
                                        <td>{new Date(entry.updated_at).toLocaleString()}</td>
                                        <td>{entry.metadata ? "✅" : ""}</td>
                                        <td>
                                            <button onClick={() => { setEditingEntry(entry); setIsModalOpen(true); }}>Edit</button>
                                            <button onClick={() => handleDelete([entry.id])}>Delete</button>
                                            <button onClick={() => {
                                                const link = `${window.location.origin}/api/public/share?key=${encodeURIComponent(entry.key)}&secret=${entry.secret}`;
                                                navigator.clipboard.writeText(link);
                                                alert("Link copied!");
                                            }}>Share</button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredEntries.length === 0 && (
                                    <tr><td colSpan={includeCollections && !collection ? 7 : 6}>No entries found</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <EntryModal
                    entry={editingEntry}
                    collectionId={collection?.id}
                    onClose={() => setIsModalOpen(false)}
                    onSave={() => { setIsModalOpen(false); fetchEntries(); }}
                    currentPath={selectedPrefix}
                />
            )}

            {isUploadZipOpen && collection && (
                 <UploadZipModal
                    collectionId={collection.id}
                    onClose={() => setIsUploadZipOpen(false)}
                    onComplete={() => { setIsUploadZipOpen(false); fetchEntries(); }}
                />
            )}
        </div>
    );
}

function FolderTree({ node, selectedPath, onSelect }: any) {
    return (
        <ul>
            {Object.keys(node.children).map(childName => {
                const childNode = node.children[childName];
                return (
                    <li key={childNode.path}>
                        <div
                            className={`tree-item ${selectedPath === childNode.path ? "active" : ""}`}
                            onClick={(e) => { e.stopPropagation(); onSelect(childNode.path); }}
                        >
                           📁 {childName}
                        </div>
                        <FolderTree node={childNode} selectedPath={selectedPath} onSelect={onSelect} />
                    </li>
                );
            })}
        </ul>
    );
}

function EntryModal({ entry, onClose, onSave, currentPath, collectionId }: any) {
    const [key, setKey] = useState(entry ? entry.key : (currentPath ? `${currentPath}/` : ""));
    const [type, setType] = useState(entry ? entry.type : "text/plain");
    const [stringValue, setStringValue] = useState(entry ? entry.string_value || "" : "");
    const [metadata, setMetadata] = useState(entry ? entry.metadata || "" : "");
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // If editing, fetch full details (string value might be missing in list)
    useEffect(() => {
        if (entry && !entry.string_value && !entry.has_blob) {
            // It might be empty? or we need to fetch it?
            // The list endpoint returns string_value, so it should be there if it's small.
            // But if we want to be sure, we could fetch details.
            // For now assume list has it.
        }
    }, [entry]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError("");

        // Validate JSON
        if (metadata) {
            try {
                JSON.parse(metadata);
            } catch (e) {
                setError("Metadata must be valid JSON");
                setSubmitting(false);
                return;
            }
        }

        const formData = new FormData();
        formData.append("type", type);
        // Rename support: send key even for updates
        formData.append("key", key);
        if (metadata) formData.append("metadata", metadata);

        if (collectionId) {
            formData.append("collection_id", collectionId.toString());
        }

        if (entry) {
            // Update
            // Logic: if file selected, send file. Else send string_value.
            if (file) {
                formData.append("file", file);
            } else {
                 formData.append("string_value", stringValue);
            }
        } else {
            // Create
            if (file) {
                formData.append("file", file);
            } else {
                formData.append("string_value", stringValue);
            }
        }

        const url = entry ? `/api/storage/entry/${entry.id}` : "/api/storage/entry";
        const method = entry ? "PUT" : "POST";

        try {
            const res = await fetch(url, {
                method,
                body: formData
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || "Failed to save");
            }

            onSave();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <h2>{entry ? "Edit Entry" : "New Entry"}</h2>
                {error && <div className="error">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Key (Path)</label>
                        <input
                            type="text"
                            value={key}
                            onChange={e => setKey(e.target.value)}
                            required
                        />
                        <small>Use slashes for folders (e.g. docs/notes.txt)</small>
                    </div>

                    <div className="form-group">
                        <label>Type</label>
                        <select value={type} onChange={e => setType(e.target.value)}>
                            <option value="text/plain">Text</option>
                            <option value="application/json">JSON</option>
                            <option value="application/octet-stream">File/Blob</option>
                            <option value="image/png">Image (PNG)</option>
                            <option value="image/jpeg">Image (JPEG)</option>
                        </select>
                    </div>

                    {(type === "text/plain" || type === "application/json") && (
                        <div className="form-group">
                            <label>Content</label>
                            <textarea
                                value={stringValue}
                                onChange={e => setStringValue(e.target.value)}
                                rows={10}
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Metadata (JSON)</label>
                        <textarea
                            value={metadata}
                            onChange={e => setMetadata(e.target.value)}
                            rows={4}
                            placeholder='{"tags": ["important"], "version": 1}'
                        />
                    </div>

                    <div className="form-group">
                        <label>File Upload {entry && "(Overwrites existing content)"}</label>
                        <input
                            type="file"
                            onChange={e => {
                                if (e.target.files?.[0]) {
                                    setFile(e.target.files[0]);
                                    // Auto-set type if new
                                    if (!entry) {
                                        setType(e.target.files[0].type || "application/octet-stream");
                                    }
                                }
                            }}
                        />
                    </div>

                    <div className="actions">
                        <button type="button" onClick={onClose} disabled={submitting}>Cancel</button>
                        <button type="submit" disabled={submitting}>Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function UploadZipModal({ collectionId, onClose, onComplete }: any) {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`/api/collections/${collectionId}/upload`, {
                method: "POST",
                body: formData
            });
            if (!res.ok) throw new Error("Upload failed");
            onComplete();
        } catch (e) {
            alert("Error uploading zip");
            setUploading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal">
                <h2>Upload ZIP to Collection</h2>
                <form onSubmit={handleUpload}>
                    <div className="form-group">
                        <label>Select ZIP File</label>
                        <input type="file" accept=".zip" onChange={e => setFile(e.target.files?.[0] || null)} required />
                    </div>
                    <div className="actions">
                        <button type="button" onClick={onClose} disabled={uploading}>Cancel</button>
                        <button type="submit" disabled={uploading || !file}>
                            {uploading ? "Uploading..." : "Upload"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
