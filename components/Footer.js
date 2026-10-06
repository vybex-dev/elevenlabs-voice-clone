import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-brand">
          <span className="footer-icon">🎙️</span>
          <span>
            <strong>PVC Studio</strong> — Professional voice cloning
          </span>
        </div>

        <nav className="footer-links" aria-label="Footer">
          <Link href="/">Voice Studio</Link>
          <Link href="/login">Sign In</Link>
        </nav>

        <a
          className="powered-by-vybex"
          href="https://vybex-dev.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by <span className="pbv-wordmark">VYBEX</span>
        </a>
      </div>

      <style jsx>{`
        .site-footer {
          width: 100%;
          border-top: 1px solid var(--border);
          background: rgba(30, 26, 23, 0.85);
        }

        .footer-container {
          max-width: 1120px;
          margin: 0 auto;
          padding: 22px 24px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 12px 24px;
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        .footer-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-self: start;
        }

        .footer-brand strong {
          color: var(--text);
          font-family: var(--font-display);
          font-weight: 600;
        }

        .footer-links {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px 22px;
        }

        .footer-links :global(a) {
          color: var(--text-muted);
          text-decoration: none;
          white-space: nowrap;
          transition: color 0.18s ease;
        }

        .footer-links :global(a:hover) {
          color: var(--text);
        }

        .powered-by-vybex {
          --vybex-gradient: linear-gradient(
            135deg,
            oklch(0.65 0.22 295) 0%,
            oklch(0.72 0.22 340) 30%,
            oklch(0.85 0.16 200) 60%,
            oklch(0.88 0.18 130) 100%
          );
          justify-self: end;
          text-decoration: none;
          color: var(--text-muted);
          white-space: nowrap;
          transition: color 0.18s ease;
        }

        .powered-by-vybex:hover {
          color: var(--text);
        }

        .pbv-wordmark {
          font-weight: 700;
          letter-spacing: 0.01em;
          background-image: var(--vybex-gradient);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: vybex-holo-shift 8s ease-in-out infinite;
        }

        @keyframes vybex-holo-shift {
          0%,
          100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }

        @media (max-width: 720px) {
          .footer-container {
            grid-template-columns: 1fr;
            justify-items: center;
            text-align: center;
            gap: 16px;
          }
          .footer-brand,
          .powered-by-vybex {
            justify-self: center;
          }
        }
      `}</style>
    </footer>
  );
}
