import { useState, useEffect } from "react";
import type { UserResponse, SessionResponse } from "../types";
import { formatDate } from "../utils/date";

export function AdminDashboard() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoting, setPromoting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Fetch all users and sessions in parallel
    Promise.all([
      fetch("/api/users").then((res) => res.json()),
      fetch("/api/sessions").then((res) => res.json()),
    ])
      .then(([usersData, sessionsData]) => {
        setUsers(usersData);
        setSessions(sessionsData);
        setLoadingUsers(false);
        setLoadingSessions(false);
      })
      .catch((err) => {
        console.error("Failed to fetch data:", err);
        setLoadingUsers(false);
        setLoadingSessions(false);
      });
  }, []);

  const handlePromoteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoting(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: promoteEmail }),
      });

      if (response.ok) {
        setMessage("User promoted to admin successfully!");
        setPromoteEmail("");
        // Refresh users list
        const usersResponse = await fetch("/api/users");
        const usersData = await usersResponse.json();
        setUsers(usersData);
      } else {
        const error = await response.json();
        setMessage(`Error: ${error.message || "Failed to promote user"}`);
      }
    } catch (err) {
      setMessage(`Error: ${String(err)}`);
    } finally {
      setPromoting(false);
    }
  };

  return (
    <section className="admin-section">
      <h2>Admin Dashboard</h2>

      <div className="admin-panel">
        <h3>Promote User to Admin</h3>
        <form onSubmit={handlePromoteAdmin} className="promote-form">
          <input
            type="email"
            placeholder="user@example.com"
            value={promoteEmail}
            onChange={(e) => setPromoteEmail(e.target.value)}
            required
            disabled={promoting}
          />
          <button type="submit" disabled={promoting}>
            {promoting ? "Promoting..." : "Promote to Admin"}
          </button>
        </form>
        {message && (
          <div className={message.startsWith("Error") ? "error-message" : "success-message"}>
            {message}
          </div>
        )}
      </div>

      <div className="admin-panel">
        <h3>All Users ({users.length})</h3>
        {loadingUsers ? (
          <p>Loading users...</p>
        ) : (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Admin</th>
                  <th>Created</th>
                  <th>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>
                      <div className="user-name-cell">
                        {user.profile_picture && (
                          <img
                            src={user.profile_picture}
                            alt={user.name}
                            className="table-avatar"
                          />
                        )}
                        {user.name}
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.user_type === "ADMIN" ? "✓" : "—"}</td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>
                      {user.last_login_at
                        ? formatDate(user.last_login_at)
                        : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-panel">
        <h3>Active Sessions ({sessions.length})</h3>
        {loadingSessions ? (
          <p>Loading sessions...</p>
        ) : (
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>User</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Last Used</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="session-id-cell">{session.id.substring(0, 16)}...</td>
                    <td>
                      {session.user ? (
                        <div className="user-name-cell">
                          {session.user.profile_picture && (
                            <img
                              src={session.user.profile_picture}
                              alt={session.user.name}
                              className="table-avatar"
                            />
                          )}
                          {session.user.name}
                        </div>
                      ) : (
                        `User #${session.user_id}`
                      )}
                    </td>
                    <td>{formatDate(session.created_at)}</td>
                    <td>{formatDate(session.expires_at)}</td>
                    <td>{formatDate(session.last_used_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
