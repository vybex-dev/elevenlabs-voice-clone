import { useEffect, useRef, useState } from "react";
import AudioCapture from "./AudioCapture";
import SpeakerReview from "./pvc/SpeakerReview";

const STEPS = ["details", "samples", "verify", "train", "done"];

// ElevenLabs' product guide says PVC "requires at least 30 minutes of clean
// audio" — that's not a hard limit this app enforces (ElevenLabs' API itself
// doesn't reject short uploads), just guidance surfaced in the UI. Per your
// call, the *recommended* target shown here is bumped up to 2 hours, since
// more (clean) audio generally produces a noticeably better clone.
const RECOMMENDED_SECONDS = 2 * 60 * 60;

const LANGUAGES = [
  ["en", "English"],
  ["ja", "Japanese"],
  ["zh", "Chinese"],
  ["de", "German"],
  ["hi", "Hindi"],
  ["fr", "French"],
  ["ko", "Korean"],
  ["pt", "Portuguese"],
  ["it", "Italian"],
  ["es", "Spanish"],
  ["id", "Indonesian"],
  ["nl", "Dutch"],
  ["tr", "Turkish"],
  ["pl", "Polish"],
  ["sv", "Swedish"],
  ["ro", "Romanian"],
  ["ar", "Arabic"],
  ["cs", "Czech"],
  ["el", "Greek"],
  ["fi", "Finnish"],
  ["da", "Danish"],
  ["uk", "Ukrainian"],
  ["ru", "Russian"],
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDuration(totalSeconds) {
  const s = Math.round(totalSeconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export default function PvcWizard({ onVoiceUpdated }) {
  const [step, setStep] = useState("details");
  const [error, setError] = useState("");

  // Step 1: details
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [voiceId, setVoiceId] = useState(null);

  // Step 2: samples
  const [samples, setSamples] = useState([]); // see shape notes below

  // Step 3: verification
  const [captchaDataUri, setCaptchaDataUri] = useState(null);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyAttempts, setVerifyAttempts] = useState(0);
  const [showManualVerification, setShowManualVerification] = useState(false);
  const [manualExtraText, setManualExtraText] = useState("");
  const [manualFiles, setManualFiles] = useState([]);
  const [manualSubmitted, setManualSubmitted] = useState(false);
  const [manualVerificationUnavailable, setManualVerificationUnavailable] =
    useState(false);

  // Step 4: training
  const [modelId] = useState("eleven_multilingual_v2");
  const [training, setTraining] = useState(false);
  const [trainState, setTrainState] = useState(null); // not_started | training | fine_tuned | failed
  const [trainProgress, setTrainProgress] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      samples.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Step 1: create the voice -------------------------------------------
  async function handleCreateVoice(e) {
    e.preventDefault();
    setError("");
    if (!consent) return;
    setCreating(true);
    try {
      const res = await fetch("/api/pvc/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `Voice ${new Date().toLocaleString()}`,
          language,
          description: description.trim(),
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't create the voice.");
      setVoiceId(data.voiceId);
      setStep("samples");
      onVoiceUpdated?.();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  // ---- Step 2: samples -----------------------------------------------------
  async function handleNewSample(blob, elapsedSecs) {
    const localId = uid();
    const previewUrl = URL.createObjectURL(blob);
    setSamples((prev) => [
      ...prev,
      {
        localId,
        previewUrl,
        durationSecs: elapsedSecs || null,
        uploadStatus: "uploading",
        sampleId: null,
        showCleanup: false,
        speakerResolved: false,
        error: null,
      },
    ]);

    try {
      const form = new FormData();
      form.append("voiceId", voiceId);
      form.append("audio", blob, `sample-${localId}.webm`);
      const res = await fetch("/api/pvc/samples", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      const uploaded = data.samples?.[0];
      setSamples((prev) =>
        prev.map((s) =>
          s.localId === localId
            ? {
                ...s,
                uploadStatus: "uploaded",
                sampleId: uploaded?.sampleId,
                durationSecs: uploaded?.durationSecs ?? s.durationSecs,
              }
            : s,
        ),
      );
      onVoiceUpdated?.();
    } catch (err) {
      setSamples((prev) =>
        prev.map((s) =>
          s.localId === localId
            ? { ...s, uploadStatus: "error", error: err.message }
            : s,
        ),
      );
    }
  }

  function removeSample(localId) {
    setSamples((prev) => {
      const target = prev.find((s) => s.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.localId !== localId);
    });
    // Note: this only removes the sample from view; ElevenLabs also exposes
    // DELETE /v1/voices/pvc/{voice_id}/samples/{sample_id} if you want a
    // "remove sample" API route wired up too — omitted here for scope.
  }

  function toggleCleanup(localId) {
    setSamples((prev) =>
      prev.map((s) =>
        s.localId === localId ? { ...s, showCleanup: !s.showCleanup } : s,
      ),
    );
  }

  function markSpeakerResolved(localId) {
    setSamples((prev) =>
      prev.map((s) =>
        s.localId === localId ? { ...s, speakerResolved: true } : s,
      ),
    );
  }

  const totalSeconds = samples.reduce(
    (sum, s) => sum + (s.durationSecs || 0),
    0,
  );
  const uploadedCount = samples.filter(
    (s) => s.uploadStatus === "uploaded",
  ).length;
  const stillUploading = samples.some((s) => s.uploadStatus === "uploading");
  const canProceedFromSamples = uploadedCount > 0 && !stillUploading;

  // ---- Step 3: verification -------------------------------------------------
  async function loadCaptcha() {
    setError("");
    setCaptchaLoading(true);
    try {
      const res = await fetch(`/api/pvc/captcha?voiceId=${voiceId}`);
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Couldn't load the verification image.");
      setCaptchaDataUri(data.dataUri);
    } catch (err) {
      setError(err.message || "Something went wrong loading verification.");
    } finally {
      setCaptchaLoading(false);
    }
  }

  function enterVerifyStep() {
    setStep("verify");
    loadCaptcha();
  }

  async function submitCaptchaRecording(blob) {
    setError("");
    setVerifying(true);
    try {
      const form = new FormData();
      form.append("voiceId", voiceId);
      form.append("recording", blob, "captcha-recording.webm");
      const res = await fetch("/api/pvc/captcha", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");
      setVerified(true);
      onVoiceUpdated?.();
    } catch (err) {
      setVerifyAttempts((n) => n + 1);
      setError(
        err.message ||
          "That recording didn't verify. Make sure you read all the lines clearly, then try again.",
      );
      loadCaptcha(); // captchas are typically single-use — fetch a fresh one
    } finally {
      setVerifying(false);
    }
  }

  async function submitManualVerification(e) {
    e.preventDefault();
    setError("");
    if (manualFiles.length === 0) {
      setError("Attach at least one supporting file for manual review.");
      return;
    }
    try {
      const form = new FormData();
      form.append("voiceId", voiceId);
      form.append("extraText", manualExtraText);
      manualFiles.forEach((f) => form.append("files", f));
      const res = await fetch("/api/pvc/manual-verification", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Couldn't submit manual verification.");
      setManualSubmitted(true);
      onVoiceUpdated?.();
    } catch (err) {
      const message =
        err.message || "Something went wrong submitting manual verification.";
      // This is a workspace-level restriction, not something a retry fixes —
      // stop offering the form once we've seen it, rather than letting
      // someone burn attempts against a path that will 403 every time.
      if (message.includes("manual_verification_not_enabled")) {
        setManualVerificationUnavailable(true);
        setShowManualVerification(false);
      } else {
        setError(message);
      }
    }
  }

  // ---- Step 4: training ------------------------------------------------------
  async function startTraining() {
    setError("");
    setTraining(true);
    try {
      const res = await fetch("/api/pvc/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId, modelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start training.");
      setStep("train");
      onVoiceUpdated?.();
      pollTrainingStatus();
    } catch (err) {
      setError(err.message || "Something went wrong starting training.");
      setTraining(false);
    }
  }

  async function pollTrainingStatus() {
    try {
      const res = await fetch(`/api/pvc/status?voiceId=${voiceId}`);
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Couldn't check training status.");
      setTrainState(data.state);
      setTrainProgress(data.progress);
      if (data.state === "fine_tuned") {
        setTraining(false);
        setStep("done");
        onVoiceUpdated?.();
        return;
      }
      if (data.state === "failed") {
        setTraining(false);
        setError("Training failed. You can try starting training again.");
        onVoiceUpdated?.();
        return;
      }
      pollRef.current = setTimeout(pollTrainingStatus, 5000);
    } catch (err) {
      setError(err.message || "Something went wrong checking training status.");
      setTraining(false);
    }
  }

  function startOver() {
    samples.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
    setStep("details");
    setError("");
    setName("");
    setLanguage("en");
    setDescription("");
    setConsent(false);
    setVoiceId(null);
    setSamples([]);
    setCaptchaDataUri(null);
    setVerified(false);
    setVerifyAttempts(0);
    setShowManualVerification(false);
    setManualSubmitted(false);
    setManualVerificationUnavailable(false);
    setTrainState(null);
    setTrainProgress(null);
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="card">
      {step !== "done" && (
        <div className="progress-trail">
          {STEPS.slice(0, 4).map((s, i) => (
            <div key={s} className={`dot ${i <= stepIndex ? "filled" : ""}`} />
          ))}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {step === "details" && (
        <form onSubmit={handleCreateVoice}>
          <h3>Create your Professional Voice Clone</h3>
          <p className="muted">
            Start with a name and the language you'll be recording in. You'll
            add audio samples next.
          </p>

          <label className="field">
            <span>Voice name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My professional voice"
              maxLength={100}
            />
          </label>

          <label className="field">
            <span>Language of your samples</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Description (optional)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of this voice"
              maxLength={500}
            />
          </label>

          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              This is my own voice, or I have the legal right to create a
              professional clone of the voice I'll be uploading.
            </span>
          </label>

          <button
            type="submit"
            className="primary"
            disabled={!consent || creating}
          >
            {creating ? "Creating voice…" : "Continue"}
          </button>
        </form>
      )}

      {step === "samples" && (
        <div>
          <h3>Add audio samples</h3>
          <p className="muted">
            Record as many takes as you like, or upload existing recordings. For
            best results, We recommends aiming for around{" "}
            <strong>2 hours</strong> of clean, varied audio in total — more
            (clean) audio generally means a better clone. There's no hard
            minimum here, but a few minutes alone won't get great results.
          </p>

          <div className="total-bar">
            <div
              className="total-bar-fill"
              style={{
                width: `${Math.min(100, (totalSeconds / RECOMMENDED_SECONDS) * 100)}%`,
              }}
            />
          </div>
          <p className="hint">
            {formatDuration(totalSeconds)} collected · recommended target{" "}
            {formatDuration(RECOMMENDED_SECONDS)}
          </p>

          <AudioCapture
            onCapture={handleNewSample}
            maxSeconds={1800}
            autoSegmentSeconds={90}
            instructions="Read naturally, in a quiet room. Keep going for as long as you like (up to 30 minutes) — it uploads automatically in the background every minute or so."
            confirmLabel="Add this sample"
          />

          {samples.length > 0 && (
            <ul className="sample-list">
              {samples.map((s) => (
                <li key={s.localId} className="sample-item">
                  <div className="sample-row">
                    <audio controls src={s.previewUrl} />
                    <div className="sample-meta">
                      {s.uploadStatus === "uploading" && (
                        <span className="tag pending">Uploading…</span>
                      )}
                      {s.uploadStatus === "uploaded" && (
                        <span className="tag ok">
                          {s.durationSecs
                            ? formatDuration(s.durationSecs)
                            : "Uploaded"}
                        </span>
                      )}
                      {s.uploadStatus === "error" && (
                        <span className="tag err">Upload failed</span>
                      )}
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => removeSample(s.localId)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {s.uploadStatus === "uploaded" && !s.speakerResolved && (
                    <>
                      {!s.showCleanup ? (
                        <button
                          type="button"
                          className="link-btn cleanup-toggle"
                          onClick={() => toggleCleanup(s.localId)}
                        >
                          Background noise or more than one voice in this clip?
                          Detect speakers →
                        </button>
                      ) : (
                        <SpeakerReview
                          voiceId={voiceId}
                          sampleId={s.sampleId}
                          onResolved={() => markSpeakerResolved(s.localId)}
                        />
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="primary"
            disabled={!canProceedFromSamples}
            onClick={enterVerifyStep}
          >
            Continue to verification
          </button>
        </div>
      )}

      {step === "verify" && !manualSubmitted && (
        <div>
          <h3>Verify it's you</h3>
          <p className="muted">
            Before training, we needs to confirm you have permission to use this
            voice by matching your voice against the samples you uploaded. You
            get <strong>about 10 seconds</strong> — have the image loaded and
            read out loud the moment you hit record, in the same kind of
            voice/setup as your samples.
          </p>

          {captchaLoading && (
            <p className="hint">Loading verification image…</p>
          )}
          {captchaDataUri && !verified && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={captchaDataUri}
              alt="Text to read aloud for verification"
              className="captcha-image"
            />
          )}

          {!verified && !showManualVerification && (
            <>
              <AudioCapture
                allowUpload={false}
                countdownSeconds={10}
                instructions="Start speaking the instant you hit record — recording auto-stops at 10 seconds."
                confirmLabel={
                  verifying ? "Verifying…" : "Submit for verification"
                }
                onCapture={submitCaptchaRecording}
              />
              {verifyAttempts >= 2 && !manualVerificationUnavailable && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setShowManualVerification(true)}
                >
                  Having trouble? Request manual verification instead
                </button>
              )}
              {manualVerificationUnavailable && (
                <p className="hint">
                  Manual verification isn't enabled for this the workspace, so
                  retrying the 10-second CAPTCHA above is the only path right
                  now. If it keeps failing, wait a bit and try again with the
                  same mic/setup you used for your samples, or contact admin.
                </p>
              )}
            </>
          )}

          {verified && (
            <>
              <p className="hint success">
                Verified! You're ready to train the voice.
              </p>
              <button
                type="button"
                className="primary"
                onClick={startTraining}
                disabled={training}
              >
                Start training
              </button>
            </>
          )}

          {showManualVerification && !verified && (
            <form className="manual-form" onSubmit={submitManualVerification}>
              <p className="hint">
                Manual verification is reviewed by admin directly and can take
                longer than the automatic check. Attach supporting documents
                (e.g. photo ID) — exactly what's needed can vary, so contact us
                for support if you're unsure.
              </p>
              <label className="field">
                <span>Supporting files</span>
                <input
                  type="file"
                  multiple
                  onChange={(e) =>
                    setManualFiles(Array.from(e.target.files || []))
                  }
                />
              </label>
              <label className="field">
                <span>Notes for the reviewer (optional)</span>
                <input
                  type="text"
                  value={manualExtraText}
                  onChange={(e) => setManualExtraText(e.target.value)}
                  placeholder="Anything that helps confirm this is your voice"
                />
              </label>
              <button type="submit" className="primary">
                Submit for manual review
              </button>
            </form>
          )}
        </div>
      )}

      {step === "verify" && manualSubmitted && (
        <div>
          <h3>Manual verification requested</h3>
          <p className="muted">We will review your submission directly.</p>
        </div>
      )}

      {step === "train" && (
        <div>
          <h3>Training your voice</h3>
          <p className="muted">
            This can take a while depending on how much audio you provided. Feel
            free to leave this open in the background.
          </p>
          <div className="total-bar">
            <div
              className="total-bar-fill"
              style={{
                width: `${trainProgress != null ? Math.round(trainProgress * 100) : 8}%`,
              }}
            />
          </div>
          <p className="hint">
            Status: {trainState || "starting"}
            {trainProgress != null
              ? ` · ${Math.round(trainProgress * 100)}%`
              : ""}
          </p>
          {trainState === "failed" && (
            <button type="button" className="primary" onClick={startTraining}>
              Try training again
            </button>
          )}
        </div>
      )}

      {step === "done" && (
        <div className="success">
          <h3>Voice cloned</h3>
          <p className="muted">
            Training finished — your professional voice clone is ready to use.
          </p>
          <div className="voice-id">
            <span className="label">Voice ID</span>
            <code>{voiceId}</code>
          </div>
          <p className="muted small">
            Save this ID somewhere safe — right now there are no accounts, so
            this confirmation is the only record of it.
          </p>
          <button className="secondary" onClick={startOver}>
            Clone another voice
          </button>
        </div>
      )}

      <style jsx>{cardStyles}</style>
    </div>
  );
}

const cardStyles = `
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 32px;
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
  }

  .progress-trail {
    display: flex;
    gap: 6px;
    margin-bottom: 20px;
  }

  .dot {
    height: 5px;
    flex: 1;
    border-radius: 999px;
    background: var(--surface-alt);
    border: 1px solid var(--border);
  }

  .dot.filled {
    background: var(--accent);
    border-color: var(--accent);
  }

  h3 {
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 1.4rem;
    margin: 0 0 8px;
  }

  .muted {
    color: var(--text-muted);
    margin: 0 0 16px;
    line-height: 1.5;
    font-size: 0.92rem;
  }

  .muted.small {
    font-size: 0.85rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
    font-size: 0.88rem;
    color: var(--text-muted);
  }

  .field input,
  .field select {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 11px 12px;
    color: var(--text);
    font-size: 0.95rem;
    font-family: inherit;
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

  button.secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    padding: 12px 20px;
    border-radius: 8px;
    cursor: pointer;
    margin-top: 6px;
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
    margin: 0 0 14px;
  }

  .hint {
    color: var(--text-muted);
    font-size: 0.82rem;
    margin: 0 0 16px;
  }

  .hint.success {
    color: var(--meter);
  }

  .total-bar {
    width: 100%;
    height: 8px;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 999px;
    overflow: hidden;
    margin-bottom: 6px;
  }

  .total-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--meter), var(--accent));
    transition: width 0.3s ease;
  }

  .sample-list {
    list-style: none;
    padding: 0;
    margin: 18px 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .sample-item {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
  }

  .sample-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  audio {
    flex: 1;
    height: 34px;
  }

  .sample-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
  }

  .tag {
    font-size: 0.75rem;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
  }

  .tag.ok {
    color: var(--meter);
    border-color: var(--meter);
  }

  .tag.pending {
    color: var(--text-muted);
  }

  .tag.err {
    color: var(--danger);
    border-color: var(--danger);
  }

  .cleanup-toggle {
    display: block;
    margin-top: 10px;
    font-size: 0.8rem;
  }

  .captcha-image {
    width: 100%;
    border-radius: 8px;
    border: 1px solid var(--border);
    margin-bottom: 16px;
    background: #fff;
  }

  .manual-form {
    display: flex;
    flex-direction: column;
    margin-top: 8px;
  }

  .voice-id {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    margin: 4px 0 10px;
  }

  .voice-id .label {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .voice-id code {
    color: var(--meter);
    font-size: 0.95rem;
  }
`;
