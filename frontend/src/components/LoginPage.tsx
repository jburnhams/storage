export function LoginPage() {
  const handleLogin = () => {
    window.location.href = "/auth/login";
  };

  return (
    <main className="page">
      <header>
        <h1>Storage Auth Service</h1>
        <p>Centralized authentication for jonathanburnhams.com subdomains</p>
      </header>

      <section className="login-section">
        <h2>Welcome</h2>
        <p>Please sign in with your Google account to continue.</p>
        <button onClick={handleLogin} className="login-btn">
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
