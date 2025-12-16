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
  created_at: string;
  updated_at: string;
}

interface Props {
    user: UserResponse;
}

export function StorageExplorer({ user }: Props) {
    const [entries, setEntries] = useState<KeyValueEntryResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPrefix, setSelectedPrefix] = useState<string>("");
    const [search, setSearch] = useState("");
    const [searchInFolder, setSearchInFolder] = useState(false);

    // For Create/Edit Modal
    const [editingEntry, setEditingEntry] = useState<KeyValueEntryResponse | null>(null); // Null = creating new
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchEntries = () => {
        setLoading(true);
        // We fetch all or fetch by prefix?
        // For the tree to work, we kind of need all keys to build the structure, or we lazy load.
        // Given D1 is fast and we might not have millions of files yet, fetching all keys (metadata) is okay.
        // The API supports listing all.

        // However, if we want to filter by search immediately:
        // Ideally we fetch all to build the client-side tree, and filter client-side for smoother UX,
        // unless the dataset is huge.
        // Let's fetch all (filtered by user access on backend).

        let url = "/api/storage/entries";
        // If we were using server-side filtering only:
        // const params = new URLSearchParams();
        // if (selectedPrefix) params.set("prefix", selectedPrefix);
        // if (search) params.set("search", search);
        // url += "?" + params.toString();

        fetch(url)
            .then(res => res.json())
            .then(data => {
                setEntries(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchEntries();
    }, []);

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

        // 1. Filter by Folder (Prefix) if selected
        // If selectedPrefix is "", show everything? Or show root files?
        // Usually explorer shows content of selected folder.
        // If nothing selected, show root.

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

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure?")) return;
        try {
            const res = await fetch(`/api/storage/entry/${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchEntries();
            } else {
                alert("Failed to delete");
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="storage-explorer">
            <div className="sidebar">
                <h3>Explorer</h3>
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
                <div className="toolbar">
                    <button onClick={() => { setEditingEntry(null); setIsModalOpen(true); }}>
                        + New Entry
                    </button>
                    <div className="search-box">
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
                            Within current folder
                        </label>
                    </div>
                </div>

                <div className="entry-list">
                    {loading ? <p>Loading...</p> : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Key/Name</th>
                                    <th>Type</th>
                                    <th>Modified</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEntries.map(entry => (
                                    <tr key={entry.id}>
                                        <td title={entry.key}>
                                            {/* Show relative name if in folder view */}
                                            {search ? entry.key : entry.key.split("/").pop()}
                                        </td>
                                        <td>{entry.type}</td>
                                        <td>{new Date(entry.updated_at).toLocaleString()}</td>
                                        <td>
                                            <button onClick={() => { setEditingEntry(entry); setIsModalOpen(true); }}>Edit</button>
                                            <button onClick={() => handleDelete(entry.id)}>Delete</button>
                                            <button onClick={() => {
                                                const link = `${window.location.origin}/share/${entry.key}?secret=${entry.secret}`;
                                                navigator.clipboard.writeText(link);
                                                alert("Link copied!");
                                            }}>Share</button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredEntries.length === 0 && (
                                    <tr><td colSpan={4}>No entries found</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <EntryModal
                    entry={editingEntry}
                    onClose={() => setIsModalOpen(false)}
                    onSave={() => { setIsModalOpen(false); fetchEntries(); }}
                    currentPath={selectedPrefix}
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

function EntryModal({ entry, onClose, onSave, currentPath }: any) {
    const [key, setKey] = useState(entry ? entry.key : (currentPath ? `${currentPath}/` : ""));
    const [type, setType] = useState(entry ? entry.type : "text/plain");
    const [stringValue, setStringValue] = useState(entry ? entry.string_value || "" : "");
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

        const formData = new FormData();
        formData.append("type", type);
        // Rename support: send key even for updates
        formData.append("key", key);

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
