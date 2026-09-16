import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // If already logged in, redirect to home
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) {
          router.replace("/");
        } else {
          setCheckingAuth(false);
        }
      })
      .catch(() => setCheckingAuth(false));
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Please provide both username and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid username or password.");
      }

      const redirect = router.query.redirect || "/";
      router.push(redirect);
    } catch (err) {
      setError(err.message || "Failed to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="center-screen">
        <p className="loading-text">Loading ElevenLabs Voice Studio…</p>
        <style jsx>{`
          .center-screen {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg);
          }
          .loading-text {
            color: var(--text-muted);
            font-size: 0.95rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Sign In - ElevenLabs Voice Studio</title>
      </Head>

      <main className="login-page">
        <div className="login-card">
          <div className="login-header">
            <span className="logo-icon">🎙️</span>
            <h1>Voice Studio</h1>
            <p className="sub">
              Sign in with your assigned credentials to access the Professional Voice Clone studio.
            </p>
          </div>

          {error && <div className="error-alert">{error}</div>}

          <form onSubmit={handleSubmit} className="login-form">
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin or your username"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </label>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="login-footer">
            <p>
              Accounts are managed by the administrator. Contact your admin if you need access.
            </p>
          </div>
        </div>
      </main>

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--bg);
          background-image: radial-gradient(
            circle at 50% 20%,
            rgba(232, 163, 61, 0.1),
            transparent 60%
          );
        }

        .login-card {
          width: 100%;
          max-width: 440px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 40px 32px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
        }

        .login-header {
          text-align: center;
          margin-bottom: 28px;
        }

        .logo-icon {
          font-size: 2.4rem;
          display: inline-block;
          margin-bottom: 12px;
        }

        h1 {
          font-family: var(--font-display);
          font-size: 1.8rem;
          font-weight: 500;
          color: var(--text);
          margin: 0 0 10px;
        }

        .sub {
          font-size: 0.9rem;
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0;
        }

        .error-alert {
          background: rgba(217, 105, 79, 0.15);
          border: 1px solid rgba(217, 105, 79, 0.35);
          color: #f79d86;
          padding: 12px 14px;
          border-radius: 8px;
          font-size: 0.88rem;
          margin-bottom: 20px;
          text-align: center;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 0.88rem;
          color: var(--text-muted);
        }

        .field input {
          background: var(--surface-alt);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 14px;
          color: var(--text);
          font-size: 0.95rem;
          font-family: inherit;
          transition: border-color 0.2s ease;
        }

        .field input:focus {
          border-color: var(--accent);
          outline: none;
        }

        .login-btn {
          background: var(--accent);
          color: #14110f;
          border: none;
          padding: 13px;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s ease;
          margin-top: 6px;
        }

        .login-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .login-footer {
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
          text-align: center;
        }

        .login-footer p {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin: 0;
          line-height: 1.4;
        }
      `}</style>
    </>
  );
}
