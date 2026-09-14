import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 4000;

/**
 * Opt-in cleanup step for one sample: kicks off ElevenLabs' speaker
 * separation, polls until it's done, then lets the person listen to each
 * detected speaker and pick which one is actually them. Only rendered when
 * the person clicks "Detect speakers / clean up audio" on a sample — most
 * clean, single-voice recordings will never need this.
 */
export default function SpeakerReview({ voiceId, sampleId, onResolved }) {
  const [status, setStatus] = useState("starting"); // starting | pending | completed | failed
  const [speakers, setSpeakers] = useState([]);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    start();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    try {
      await fetch("/api/pvc/separate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, sampleId }),
      });
      setStatus("pending");
      poll();
    } catch (err) {
      setError(err.message || "Couldn't start speaker detection.");
      setStatus("failed");
    }
  }

  async function poll() {
    try {
      const res = await fetch(`/api/pvc/speakers?voiceId=${voiceId}&sampleId=${sampleId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't check speaker detection status.");

      if (data.status === "completed") {
        setStatus("completed");
        setSpeakers(data.speakers || []);
        if (data.speakers?.length === 1) {
          // Only one voice found — nothing to choose, auto-resolve.
          selectSpeaker(data.speakers[0].speakerId, true);
        }
      } else if (data.status === "failed") {
        setStatus("failed");
        setError("Speaker detection failed for this sample.");
      } else {
        pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    } catch (err) {
      setError(err.message || "Couldn't check speaker detection status.");
      setStatus("failed");
    }
  }

  async function loadPreview(speakerId) {
    if (previewUrls[speakerId]) return;
    try {
      const res = await fetch(
        `/api/pvc/speaker-audio?voiceId=${voiceId}&sampleId=${sampleId}&speakerId=${speakerId}`
      );
      const data = await res.json();
      if (res.ok) {
        setPreviewUrls((prev) => ({ ...prev, [speakerId]: data.dataUri }));
      }
    } catch {
      // Preview is a nice-to-have; silently ignore failures.
    }
  }

  async function selectSpeaker(speakerId, auto = false) {
    setSelectedSpeakerId(speakerId);
    try {
      await fetch("/api/pvc/select-speaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, sampleId, speakerId }),
      });
      onResolved(speakerId, { auto });
    } catch (err) {
      setError(err.message || "Couldn't save that selection.");
    }
  }

  return (
    <div className="review">
      {(status === "starting" || status === "pending") && (
        <p className="hint">Detecting speakers in this sample…</p>
      )}

      {status === "failed" && <p className="error-text">{error}</p>}

      {status === "completed" && speakers.length > 1 && !selectedSpeakerId && (
        <div className="speakers">
          <p className="hint">More than one voice was detected. Which one is you?</p>
          {speakers.map((speaker) => (
            <div key={speaker.speakerId} className="speaker-row">
              <button
                type="button"
                className="preview-btn"
                onClick={() => loadPreview(speaker.speakerId)}
              >
                {previewUrls[speaker.speakerId] ? (
                  <audio controls src={previewUrls[speaker.speakerId]} />
                ) : (
                  `Preview (${Math.round(speaker.durationSecs || 0)}s)`
                )}
              </button>
              <button
                type="button"
                className="primary small"
                onClick={() => selectSpeaker(speaker.speakerId)}
              >
                This is me
              </button>
            </div>
          ))}
        </div>
      )}

      {status === "completed" && selectedSpeakerId && (
        <p className="hint success">Speaker selected — this sample is ready.</p>
      )}

      <style jsx>{`
        .review {
          border-top: 1px dashed var(--border);
          margin-top: 12px;
          padding-top: 12px;
        }

        .hint {
          color: var(--text-muted);
          font-size: 0.82rem;
          margin: 0 0 8px;
        }

        .hint.success {
          color: var(--meter);
        }

        .error-text {
          color: var(--danger);
          font-size: 0.82rem;
          margin: 0;
        }

        .speakers {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .speaker-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: var(--surface-alt);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 10px;
        }

        .preview-btn {
          background: none;
          border: none;
          color: var(--text);
          cursor: pointer;
          font-size: 0.85rem;
          padding: 0;
          flex: 1;
          text-align: left;
        }

        audio {
          height: 32px;
          width: 100%;
        }

        button.primary.small {
          background: var(--accent);
          color: #14110f;
          border: none;
          padding: 7px 12px;
          border-radius: 6px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
