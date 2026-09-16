import { useEffect, useState } from "react";

function formatDuration(totalSeconds) {
  const s = Math.round(totalSeconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }) {
  let label = status || "Created";
  let className = "badge-created";

  if (status === "fine_tuned" || status === "ready") {
    label = "Fine-tuned / Ready";
    className = "badge-ready";
  } else if (status === "training") {
    label = "Training…";
    className = "badge-training";
  } else if (status === "verified") {
    label = "Identity Verified";
    className = "badge-verified";
  } else if (status === "samples_added") {
    label = "Samples Added";
    className = "badge-samples";
  } else if (status === "failed" || status === "training_failed") {
    label = "Failed";
    className = "badge-failed";
  } else if (status === "manual_verification_pending") {
    label = "Manual Review Pending";
    className = "badge-pending";
  }

  return <span className={`status-badge ${className}`}>{label}</span>;
}

export default function VoiceLogs({ refreshKey = 0, onSelectVoice }) {
  const [voices, setVoices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedVoiceId, setExpandedVoiceId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [checkingVoiceId, setCheckingVoiceId] = useState(null);

  async function fetchLogs() {
    try {
      setLoading(true);
      const res = await fetch("/api/logs");
      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error("Failed to load voice entry logs.");
      }
      const data = await res.json();
      setVoices(data.voices || []);
      setLogs(data.logs || []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not fetch entry logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, [refreshKey]);

  function copyVoiceId(voiceId) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(voiceId);
      setCopiedId(voiceId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  async function checkLiveStatus(voiceId) {
    try {
      setCheckingVoiceId(voiceId);
      const res = await fetch(`/api/pvc/status?voiceId=${voiceId}`);
      if (res.ok) {
        await fetchLogs();
      }
    } catch (err) {
      console.error("Error refreshing status:", err);
    } finally {
      setCheckingVoiceId(null);
    }
  }

  async function handleDeleteVoice(voiceId) {
    if (!confirm(`Are you sure you want to remove voice "${voiceId}" from your saved history?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/logs?voiceId=${voiceId}`, { method: "DELETE" });
      if (res.ok) {
        fetchLogs();
      }
    } catch (err) {
      console.error("Error deleting voice log:", err);
    }
  }

  return (
    <div className="voice-logs-container">
      <div className="logs-header">
        <div>
          <h3>Saved Voice Clones & History</h3>
          <p className="logs-subtitle">
            All your created voices, uploaded samples, and training states are persistently saved.
          </p>
        </div>
        <button type="button" onClick={fetchLogs} className="refresh-btn" title="Refresh logs">
          🔄 Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading && voices.length === 0 ? (
        <div className="loading-state">Loading your saved voices…</div>
      ) : voices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <p>No voice clones created yet.</p>
          <span className="empty-sub">Use the wizard above to create your first voice clone.</span>
        </div>
      ) : (
        <div className="voice-cards">
          {voices.map((voice) => {
            const voiceLogs = logs.filter((l) => l.voiceId === voice.voiceId);
            const isExpanded = expandedVoiceId === voice.voiceId;
            const isChecking = checkingVoiceId === voice.voiceId;

            return (
              <div key={voice.id || voice.voiceId} className="voice-card">
                <div className="card-top">
                  <div className="voice-info">
                    <div className="voice-title-row">
                      <span className="voice-name">{voice.name}</span>
                      <span className="lang-tag">{voice.language.toUpperCase()}</span>
                      <StatusBadge status={voice.status} />
                    </div>

                    <div className="voice-meta">
                      <div className="meta-item">
                        <span className="meta-label">Voice ID:</span>
                        <code className="voice-id-code">{voice.voiceId}</code>
                        <button
                          type="button"
                          onClick={() => copyVoiceId(voice.voiceId)}
                          className="copy-btn"
                          title="Copy Voice ID"
                        >
                          {copiedId === voice.voiceId ? "✓ Copied" : "Copy"}
                        </button>
                      </div>

                      <div className="meta-item">
                        <span className="meta-label">Samples:</span>
                        <span>{voice.sampleCount || 0} takes</span>
                        {voice.totalDurationSecs > 0 && (
                          <span className="duration-pill">
                            ({formatDuration(voice.totalDurationSecs)})
                          </span>
                        )}
                      </div>

                      <div className="meta-item date-item">
                        <span>Created {formatDate(voice.createdAt)}</span>
                      </div>
                    </div>

                    {voice.description && (
                      <p className="voice-desc">{voice.description}</p>
                    )}
                  </div>

                  <div className="card-actions">
                    {voice.status === "training" && (
                      <button
                        type="button"
                        onClick={() => checkLiveStatus(voice.voiceId)}
                        disabled={isChecking}
                        className="action-btn check-btn"
                      >
                        {isChecking ? "Checking…" : "Poll Status"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedVoiceId(isExpanded ? null : voice.voiceId)
                      }
                      className="action-btn toggle-btn"
                    >
                      {isExpanded ? "Hide Logs ▲" : `View Logs (${voiceLogs.length}) ▼`}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteVoice(voice.voiceId)}
                      className="delete-btn"
                      title="Remove from history"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="timeline-container">
                    <h4>Activity & Event Timeline</h4>
                    {voiceLogs.length === 0 ? (
                      <p className="no-logs">No detailed event logs for this voice.</p>
                    ) : (
                      <ul className="timeline-list">
                        {voiceLogs.map((log) => (
                          <li key={log.id} className="timeline-item">
                            <span className="timeline-dot" />
                            <div className="timeline-content">
                              <div className="timeline-header">
                                <span className="timeline-event">{log.event.replace(/_/g, " ")}</span>
                                <span className="timeline-time">{formatDate(log.timestamp)}</span>
                              </div>
                              <p className="timeline-msg">{log.message}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .voice-logs-container {
          width: 100%;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 28px;
          margin-top: 32px;
        }

        .logs-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
          gap: 16px;
        }

        h3 {
          font-family: var(--font-display);
          font-size: 1.35rem;
          font-weight: 500;
          margin: 0 0 6px;
          color: var(--text);
        }

        .logs-subtitle {
          color: var(--text-muted);
          font-size: 0.88rem;
          margin: 0;
          line-height: 1.4;
        }

        .refresh-btn {
          background: var(--surface-alt);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .refresh-btn:hover {
          background: var(--border);
        }

        .error-box {
          background: rgba(217, 105, 79, 0.12);
          border: 1px solid rgba(217, 105, 79, 0.3);
          color: var(--danger);
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-size: 0.88rem;
        }

        .loading-state,
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-muted);
        }

        .empty-icon {
          font-size: 2.2rem;
          margin-bottom: 12px;
        }

        .empty-state p {
          font-size: 1.05rem;
          font-weight: 500;
          color: var(--text);
          margin: 0 0 4px;
        }

        .empty-sub {
          font-size: 0.85rem;
        }

        .voice-cards {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .voice-card {
          background: var(--surface-alt);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 20px;
          transition: border-color 0.2s ease;
        }

        .voice-card:hover {
          border-color: rgba(232, 163, 61, 0.3);
        }

        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }

        .voice-info {
          flex: 1;
          min-width: 280px;
        }

        .voice-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .voice-name {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text);
        }

        .lang-tag {
          font-size: 0.72rem;
          padding: 2px 7px;
          background: rgba(245, 239, 230, 0.08);
          border-radius: 4px;
          color: var(--text-muted);
          font-weight: 600;
        }

        :global(.status-badge) {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 999px;
          display: inline-block;
        }

        :global(.badge-ready) {
          background: rgba(111, 168, 138, 0.2);
          color: #8ed3ad;
          border: 1px solid rgba(111, 168, 138, 0.3);
        }

        :global(.badge-training) {
          background: rgba(232, 163, 61, 0.2);
          color: var(--accent);
          border: 1px solid rgba(232, 163, 61, 0.3);
        }

        :global(.badge-verified) {
          background: rgba(66, 153, 225, 0.2);
          color: #76b7f3;
          border: 1px solid rgba(66, 153, 225, 0.3);
        }

        :global(.badge-samples),
        :global(.badge-created) {
          background: rgba(245, 239, 230, 0.08);
          color: var(--text-muted);
          border: 1px solid var(--border);
        }

        :global(.badge-failed) {
          background: rgba(217, 105, 79, 0.2);
          color: #e58771;
          border: 1px solid rgba(217, 105, 79, 0.3);
        }

        :global(.badge-pending) {
          background: rgba(246, 173, 85, 0.2);
          color: #f6ad55;
          border: 1px solid rgba(246, 173, 85, 0.3);
        }

        .voice-meta {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .meta-label {
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .voice-id-code {
          background: rgba(0, 0, 0, 0.3);
          padding: 2px 6px;
          border-radius: 4px;
          color: var(--accent);
          font-family: monospace;
          font-size: 0.82rem;
        }

        .copy-btn {
          background: none;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.72rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .copy-btn:hover {
          color: var(--text);
          border-color: var(--accent);
        }

        .duration-pill {
          color: var(--accent);
        }

        .date-item {
          font-size: 0.78rem;
          color: #7b7165;
        }

        .voice-desc {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin: 8px 0 0;
          line-height: 1.4;
        }

        .card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .action-btn {
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-btn:hover {
          background: var(--border);
        }

        .check-btn {
          border-color: rgba(232, 163, 61, 0.4);
          color: var(--accent);
        }

        .delete-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 0.95rem;
          cursor: pointer;
          padding: 6px 8px;
          border-radius: 4px;
          transition: all 0.2s ease;
        }

        .delete-btn:hover {
          color: var(--danger);
          background: rgba(217, 105, 79, 0.1);
        }

        .timeline-container {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px dashed var(--border);
        }

        .timeline-container h4 {
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          margin: 0 0 12px;
        }

        .no-logs {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin: 0;
        }

        .timeline-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .timeline-item {
          display: flex;
          gap: 12px;
          position: relative;
        }

        .timeline-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          margin-top: 5px;
          flex-shrink: 0;
        }

        .timeline-content {
          flex: 1;
        }

        .timeline-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .timeline-event {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text);
          text-transform: capitalize;
        }

        .timeline-time {
          font-size: 0.75rem;
          color: #7b7165;
        }

        .timeline-msg {
          font-size: 0.82rem;
          color: var(--text-muted);
          margin: 2px 0 0;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
