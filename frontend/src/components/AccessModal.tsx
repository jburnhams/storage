import { useState, useEffect } from "react";
import { StorageAccess, AccessLevel } from "../types";

interface Props {
  type: 'collection' | 'entry';
  id: number;
  onClose: () => void;
  resourceName?: string;
}

export function AccessModal({ type, id, onClose, resourceName }: Props) {
  const [accessList, setAccessList] = useState<StorageAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New user form
  const [newUserId, setNewUserId] = useState("");
  const [newLevel, setNewLevel] = useState<AccessLevel>("READONLY");
  const [adding, setAdding] = useState(false);

  const fetchAccess = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/access/${type}/${id}`);
      if (!res.ok) {
          if (res.status === 403) throw new Error("You do not have permission to manage access.");
          throw new Error("Failed to load access list");
      }
      const data = await res.json();
      setAccessList(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccess();
  }, [type, id]);

  const handleGrant = async () => {
    if (!newUserId) return;
    setAdding(true);
    setError("");

    try {
      const res = await fetch(`/api/access/${type}/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: parseInt(newUserId, 10),
          access_level: newLevel
        })
      });

      if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Failed to grant access");
      }

      setNewUserId("");
      fetchAccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (userId: number, level: AccessLevel) => {
      try {
          const res = await fetch(`/api/access/${type}/${id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  user_id: userId,
                  access_level: level
              })
          });
          if (!res.ok) throw new Error("Failed to update");
          fetchAccess();
      } catch (e) {
          alert("Update failed");
      }
  };

  const handleRevoke = async (userId: number) => {
    if (!confirm("Revoke access for this user?")) return;
    try {
      const res = await fetch(`/api/access/${type}/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId })
      });
      if (!res.ok) throw new Error("Failed to revoke");
      fetchAccess();
    } catch (e) {
      alert("Revoke failed");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2>Manage Access {resourceName ? `- ${resourceName}` : ""}</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2em', cursor: 'pointer' }}>✕</button>
        </div>

        {error && <div className="error" style={{ marginBottom: '10px' }}>{error}</div>}

        <div className="access-list" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px', border: '1px solid #ddd', padding: '10px' }}>
            {loading ? <p>Loading...</p> : (
                <table style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{textAlign: 'left'}}>User</th>
                            <th style={{textAlign: 'left'}}>Level</th>
                            <th style={{textAlign: 'right'}}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {accessList.map(access => (
                            <tr key={access.user_id}>
                                <td>
                                    {access.user_avatar && <img src={access.user_avatar} alt="avatar" style={{width: 20, height: 20, borderRadius: '50%', marginRight: 5, verticalAlign: 'middle'}} />}
                                    {access.user_name} ({access.user_email || `ID: ${access.user_id}`})
                                </td>
                                <td>
                                    <select
                                        value={access.access_level}
                                        onChange={(e) => handleUpdate(access.user_id, e.target.value as AccessLevel)}
                                    >
                                        <option value="READONLY">Read Only</option>
                                        <option value="READWRITE">Read Write</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                </td>
                                <td style={{textAlign: 'right'}}>
                                    <button onClick={() => handleRevoke(access.user_id)} style={{ backgroundColor: '#e74c3c', padding: '2px 8px', fontSize: '0.8em' }}>Revoke</button>
                                </td>
                            </tr>
                        ))}
                        {accessList.length === 0 && <tr><td colSpan={3} style={{textAlign: 'center', color: '#777'}}>No users granted access.</td></tr>}
                    </tbody>
                </table>
            )}
        </div>

        <div className="add-user-form" style={{ background: '#f9f9f9', padding: '15px', borderRadius: '4px' }}>
            <h4>Grant Access</h4>
            <div style={{ display: 'flex', gap: '10px' }}>
                <input
                    type="number"
                    placeholder="User ID"
                    value={newUserId}
                    onChange={e => setNewUserId(e.target.value)}
                    style={{ flex: 1 }}
                />
                <select
                    value={newLevel}
                    onChange={(e) => setNewLevel(e.target.value as AccessLevel)}
                >
                    <option value="READONLY">Read Only</option>
                    <option value="READWRITE">Read Write</option>
                    <option value="ADMIN">Admin</option>
                </select>
                <button onClick={handleGrant} disabled={adding || !newUserId}>Add</button>
            </div>
        </div>
      </div>
    </div>
  );
}
