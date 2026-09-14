import { useState } from "react";
import Head from "next/head";
import Link from "next/link";

export default function StatusPage() {
  const [voiceId, setVoiceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function checkStatus(e) {
    e.preventDefault();
    if (!voiceId.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/pvc/status?voiceId=${encodeURIComponent(voiceId.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't check status.");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Check voice status</title>
      </Head>
      <main>
        <Link href="/" className="back">
          ← Back
        </Link>
        <h1>Check your voice</h1>
        <p className="muted">Paste the Voice ID you were given after submitting your samples.</p>

        <form onSubmit={checkStatus}>
          <input
            type="text"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            placeholder="Voice ID"
          />
          <button type="submit" disabled={loading || !voiceId.trim()}>
            {loading ? "Checking…" : "Check status"}
          </button>
        </form>

        {error && <p className="error-text">{error}</p>}

        {result && (
          <div className="result">
            <p>
              <span className="label">Voice</span> {result.name || "—"}
            </p>
            <p>
              <span className="label">Status</span> {formatState(result.state)}
            </p>
            {typeof result.progress === "number" && (
              <p>
                <span className="label">Progress</span> {Math.round(result.progress * 100)}%
              </p>
            )}
          </div>
        )}

        <style jsx>{`
          main {
            max-width: 480px;
            margin: 0 auto;
            padding: 72px 24px;
          }
          .back {
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.85rem;
          }
          h1 {
            font-family: var(--font-display);
            font-weight: 500;
            font-size: 2rem;
            margin: 20px 0 8px;
          }
          .muted {
            color: var(--text-muted);
            margin: 0 0 28px;
          }
          form {
            display: flex;
            gap: 8px;
          }
          input {
            flex: 1;
            background: var(--surface-alt);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 11px 12px;
            color: var(--text);
            font-size: 0.95rem;
          }
          button {
            background: var(--accent);
            color: #14110f;
            border: none;
            padding: 11px 18px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
          }
          button:disabled {
            opacity: 0.45;
            cursor: not-allowed;
          }
          .error-text {
            color: var(--danger);
            font-size: 0.85rem;
            margin-top: 14px;
          }
          .result {
            margin-top: 28px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 18px 20px;
          }
          .result p {
            margin: 6px 0;
          }
          .label {
            color: var(--text-muted);
            display: inline-block;
            width: 90px;
          }
        `}</style>
      </main>
    </>
  );
}

function formatState(state) {
  const map = {
    not_started: "Not started",
    fine_tuning: "Training in progress",
    fine_tuned: "Ready",
    failed: "Failed",
  };
  return map[state] || state;
}
