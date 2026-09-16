import Link from "next/link";
import { useRouter } from "next/router";

export default function NavBar({ user }) {
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (err) {
      console.error("Logout error:", err);
      router.push("/login");
    }
  }

  return (
    <header className="navbar">
      <div className="nav-container">
        <div className="nav-brand">
          <Link href="/" className="brand-link">
            <span className="brand-icon">🎙️</span>
            <span className="brand-title">ElevenLabs PVC Studio</span>
          </Link>
        </div>

        {user && (
          <div className="nav-actions">
            <nav className="nav-links">
              <Link
                href="/"
                className={`nav-item ${router.pathname === "/" ? "active" : ""}`}
              >
                Voice Studio
              </Link>
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className={`nav-item ${router.pathname === "/admin" ? "active" : ""}`}
                >
                  Admin Portal
                </Link>
              )}
            </nav>

            <div className="user-badge">
              <span className="user-avatar">{user.username.charAt(0).toUpperCase()}</span>
              <span className="user-name">{user.username}</span>
              {user.role === "admin" && <span className="role-tag">Admin</span>}
            </div>

            <button type="button" onClick={handleLogout} className="logout-btn">
              Sign Out
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .navbar {
          width: 100%;
          background: rgba(30, 26, 23, 0.85);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .nav-container {
          max-width: 1120px;
          margin: 0 auto;
          padding: 14px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand-link {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: var(--text);
          font-family: var(--font-display);
          font-size: 1.15rem;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .brand-icon {
          font-size: 1.25rem;
        }

        .brand-title {
          background: linear-gradient(135deg, #f5efe6 30%, var(--accent) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .nav-actions {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .nav-links {
          display: flex;
          gap: 12px;
        }

        .nav-item {
          color: var(--text-muted);
          text-decoration: none;
          font-size: 0.9rem;
          padding: 6px 12px;
          border-radius: 6px;
          transition: all 0.2s ease;
        }

        .nav-item:hover {
          color: var(--text);
          background: var(--surface-alt);
        }

        .nav-item.active {
          color: var(--accent);
          background: rgba(232, 163, 61, 0.1);
          font-weight: 500;
        }

        .user-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--surface-alt);
          padding: 5px 12px 5px 6px;
          border-radius: 20px;
          border: 1px solid var(--border);
        }

        .user-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--accent);
          color: #14110f;
          font-weight: bold;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .user-name {
          font-size: 0.85rem;
          color: var(--text);
          font-weight: 500;
        }

        .role-tag {
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(232, 163, 61, 0.2);
          color: var(--accent);
          font-weight: 600;
          text-transform: uppercase;
        }

        .logout-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .logout-btn:hover {
          color: var(--danger);
          border-color: rgba(217, 105, 79, 0.4);
          background: rgba(217, 105, 79, 0.08);
        }

        @media (max-width: 640px) {
          .brand-title {
            display: none;
          }
          .nav-actions {
            gap: 10px;
          }
          .user-name {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
