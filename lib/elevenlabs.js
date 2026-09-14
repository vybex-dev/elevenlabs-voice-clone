// Server-side helpers for the ElevenLabs Professional Voice Clone (PVC) API.
// Every function here runs only inside our Edge API routes — never in the
// browser — so ELEVENLABS_API_KEY is never exposed to the client.
//
// PVC is a multi-step flow, unlike Instant Voice Cloning's single call:
//   1. create()          -> creates an empty PVC voice, returns voice_id
//   2. addSample()        -> attaches one audio file to that voice (call once
//                          per file/segment, so we never send huge payloads
//                          in a single request)
//   3. getCaptcha()      -> fetches a CAPTCHA image the voice owner must
//                          read aloud, to prove they consent to the clone
//   4. verifyCaptcha()   -> submits a recording of them reading it
//   5. train()           -> starts the (slow) training job
//   6. getStatus()       -> polls training progress
//
// Docs: https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/professional-voice-cloning

const BASE_URL = "https://api.elevenlabs.io/v1";

// Model used for training and for reading back training status. Keep this
// the same value in both places.
export const PVC_MODEL_ID = "eleven_multilingual_v2";

function requireApiKey() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set on the server.");
  }
  return apiKey;
}

async function elevenFetch(path, options = {}) {
  const apiKey = requireApiKey();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "xi-api-key": apiKey,
      ...(options.headers || {}),
    },
  });
  return res;
}

/** Step 1: create an empty PVC voice. Returns { voiceId }. */
export async function createPvcVoice({ name, language = "en", description }) {
  const res = await elevenFetch("/voices/pvc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, language, description }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs create voice failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return { voiceId: data.voice_id };
}

/** Step 2: attach one audio sample to a voice. Call once per file/segment. */
export async function addPvcSample({ voiceId, audioBlob, filename }) {
  const form = new FormData();
  form.append("files", audioBlob, filename || "sample.webm");

  const res = await elevenFetch(`/voices/pvc/${voiceId}/samples`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs add sample failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/**
 * Step 3: fetch the verification CAPTCHA image.
 *
 * NOTE ON UNCERTAINTY: ElevenLabs' public docs show the official SDK
 * returning a base64 string that gets base64-decoded into PNG bytes, but
 * they don't document the raw HTTP response shape (JSON-wrapped base64 vs.
 * a raw image body vs. a plain base64 text body). This function handles all
 * three so the app doesn't silently break if the real shape differs from
 * what's assumed here — but this step is worth testing for real before
 * relying on it, since it's the one part of the flow not fully pinned down
 * by the docs.
 */
export async function getPvcCaptcha({ voiceId }) {
  const res = await elevenFetch(`/voices/pvc/${voiceId}/captcha`, {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs get captcha failed (${res.status}): ${await res.text()}`);
  }

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const data = await res.json();
    const base64 =
      data.captcha_image || data.image || data.image_base64 || data.captcha || null;
    if (!base64) {
      throw new Error(
        `Unexpected captcha JSON shape from ElevenLabs: ${JSON.stringify(data)}`
      );
    }
    return { dataUrl: `data:image/png;base64,${stripDataUrlPrefix(base64)}` };
  }

  if (contentType.startsWith("image/")) {
    const buf = await res.arrayBuffer();
    return { dataUrl: `data:${contentType};base64,${arrayBufferToBase64(buf)}` };
  }

  // Fallback: treat body as plain text, which is either already a base64
  // string or something we can't interpret — pass it through either way so
  // failures are visible instead of silent.
  const text = await res.text();
  return { dataUrl: `data:image/png;base64,${stripDataUrlPrefix(text.trim())}` };
}

function stripDataUrlPrefix(value) {
  const marker = "base64,";
  const idx = value.indexOf(marker);
  return idx === -1 ? value : value.slice(idx + marker.length);
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Step 4: submit a recording of the voice owner reading the CAPTCHA aloud. */
export async function verifyPvcCaptcha({ voiceId, recordingBlob }) {
  const form = new FormData();
  form.append("recording", recordingBlob, "captcha-recording.webm");

  const res = await elevenFetch(`/voices/pvc/${voiceId}/captcha`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs captcha verification failed (${res.status}): ${await res.text()}`);
  }
  return res.json().catch(() => ({}));
}

/** Step 5: kick off training. This just starts the job; it does not wait. */
export async function trainPvcVoice({ voiceId }) {
  const res = await elevenFetch(`/voices/pvc/${voiceId}/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: PVC_MODEL_ID }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs train request failed (${res.status}): ${await res.text()}`);
  }
  return res.json().catch(() => ({}));
}

/** Step 6: poll training status for a voice. */
export async function getPvcStatus({ voiceId }) {
  const res = await elevenFetch(`/voices/${voiceId}`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`ElevenLabs get voice failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const state = data?.fine_tuning?.state?.[PVC_MODEL_ID] || "not_started";
  const progress = data?.fine_tuning?.progress?.[PVC_MODEL_ID] ?? null;
  return { state, progress, name: data?.name || null };
}
