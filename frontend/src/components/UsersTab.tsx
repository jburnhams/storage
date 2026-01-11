import { useState, useEffect } from "react";
import type { UserResponse } from "../types";

interface UsersTabProps {
  user: UserResponse;
}

export function UsersTab({ user }: UsersTabProps) {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    is_admin: false,
    profile_picture: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const resizeImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 1500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const resizedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(resizedFile);
            } else {
              reject(new Error("Canvas to Blob failed"));
            }
          },
          "image/jpeg",
          0.8
        );
      };
      img.onerror = (err) => reject(err);
    });
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/users");
      if (!res.ok) {
        throw new Error("Failed to fetch users");
      }
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingUser(null);
    setSelectedFile(null);
    setFormData({
      name: "",
      email: "",
      is_admin: false,
      profile_picture: "",
    });
    setIsModalOpen(true);
  };

  const handleEdit = (user: UserResponse) => {
    setEditingUser(user);
    setSelectedFile(null);
    setFormData({
      name: user.name,
      email: user.email,
      is_admin: user.is_admin,
      profile_picture: user.profile_picture || "",
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this user? This will delete all their sessions and data.")) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete user");
      }
      setUsers(users.filter((u) => u.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
      const method = editingUser ? "PUT" : "POST";

      let body;
      const headers: Record<string, string> = {};

      if (selectedFile) {
        const resizedFile = await resizeImage(selectedFile);
        const formDataObj = new FormData();
        formDataObj.append("name", formData.name);
        formDataObj.append("email", formData.email);
        formDataObj.append("is_admin", String(formData.is_admin));
        if (formData.profile_picture) {
          formDataObj.append("profile_picture", formData.profile_picture);
        }
        formDataObj.append("profile_pic_blob", resizedFile);
        body = formDataObj;
        // Do not set Content-Type header, let browser set it with boundary
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(formData);
      }

      const res = await fetch(url, {
        method,
        headers,
        body,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Operation failed");
      }

      const savedUser = await res.json();

      if (editingUser) {
        setUsers(users.map((u) => (u.id === savedUser.id ? savedUser : u)));
      } else {
        setUsers([savedUser, ...users]);
      }

      setIsModalOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Operation failed");
    }
  };

  if (loading) return <div>Loading users...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="users-tab">
      <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>User Management</h2>
        <button onClick={handleCreate} className="btn primary">
          Add User
        </button>
      </div>

      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th style={{ padding: '0.5rem' }}>ID</th>
            <th style={{ padding: '0.5rem' }}>User</th>
            <th style={{ padding: '0.5rem' }}>Role</th>
            <th style={{ padding: '0.5rem' }}>Joined</th>
            <th style={{ padding: '0.5rem' }}>Last Login</th>
            <th style={{ padding: '0.5rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem' }}>{u.id}</td>
              <td style={{ padding: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {u.profile_picture && (
                    <img
                      src={u.profile_picture}
                      alt=""
                      style={{ width: 24, height: 24, borderRadius: '50%' }}
                    />
                  )}
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{u.name}</div>
                    <div style={{ fontSize: '0.8em', color: '#666' }}>{u.email}</div>
                  </div>
                </div>
              </td>
              <td style={{ padding: '0.5rem' }}>
                {u.is_admin ? (
                  <span style={{ background: '#e0f2f1', color: '#00695c', padding: '2px 6px', borderRadius: 4, fontSize: '0.8em' }}>Admin</span>
                ) : (
                  <span style={{ background: '#f5f5f5', color: '#616161', padding: '2px 6px', borderRadius: 4, fontSize: '0.8em' }}>User</span>
                )}
              </td>
              <td style={{ padding: '0.5rem' }}>{new Date(u.created_at).toLocaleDateString()}</td>
              <td style={{ padding: '0.5rem' }}>
                {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
              </td>
              <td style={{ padding: '0.5rem' }}>
                <button onClick={() => handleEdit(u)} style={{ marginRight: '0.5rem' }}>Edit</button>
                <button onClick={() => handleDelete(u.id)} className="danger">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isModalOpen && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div className="modal-content" style={{
            background: 'white', padding: '2rem', borderRadius: '8px', width: '400px', maxWidth: '90%'
          }}>
            <h3>{editingUser ? 'Edit User' : 'Add User'}</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Profile Picture</label>
                <div style={{ marginBottom: '0.5rem' }}>
                   <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                   />
                </div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9em', color: '#666' }}>Or URL:</label>
                <input
                  type="text"
                  value={formData.profile_picture}
                  onChange={(e) => setFormData({ ...formData, profile_picture: e.target.value })}
                  placeholder="https://..."
                  style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_admin}
                    onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                  />
                  Is Admin
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary">{editingUser ? 'Save' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
