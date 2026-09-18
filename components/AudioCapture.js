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
  // When set, this is a hard, short time box (e.g. ElevenLabs' 10-second PVC
  // captcha window): recording auto-stops at this many seconds, the timer
  // counts DOWN instead of up, and turns urgent-looking near the end. Leave
  // unset for normal, long-form sample recording.
  countdownSeconds = null,
  // When set, a single continuous recording is silently split into
  // back-to-back chunks of roughly this many seconds each, and every chunk
  // is uploaded (via onCapture) as soon as it's ready instead of waiting for
  // the whole take to finish. This exists because our upload API runs as a
  // Vercel serverless function, which hard-caps request bodies at 4.5MB
  // (platform limit, not something we can raise from app code) — a 30-minute
  // take can easily be 10-30MB+, so long single-blob uploads 413 with
  // FUNCTION_PAYLOAD_TOO_LARGE. Chunking keeps every individual upload small
  // while letting the person just talk for as long as they want. Leave unset
  // to keep the old "record → preview → confirm" single-blob flow (fine for
  // short, bounded recordings like the captcha).
  autoSegmentSeconds = null,
  // When true, confirm() waits for onCapture's promise to settle before
  // clearing the preview/blob, instead of resetting immediately. Off by
  // default so long-form sample recording keeps its "start the next take
  // immediately while this one uploads in the background" behavior. Turn it
  // on for one-shot recordings (like the PVC captcha) where confirmLabel is
  // meant to show live in-flight feedback (e.g. "Verifying…") — with the
  // default behavior that label can never actually be seen, since the
  // preview (and the button showing it) unmounts the instant onCapture is
  // called, before its result is known.
  awaitCapture = false,
}) {
  const [mode, setMode] = useState("record"); // "record" | "upload"
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [micError, setMicError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);

  // Auto-segmentation bookkeeping (only used when autoSegmentSeconds is set)
  const sessionActiveRef = useRef(false);
  const elapsedRef = useRef(0);
  const segmentStartElapsedRef = useRef(0);

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

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

  // Starts (or restarts, for the next auto-segment) a MediaRecorder on the
  // given stream. In auto-segment mode, onstop uploads the finished chunk
  // immediately and — if the overall session is still active — kicks off
  // the next chunk right away, so recording continues with only a brief gap.
  function beginSegment(stream) {
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const recordedBlob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];

      if (autoSegmentSeconds) {
        if (recordedBlob.size > 0) {
          const segDuration = Math.max(
            1,
            elapsedRef.current - segmentStartElapsedRef.current,
          );
          onCapture(recordedBlob, segDuration);
        }
        if (sessionActiveRef.current) {
          segmentStartElapsedRef.current = elapsedRef.current;
          beginSegment(stream);
        }
      } else {
        setBlob(recordedBlob);
        setPreviewUrl(URL.createObjectURL(recordedBlob));
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
  }

  // Ends just the current chunk (auto-segment mode); beginSegment's onstop
  // handler seamlessly starts the next one since the session is still active.
  function rotateSegment() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
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

      sessionActiveRef.current = true;
      segmentStartElapsedRef.current = 0;
      beginSegment(stream);

      setIsRecording(true);
      setElapsed(0);

      const hardLimit = countdownSeconds || maxSeconds;
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= hardLimit) {
            stopRecording();
            return next;
          }
          if (
            autoSegmentSeconds &&
            !countdownSeconds &&
            next - segmentStartElapsedRef.current >= autoSegmentSeconds
          ) {
            rotateSegment();
          }
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
    sessionActiveRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    cleanupMedia();
  }

  // Files picked here go up as a single request (they're not re-encoded, so
  // we can't safely auto-segment them the way live recordings are chunked).
  // Vercel's serverless functions hard-cap request bodies at 4.5MB, so warn
  // before the person hits an opaque upload failure.
  const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // a little under the 4.5MB platform cap

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setMicError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — files over ~4MB fail to upload. Trim it to a shorter clip, or use "Record" instead, which uploads in small chunks automatically.`
      );
      e.target.value = "";
      return;
    }
    setMicError("");
    setBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setElapsed(0);
  }

  async function confirm() {
    if (!blob || submitting) return;
    if (!awaitCapture) {
      // Fire-and-forget: reset right away so the next take can start while
      // this one uploads in the background.
      onCapture(blob, elapsed || undefined);
      discard();
      return;
    }
    // Keep the preview (and confirmLabel) on screen for the whole request,
    // so an in-flight label like "Verifying…" is actually visible instead of
    // vanishing the instant this is clicked.
    setSubmitting(true);
    try {
      await onCapture(blob, elapsed || undefined);
    } finally {
      setSubmitting(false);
      discard();
    }
  }

  const displaySeconds = countdownSeconds != null ? Math.max(0, countdownSeconds - elapsed) : elapsed;
  const minutes = String(Math.floor(displaySeconds / 60)).padStart(2, "0");
  const seconds = String(displaySeconds % 60).padStart(2, "0");
  const isUrgent = countdownSeconds != null && displaySeconds <= 4;

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
          <div className={isUrgent ? "timer urgent" : "timer"}>
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
            <button
              type="button"
              className="link-btn"
              onClick={discard}
              disabled={submitting}
            >
              Discard
            </button>
            <button
              type="button"
              className="primary small"
              onClick={confirm}
              disabled={submitting}
            >
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

        .timer.urgent {
          color: var(--danger);
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
