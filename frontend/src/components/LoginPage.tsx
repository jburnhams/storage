import { useState } from "react";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = () => {
    window.location.href = "/auth/login";
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Login failed");
      }

      const data = await res.json();
      if (data.redirect) {
          window.location.href = data.redirect;
      } else {
          // Reload to pick up session
          window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <header>
        <h1>Storage Auth Service</h1>
        <p>Centralized authentication for jonathanburnhams.com subdomains</p>
      </header>

      <section className="login-section">
        <h2>Welcome</h2>
        <p>Please sign in to continue.</p>

        <form onSubmit={handlePasswordLogin} className="login-form" style={{ marginBottom: '2rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '0.8rem', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>
          {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
          <button type="submit" className="primary" disabled={loading} style={{ width: '100%', padding: '0.8rem' }}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <span style={{ color: '#666' }}>- OR -</span>
        </div>

        <button onClick={handleGoogleLogin} className="login-btn" style={{ width: '100%' }}>
          Sign in with Google
        </button>
      </section>

      <section className="info-section">
        <h3>About This Service</h3>
        <p>
          This is a centralized authentication service that provides secure
          login for all subdomains under jonathanburnhams.com and
          jburnhams.workers.dev.
        </p>
        <ul>
          <li>Single sign-on across all subdomains</li>
          <li>Secure session management</li>
          <li>7-day session duration</li>
          <li>Google OAuth authentication</li>
        </ul>
      </section>
    </main>
  );
}
