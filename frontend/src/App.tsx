import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { LoginPage } from "./components/LoginPage";
import { UserDashboard } from "./components/UserDashboard";
import { AdminDashboard } from "./components/AdminDashboard";
import { BuildTimestampBadge } from "./components/BuildTimestampBadge";
import { StorageExplorer } from "./components/StorageExplorer";
import { PublicShareView } from "./components/PublicShareView";
import { CollectionsManager } from "./components/CollectionsManager";
import type { UserResponse } from "./types";

export function App() {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "collections">("dashboard");
  const location = useLocation();

  useEffect(() => {
    // If we are on a public share link, skip auth check to load faster.
    // If the user happens to be logged in, the share view doesn't strictly need that info right now.
    if (location.pathname.startsWith("/share/")) {
        setLoading(false);
        return;
    }

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
  }, [location.pathname]);

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

  // Public Routes can be accessed without user
  if (location.pathname.startsWith("/share/")) {
      return (
          <Routes>
              <Route path="/share/*" element={<PublicShareView />} />
          </Routes>
      )
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <main className="page">
      <header>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div>
                <h1>Storage Auth Service</h1>
                <p>Centralized authentication for jonathanburnhams.com subdomains</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <BuildTimestampBadge />
                <button onClick={handleLogout} className="logout-btn">
                    Logout
                </button>
            </div>
        </div>
      </header>

      {/* Navigation or Tabs? */}

      <div className="tabs" style={{ marginBottom: "1rem" }}>
          <button onClick={() => setActiveTab("dashboard")} disabled={activeTab === "dashboard"}>Explorer</button>
          <button onClick={() => setActiveTab("collections")} disabled={activeTab === "collections"}>Collections</button>
      </div>

      <Routes>
        <Route path="/" element={
            activeTab === "dashboard" ? (
                <>
                    <UserDashboard user={user} />
                    {user.is_admin && <AdminDashboard />}
                    <hr />
                    <StorageExplorer user={user} />
                </>
            ) : (
                <CollectionsManager user={user} />
            )
        } />
      </Routes>
    </main>
  );
}
