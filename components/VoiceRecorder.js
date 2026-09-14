import { useEffect, useRef, useState } from "react";

const SEGMENT_MS = 5 * 60 * 1000; // upload recorded audio in 5-minute chunks
const TARGET_SECONDS = 30 * 60; // ElevenLabs' recommended minimum for PVC
const POLL_INTERVAL_MS = 10000;

export default function VoiceRecorder() {
  const [step, setStep] = useState("setup"); // setup | collect | verify | train | done
  const [fatalError, setFatalError] = useState("");

  // setup
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [voiceId, setVoiceId] = useState(null);

  // collect
  const [mode, setMode] = useState("record");
  const [isRecording, setIsRecording] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [uploadedSeconds, setUploadedSeconds] = useState(0);
  const [segmentsUploaded, setSegmentsUploaded] = useState(0);
  const [segmentErrors, setSegmentErrors] = useState(0);
  const [micError, setMicError] = useState("");
  const [files, setFiles] = useState([]); // {id, file, duration, status, error}
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // verify
  const [captchaImage, setCaptchaImage] = useState(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaError, setCaptchaError] = useState("");
  const [vIsRecording, setVIsRecording] = useState(false);
  const [vBlob, setVBlob] = useState(null);
  const [vPreviewUrl, setVPreviewUrl] = useState(null);
  const [vSubmitting, setVSubmitting] = useState(false);
  const [vError, setVError] = useState("");

  // train
  const [trainState, setTrainState] = useState("fine_tuning");
  const [trainProgress, setTrainProgress] = useState(null);
  const [trainError, setTrainError] = useState("");

  // refs
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const timerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const currentRecorderRef = useRef(null);
  const segmentTimeoutRef = useRef(null);
  const chunksRef = useRef([]);

  const vStreamRef = useRef(null);
  const vRecorderRef = useRef(null);
  const vChunksRef = useRef([]);

  const pollRef = useRef(null);

  useEffect(() => {
    return () => {
      cleanupRecordingSession();
      cleanupVerifyStream();
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Setup step ----------
  async function handleBeginSetup(e) {
    e.preventDefault();
    if (!consent) return;
    setCreating(true);
    setFatalError("");
    try {
      const res = await fetch("/api/pvc/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `Voice ${new Date().toLocaleString()}`,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't create the voice.");
      setVoiceId(data.voiceId);
      setStep("collect");
    } catch (err) {
      setFatalError(err.message);
    } finally {
      setCreating(false);
    }
  }

  // ---------- Collect: recording ----------
  function cleanupRecordingSession() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
    }
  }

  async function startRecordingSession() {
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

      isRecordingRef.current = true;
      setIsRecording(true);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

      runSegment();
    } catch (err) {
      console.error(err);
      setMicError("Couldn't access your microphone. Check permissions and try again.");
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

  function runSegment() {
    if (!isRecordingRef.current || !streamRef.current) return;
    const recorder = new MediaRecorder(streamRef.current);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      uploadSegment(blob);
      if (isRecordingRef.current) {
        runSegment();
      } else {
        cleanupRecordingSession();
        setFinalizing(false);
      }
    };
    currentRecorderRef.current = recorder;
    recorder.start();
    segmentTimeoutRef.current = setTimeout(() => {
      if (currentRecorderRef.current && currentRecorderRef.current.state !== "inactive") {
        currentRecorderRef.current.stop();
      }
    }, SEGMENT_MS);
  }

  async function uploadSegment(blob) {
    const segmentSeconds = Math.max(1, Math.round(SEGMENT_MS / 1000));
    try {
      const form = new FormData();
      form.append("voiceId", voiceId);
      form.append("audio", blob, `segment-${Date.now()}.webm`);
      const res = await fetch("/api/pvc/samples", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSegmentsUploaded((n) => n + 1);
      setUploadedSeconds((s) => s + segmentSeconds);
    } catch (err) {
      console.error("segment upload failed:", err);
      setSegmentErrors((n) => n + 1);
    }
  }

  function stopRecordingSession() {
    isRecordingRef.current = false;
    setIsRecording(false);
    setFinalizing(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
    if (currentRecorderRef.current && currentRecorderRef.current.state !== "inactive") {
      currentRecorderRef.current.stop();
    } else {
      cleanupRecordingSession();
      setFinalizing(false);
    }
  }

  // ---------- Collect: file upload ----------
  function handleFilesSelected(e) {
    const picked = Array.from(e.target.files || []);
    const entries = picked.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
      file,
      duration: null,
      status: "pending",
      error: null,
    }));
    setFiles((prev) => [...prev, ...entries]);
    entries.forEach((entry) => {
      const audioEl = document.createElement("audio");
      audioEl.preload = "metadata";
      audioEl.onloadedmetadata = () => {
        setFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, duration: audioEl.duration } : f))
        );
        URL.revokeObjectURL(audioEl.src);
      };
      audioEl.src = URL.createObjectURL(entry.file);
    });
    e.target.value = "";
  }

  function removeFile(id) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function uploadAllFiles() {
    setUploadingFiles(true);
    for (const entry of files) {
      if (entry.status === "done") continue;
      setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, status: "uploading" } : f)));
      try {
        const form = new FormData();
        form.append("voiceId", voiceId);
        form.append("audio", entry.file, entry.file.name);
        const res = await fetch("/api/pvc/samples", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setFiles((prev) => prev.map((f) => (f.id === entry.id ? { ...f, status: "done" } : f)));
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, status: "error", error: err.message } : f))
        );
      }
    }
    setUploadingFiles(false);
  }

  const fileSecondsTotal = files.reduce((sum, f) => sum + (f.duration || 0), 0);
  const doneFileCount = files.filter((f) => f.status === "done").length;
  const collectedSeconds = mode === "record" ? uploadedSeconds : fileSecondsTotal;
  const canContinueFromCollect =
    mode === "record"
      ? !isRecording && !finalizing && segmentsUploaded > 0
      : !uploadingFiles && doneFileCount > 0 && doneFileCount === files.length;

  async function goToVerify() {
    setStep("verify");
    setCaptchaLoading(true);
    setCaptchaError("");
    try {
      const res = await fetch(`/api/pvc/captcha?voiceId=${encodeURIComponent(voiceId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load verification image.");
      setCaptchaImage(data.image);
    } catch (err) {
      setCaptchaError(err.message);
    } finally {
      setCaptchaLoading(false);
    }
  }

  // ---------- Verify step ----------
  function cleanupVerifyStream() {
    if (vStreamRef.current) vStreamRef.current.getTracks().forEach((t) => t.stop());
  }

  async function startVerifyRecording() {
    setVError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      vStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      vChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) vChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(vChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setVBlob(blob);
        setVPreviewUrl(URL.createObjectURL(blob));
        cleanupVerifyStream();
      };
      vRecorderRef.current = recorder;
      recorder.start();
      setVIsRecording(true);
    } catch (err) {
      setVError("Couldn't access your microphone. Check permissions and try again.");
    }
  }

  function stopVerifyRecording() {
    if (vRecorderRef.current && vRecorderRef.current.state !== "inactive") {
      vRecorderRef.current.stop();
    }
    setVIsRecording(false);
  }

  async function submitVerification() {
    if (!vBlob) return;
    setVSubmitting(true);
    setVError("");
    try {
      const form = new FormData();
      form.append("voiceId", voiceId);
      form.append("recording", vBlob, "captcha-recording.webm");
      const res = await fetch("/api/pvc/verify-captcha", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");
      setStep("train");
      startPolling();
    } catch (err) {
      setVError(err.message);
    } finally {
      setVSubmitting(false);
    }
  }

  // ---------- Train step ----------
  function startPolling() {
    setTrainState("fine_tuning");
    setTrainError("");
    pollRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);
    checkStatus();
  }

  async function checkStatus() {
    try {
      const res = await fetch(`/api/pvc/status?voiceId=${encodeURIComponent(voiceId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Status check failed.");
      setTrainState(data.state);
      setTrainProgress(data.progress);
      if (data.state === "fine_tuned") {
        clearInterval(pollRef.current);
        setStep("done");
      } else if (data.state === "failed") {
        clearInterval(pollRef.current);
        setTrainError("Training failed. You can try again, or contact ElevenLabs support with your Voice ID.");
      }
    } catch (err) {
      console.error(err);
    }
  }

  // ---------- Render ----------
  if (step === "done") {
    return (
      <div className="card">
        <h3>Voice is ready</h3>
        <p className="muted">Training finished — this voice is now usable like any other on your account.</p>
        <div className="voice-id">
          <span className="label">Voice ID</span>
          <code>{voiceId}</code>
        </div>
        <p className="muted small">
          There are no accounts yet, so save this ID if you&rsquo;ll need to find it again.
        </p>
        <style jsx>{cardStyles}</style>
        <style jsx>{`
          .voice-id { display:flex; align-items:center; gap:10px; background:var(--surface-alt); border:1px solid var(--border); border-radius:8px; padding:12px 14px; margin:18px 0 10px; }
          .label { font-size:0.8rem; color:var(--text-muted); }
          code { color:var(--meter); font-size:0.95rem; }
          .small { font-size:0.85rem; }
        `}</style>
      </div>
    );
  }

  if (step === "train") {
    return (
      <div className="card">
        <h3>Training your voice</h3>
        <p className="muted">
          This runs in the background and can take a while. You can keep this tab open, or note your
          Voice ID and check back later on the status page.
        </p>
        <div className="voice-id">
          <span className="label">Voice ID</span>
          <code>{voiceId}</code>
        </div>
        {trainError ? (
          <p className="error-text">{trainError}</p>
        ) : (
          <p className="muted small">
            Status: {trainState}
            {typeof trainProgress === "number" ? ` — ${Math.round(trainProgress * 100)}%` : ""}
          </p>
        )}
        <style jsx>{cardStyles}</style>
        <style jsx>{`
          .voice-id { display:flex; align-items:center; gap:10px; background:var(--surface-alt); border:1px solid var(--border); border-radius:8px; padding:12px 14px; margin:18px 0 10px; }
          .label { font-size:0.8rem; color:var(--text-muted); }
          code { color:var(--meter); font-size:0.95rem; }
          .small { font-size:0.85rem; }
        `}</style>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div className="card">
        <h3>Verify it&rsquo;s you</h3>
        <p className="muted">Read the text in the image aloud, then record yourself saying it.</p>

        {captchaLoading && <p className="muted small">Loading verification image…</p>}
        {captchaError && <p className="error-text">{captchaError}</p>}
        {captchaImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captchaImage} alt="Text to read aloud for verification" className="captcha-img" />
        )}

        {captchaImage && !vPreviewUrl && (
          <div className="recorder">
            {!vIsRecording ? (
              <button type="button" className="primary" onClick={startVerifyRecording}>
                Start recording
              </button>
            ) : (
              <button type="button" className="stop" onClick={stopVerifyRecording}>
                Stop
              </button>
            )}
          </div>
        )}

        {vPreviewUrl && (
          <div className="preview">
            <audio controls src={vPreviewUrl} />
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setVBlob(null);
                setVPreviewUrl(null);
              }}
            >
              Re-record
            </button>
          </div>
        )}

        {vError && <p className="error-text">{vError}</p>}

        {vBlob && (
          <button type="button" className="primary" disabled={vSubmitting} onClick={submitVerification}>
            {vSubmitting ? "Submitting…" : "Submit verification"}
          </button>
        )}

        <style jsx>{cardStyles}</style>
        <style jsx>{`
          .captcha-img { width: 100%; border-radius: 8px; border: 1px solid var(--border); margin: 8px 0 20px; }
        `}</style>
      </div>
    );
  }

  if (step === "collect") {
    return (
      <div className="card">
        <h3>Add your voice samples</h3>
        <p className="muted">Aim for at least 30 minutes total, in a quiet space, one speaker only.</p>

        <div className="tabs">
          <button type="button" className={mode === "record" ? "tab active" : "tab"} onClick={() => setMode("record")}>
            Record
          </button>
          <button type="button" className={mode === "upload" ? "tab active" : "tab"} onClick={() => setMode("upload")}>
            Upload
          </button>
        </div>

        <div className="progress-label">
          {formatDuration(collectedSeconds)} collected
          {collectedSeconds < TARGET_SECONDS ? ` — aim for ${formatDuration(TARGET_SECONDS)}` : " — you're good"}
        </div>
        <div className="meter static">
          <div
            className="meter-fill"
            style={{ width: `${Math.min(100, (collectedSeconds / TARGET_SECONDS) * 100)}%` }}
          />
        </div>

        {mode === "record" && (
          <div className="recorder">
            <div className="meter" style={{ "--level": level }}>
              <div className="meter-fill live" />
            </div>
            <div className="timer">{formatDuration(elapsed)}</div>
            {!isRecording && !finalizing && (
              <button type="button" className="primary" onClick={startRecordingSession}>
                {segmentsUploaded > 0 ? "Resume recording" : "Start recording"}
              </button>
            )}
            {isRecording && (
              <button type="button" className="stop" onClick={stopRecordingSession}>
                Stop
              </button>
            )}
            {finalizing && <p className="muted small">Finishing upload of last segment…</p>}
            {micError && <p className="error-text">{micError}</p>}
            {segmentErrors > 0 && (
              <p className="error-text small">
                {segmentErrors} segment{segmentErrors > 1 ? "s" : ""} failed to upload — you may want to
                record a bit more to make up for it.
              </p>
            )}
            <p className="hint">
              Long recordings upload automatically in the background every few minutes, so you can stop
              anytime without losing progress.
            </p>
          </div>
        )}

        {mode === "upload" && (
          <div className="uploader">
            <label className="dropzone">
              <input type="file" accept="audio/*,video/*" multiple onChange={handleFilesSelected} hidden />
              <span>Choose audio file(s)</span>
              <span className="hint">MP3, WAV, M4A, WEBM, or video — up to 20MB each</span>
            </label>

            {files.length > 0 && (
              <ul className="file-list">
                {files.map((f) => (
                  <li key={f.id} className={`file-row status-${f.status}`}>
                    <span className="file-name">{f.file.name}</span>
                    <span className="file-meta">
                      {f.duration ? formatDuration(Math.round(f.duration)) : "…"}
                      {" · "}
                      {f.status === "pending" && "queued"}
                      {f.status === "uploading" && "uploading…"}
                      {f.status === "done" && "uploaded"}
                      {f.status === "error" && `failed: ${f.error}`}
                    </span>
                    {f.status !== "uploading" && (
                      <button type="button" className="remove-btn" onClick={() => removeFile(f.id)}>
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {files.length > 0 && doneFileCount < files.length && (
              <button type="button" className="primary" disabled={uploadingFiles} onClick={uploadAllFiles}>
                {uploadingFiles ? "Uploading…" : "Upload files"}
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          className="primary continue-btn"
          disabled={!canContinueFromCollect}
          onClick={goToVerify}
        >
          Continue to verification
        </button>

        <style jsx>{cardStyles}</style>
        <style jsx>{`
          .progress-label { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px; }
          .meter.static { height: 8px; margin-bottom: 24px; }
          .meter.static .meter-fill { transition: width 0.3s ease; background: linear-gradient(90deg, var(--meter), var(--accent)); }
          .continue-btn { margin-top: 16px; }
          .file-list { list-style: none; padding: 0; margin: 14px 0; display: flex; flex-direction: column; gap: 8px; }
          .file-row { display: flex; align-items: center; gap: 8px; background: var(--surface-alt); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; font-size: 0.85rem; }
          .file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .file-meta { color: var(--text-muted); font-size: 0.78rem; white-space: nowrap; }
          .status-error .file-meta { color: var(--danger); }
          .remove-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.85rem; }
        `}</style>
      </div>
    );
  }

  // step === "setup"
  return (
    <form className="card" onSubmit={handleBeginSetup}>
      <h3>Create your voice clone</h3>
      <p className="muted">This uses ElevenLabs&rsquo; Professional Voice Cloning for the most accurate result.</p>

      <label className="field">
        <span>Name this voice</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My reading voice"
          maxLength={60}
        />
      </label>

      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>This is my own voice, or I have the legal right to clone the voice I&rsquo;ll provide.</span>
      </label>

      {fatalError && <p className="error-text">{fatalError}</p>}

      <button type="submit" className="primary" disabled={!consent || creating}>
        {creating ? "Setting up…" : "Get started"}
      </button>

      <style jsx>{cardStyles}</style>
    </form>
  );
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const cardStyles = `
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 32px;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
  }

  h3 {
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 1.5rem;
    margin: 0 0 6px;
  }

  .muted { color: var(--text-muted); margin: 0 0 4px; line-height: 1.5; }
  .small { font-size: 0.85rem; }

  .tabs {
    display: flex;
    gap: 4px;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px;
    margin: 16px 0;
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

  .tab.active { background: var(--accent); color: #14110f; font-weight: 500; }

  .recorder { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 12px 0 24px; }

  .meter { width: 100%; height: 10px; background: var(--surface-alt); border-radius: 999px; overflow: hidden; border: 1px solid var(--border); }
  .meter-fill { height: 100%; width: calc(var(--level, 0) * 100%); background: linear-gradient(90deg, var(--meter), var(--accent)); transition: width 0.08s linear; }
  .meter-fill.live { width: calc(var(--level) * 100%); }

  .timer { font-family: var(--font-display); font-size: 2rem; letter-spacing: 0.02em; }

  .hint { color: var(--text-muted); font-size: 0.85rem; text-align: center; margin: 4px 0 0; }

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
  button.primary:disabled { opacity: 0.45; cursor: not-allowed; }

  button.stop {
    background: var(--danger);
    color: #14110f;
    border: none;
    padding: 13px 28px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }

  .uploader { padding: 4px 0 8px; }

  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    border: 1px dashed var(--border);
    border-radius: 10px;
    padding: 28px 16px;
    cursor: pointer;
    text-align: center;
    transition: border-color 0.15s ease;
  }
  .dropzone:hover { border-color: var(--accent); }

  .preview { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
  audio { width: 100%; }

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

  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; font-size: 0.88rem; color: var(--text-muted); }
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
  .consent input { margin-top: 3px; }

  .error-text { color: var(--danger); font-size: 0.85rem; margin: 4px 0; }
`;
