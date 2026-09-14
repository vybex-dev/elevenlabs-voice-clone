import { useEffect, useRef, useState } from "react";

const MAX_RECORD_SECONDS = 120;

export default function VoiceRecorder() {
  const [mode, setMode] = useState("record"); // "record" | "upload"
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [voiceName, setVoiceName] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [resultVoiceId, setResultVoiceId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [micError, setMicError] = useState("");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => cleanupMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function cleanupMedia() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
    }
  }

  async function startRecording() {
    setMicError("");
    resetResult();
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
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setAudioBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORD_SECONDS) {
            stopRecording();
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    cleanupMedia();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    resetResult();
    setAudioBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function resetResult() {
    setStatus("idle");
    setErrorMsg("");
    setResultVoiceId(null);
  }

  function clearSample() {
    setAudioBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    resetResult();
  }

  function switchMode(next) {
    if (isRecording) stopRecording();
    clearSample();
    setMode(next);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!audioBlob || !consent) return;

    setStatus("submitting");
    setErrorMsg("");

    try {
      const form = new FormData();
      form.append("audio", audioBlob, "sample.webm");
      form.append("name", voiceName.trim() || `Voice ${new Date().toLocaleString()}`);
      form.append("consent", "true");

      const res = await fetch("/api/clone-voice", {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      setResultVoiceId(data.voiceId);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  function startOver() {
    clearSample();
    setVoiceName("");
    setConsent(false);
  }

  const canSubmit = !!audioBlob && consent && status !== "submitting";
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  if (status === "success") {
    return (
      <div className="card success">
        <h3>Voice cloned</h3>
        <p className="muted">
          Your sample was processed and a new voice was created.
        </p>
        <div className="voice-id">
          <span className="label">Voice ID</span>
          <code>{resultVoiceId}</code>
        </div>
        <p className="muted small">
          Save this ID somewhere safe — right now there are no accounts, so this
          confirmation is the only record of it.
        </p>
        <button className="secondary" onClick={startOver}>
          Clone another voice
        </button>
        <style jsx>{cardStyles}</style>
        <style jsx>{`
          .voice-id {
            display: flex;
            align-items: center;
            gap: 10px;
            background: var(--surface-alt);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px 14px;
            margin: 18px 0 10px;
          }
          .label {
            font-size: 0.8rem;
            color: var(--text-muted);
          }
          code {
            color: var(--meter);
            font-size: 0.95rem;
          }
          .small {
            font-size: 0.85rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div className="tabs">
        <button
          type="button"
          className={mode === "record" ? "tab active" : "tab"}
          onClick={() => switchMode("record")}
        >
          Record
        </button>
        <button
          type="button"
          className={mode === "upload" ? "tab active" : "tab"}
          onClick={() => switchMode("upload")}
        >
          Upload
        </button>
      </div>

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
          <p className="hint">Read a sentence or two aloud, clearly, with minimal background noise.</p>
        </div>
      )}

      {mode === "upload" && !previewUrl && (
        <div className="uploader">
          <label className="dropzone">
            <input type="file" accept="audio/*" onChange={handleFileChange} hidden />
            <span>Choose an audio file</span>
            <span className="hint">MP3, WAV, M4A, or WEBM — up to 25MB</span>
          </label>
        </div>
      )}

      {previewUrl && (
        <div className="preview">
          <audio controls src={previewUrl} />
          <button type="button" className="link-btn" onClick={clearSample}>
            Remove and start over
          </button>
        </div>
      )}

      {audioBlob && (
        <>
          <label className="field">
            <span>Name this voice (optional)</span>
            <input
              type="text"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              placeholder="e.g. My reading voice"
              maxLength={60}
            />
          </label>

          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              This is my own voice, or I have the legal right to clone the voice
              in this recording.
            </span>
          </label>

          {status === "error" && <p className="error-text">{errorMsg}</p>}

          <button type="submit" className="primary" disabled={!canSubmit}>
            {status === "submitting" ? "Cloning voice…" : "Clone this voice"}
          </button>
        </>
      )}

      <style jsx>{cardStyles}</style>
    </form>
  );
}

const cardStyles = `
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 32px;
    width: 100%;
    max-width: 460px;
    display: flex;
    flex-direction: column;
  }

  h3 {
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 1.5rem;
    margin: 0 0 6px;
  }

  .muted {
    color: var(--text-muted);
    margin: 0 0 4px;
    line-height: 1.5;
  }

  .tabs {
    display: flex;
    gap: 4px;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px;
    margin-bottom: 24px;
  }

  .tab {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-muted);
    padding: 9px 0;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.92rem;
    transition: background 0.15s ease, color 0.15s ease;
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
    gap: 16px;
    padding: 12px 0 24px;
  }

  .meter {
    width: 100%;
    height: 10px;
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
    font-size: 2rem;
    letter-spacing: 0.02em;
  }

  .hint {
    color: var(--text-muted);
    font-size: 0.85rem;
    text-align: center;
    margin: 4px 0 0;
  }

  button.primary {
    background: var(--accent);
    color: #14110f;
    border: none;
    padding: 13px 20px;
    border-radius: 8px;
    font-size: 0.98rem;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
  }

  button.primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  button.stop {
    background: var(--danger);
    color: #14110f;
    border: none;
    padding: 13px 28px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }

  button.secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    padding: 12px 20px;
    border-radius: 8px;
    cursor: pointer;
    margin-top: 6px;
  }

  .uploader {
    padding: 4px 0 20px;
  }

  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    border: 1px dashed var(--border);
    border-radius: 10px;
    padding: 32px 16px;
    cursor: pointer;
    text-align: center;
    transition: border-color 0.15s ease;
  }

  .dropzone:hover {
    border-color: var(--accent);
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
  }

  audio {
    width: 100%;
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
    font-size: 0.85rem;
    align-self: flex-start;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 18px;
    font-size: 0.88rem;
    color: var(--text-muted);
  }

  .field input {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 11px 12px;
    color: var(--text);
    font-size: 0.95rem;
  }

  .consent {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 20px;
    line-height: 1.4;
    cursor: pointer;
  }

  .consent input {
    margin-top: 3px;
  }

  .error-text {
    color: var(--danger);
    font-size: 0.85rem;
    margin: -4px 0 14px;
  }
`;
