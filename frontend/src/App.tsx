import { useState, useEffect } from "react";
import { LoginPage } from "./components/LoginPage";
import { UserDashboard } from "./components/UserDashboard";
import { AdminDashboard } from "./components/AdminDashboard";
import { BuildTimestampBadge } from "./components/BuildTimestampBadge";
import type { UserResponse } from "./types";

export function App() {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // Check if user is authenticated
    fetch("/api/user")
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        return null;
      })
      .then((data) => {
        if (data) {
          setUser(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch user:", err);
        setLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/auth/logout", { method: "POST" });
      setUser(null);
      window.location.href = "/";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  if (loading) {
    return (
      <main className="page">
        <div className="loading">Loading...</div>
      </main>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <main className="page">
      <header>
        <h1>Storage Auth Service</h1>
        <p>Centralized authentication for jonathanburnhams.com subdomains</p>
        <button onClick={handleLogout} className="logout-btn">
          Logout
        </button>
      </header>

      <UserDashboard user={user} />

      {user.is_admin && <AdminDashboard />}

      <footer className="build-info">
        <BuildTimestampBadge timestamp="__BUILD_TIMESTAMP__" />
      </footer>
    </main>
  );
}
