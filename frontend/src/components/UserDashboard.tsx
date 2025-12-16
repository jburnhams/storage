import { useState, useEffect } from "react";
import type { UserResponse, SessionResponse } from "../types";

interface UserDashboardProps {
  user: UserResponse;
}

export function UserDashboard({ user }: UserDashboardProps) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((data) => {
        setSession(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch session:", err);
        setLoading(false);
      });
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <section className="dashboard-section">
      <h2>Your Account</h2>

      <div className="user-card">
        {user.profile_picture && (
          <img
            src={user.profile_picture}
            alt={user.name}
            className="profile-picture"
          />
        )}
        <div className="user-info">
          <h3>{user.name}</h3>
          <p className="user-email">{user.email}</p>
          {user.is_admin && <span className="admin-badge">Admin</span>}
        </div>
      </div>

      <div className="info-grid">
        <div className="info-item">
          <label>User ID</label>
          <span>{user.id}</span>
        </div>
        <div className="info-item">
          <label>Account Created</label>
          <span>{formatDate(user.created_at)}</span>
        </div>
        <div className="info-item">
          <label>Last Updated</label>
          <span>{formatDate(user.updated_at)}</span>
        </div>
        {user.last_login_at && (
          <div className="info-item">
            <label>Last Login</label>
            <span>{formatDate(user.last_login_at)}</span>
          </div>
        )}
      </div>

      {!loading && session && (
        <>
          <h3>Current Session</h3>
          <div className="info-grid">
            <div className="info-item">
              <label>Session ID</label>
              <span className="session-id">{session.id}</span>
            </div>
            <div className="info-item">
              <label>Created</label>
              <span>{formatDate(session.created_at)}</span>
            </div>
            <div className="info-item">
              <label>Expires</label>
              <span>{formatDate(session.expires_at)}</span>
            </div>
            <div className="info-item">
              <label>Last Used</label>
              <span>{formatDate(session.last_used_at)}</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
