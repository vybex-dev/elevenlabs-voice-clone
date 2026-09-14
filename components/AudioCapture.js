import { useEffect, useRef, useState } from "react";

/**
 * A self-contained "record or upload one audio clip" widget.
 *
 * It manages its own recording/preview state. When the person confirms a
 * clip with "Use this recording", it calls onCapture(blob, durationSecs) and
 * resets itself so it's immediately ready to capture another one — this is
 * what lets the PVC sample step be "record take after take" rather than
 * one-and-done.
 */
export default function AudioCapture({
  onCapture,
  allowUpload = true,
  maxSeconds = 1800, // 30 min per take by default
  accept = "audio/*",
  instructions = "Read a few sentences aloud, clearly, with minimal background noise.",
  confirmLabel = "Use this recording",
}) {
  const [mode, setMode] = useState("record"); // "record" | "upload"
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [micError, setMicError] = useState("");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => cleanupMedia(), []);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function cleanupMedia() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
    }
  }

  async function startRecording() {
    setMicError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      tickLevel();

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const recordedBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setBlob(recordedBlob);
        setPreviewUrl(URL.createObjectURL(recordedBlob));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= maxSeconds) stopRecording();
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error(err);
      setMicError(
        "Couldn't access your microphone. Check your browser's mic permission and try again."
      );
    }
  }

  function tickLevel() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    setLevel(Math.min(1, avg / 130));
    rafRef.current = requestAnimationFrame(tickLevel);
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    cleanupMedia();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setElapsed(0);
  }

  function confirm() {
    if (!blob) return;
    onCapture(blob, elapsed || undefined);
    discard();
  }

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="capture">
      {allowUpload && !previewUrl && (
        <div className="tabs">
          <button
            type="button"
            className={mode === "record" ? "tab active" : "tab"}
            onClick={() => setMode("record")}
          >
            Record
          </button>
          <button
            type="button"
            className={mode === "upload" ? "tab active" : "tab"}
            onClick={() => setMode("upload")}
          >
            Upload
          </button>
        </div>
      )}

      {mode === "record" && !previewUrl && (
        <div className="recorder">
          <div className="meter" style={{ "--level": level }}>
            <div className="meter-fill" />
          </div>
          <div className="timer">
            {minutes}:{seconds}
          </div>
          {!isRecording ? (
            <button type="button" className="primary" onClick={startRecording}>
              Start recording
            </button>
          ) : (
            <button type="button" className="stop" onClick={stopRecording}>
              Stop
            </button>
          )}
          {micError && <p className="error-text">{micError}</p>}
          <p className="hint">{instructions}</p>
        </div>
      )}

      {mode === "upload" && !previewUrl && (
        <div className="uploader">
          <label className="dropzone">
            <input type="file" accept={accept} onChange={handleFileChange} hidden />
            <span>Choose an audio file</span>
            <span className="hint">MP3, WAV, M4A, or WEBM</span>
          </label>
        </div>
      )}

      {previewUrl && (
        <div className="preview">
          <audio controls src={previewUrl} />
          <div className="preview-actions">
            <button type="button" className="link-btn" onClick={discard}>
              Discard
            </button>
            <button type="button" className="primary small" onClick={confirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .capture {
          display: flex;
          flex-direction: column;
        }

        .tabs {
          display: flex;
          gap: 4px;
          background: var(--surface-alt);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 4px;
          margin-bottom: 16px;
        }

        .tab {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 8px 0;
          border-radius: 999px;
          cursor: pointer;
          font-size: 0.88rem;
        }

        .tab.active {
          background: var(--accent);
          color: #14110f;
          font-weight: 500;
        }

        .recorder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 8px 0 4px;
        }

        .meter {
          width: 100%;
          height: 8px;
          background: var(--surface-alt);
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid var(--border);
        }

        .meter-fill {
          height: 100%;
          width: calc(var(--level) * 100%);
          background: linear-gradient(90deg, var(--meter), var(--accent));
          transition: width 0.08s linear;
        }

        .timer {
          font-family: var(--font-display);
          font-size: 1.6rem;
          letter-spacing: 0.02em;
        }

        .hint {
          color: var(--text-muted);
          font-size: 0.82rem;
          text-align: center;
          margin: 0;
        }

        button.primary {
          background: var(--accent);
          color: #14110f;
          border: none;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
        }

        button.primary.small {
          width: auto;
          padding: 9px 16px;
          font-size: 0.88rem;
        }

        button.stop {
          background: var(--danger);
          color: #14110f;
          border: none;
          padding: 12px 26px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        }

        .uploader {
          padding: 4px 0;
        }

        .dropzone {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          border: 1px dashed var(--border);
          border-radius: 10px;
          padding: 26px 16px;
          cursor: pointer;
          text-align: center;
        }

        .dropzone:hover {
          border-color: var(--accent);
        }

        .preview {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        audio {
          width: 100%;
        }

        .preview-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .link-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          text-decoration: underline;
          cursor: pointer;
          padding: 0;
          font-size: 0.85rem;
        }

        .error-text {
          color: var(--danger);
          font-size: 0.85rem;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
