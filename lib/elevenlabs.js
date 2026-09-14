// Thin wrapper around ElevenLabs' Professional Voice Clone (PVC) API.
//
// PVC is a multi-step, stateful process on ElevenLabs' side (create -> upload
// samples -> optional speaker separation -> identity verification -> train),
// spread across many small endpoints. Every function here maps to exactly one
// ElevenLabs endpoint so the API routes (and the wizard driving them) can
// compose these calls into whatever order/flow they need.
//
// Reference: https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/professional-voice-cloning
// Endpoint list: https://elevenlabs.io/docs/api-reference/voices/pvc/create (and siblings)
//
// A couple of these endpoints have documentation that's ambiguous or
// (per a still-open elevenlabs-js SDK issue) inconsistent about whether they
// return raw binary or a base64 string. Where that's the case it's called out
// in a comment, with defensive handling so the app doesn't break outright if
// ElevenLabs' actual behavior differs slightly from the docs.

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

function getApiKey() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set on the server.");
  }
  return apiKey;
}

async function elevenFetch(path, options = {}) {
  const apiKey = getApiKey();
  const response = await fetch(`${ELEVENLABS_BASE_URL}${path}`, {
    ...options,
    headers: {
      "xi-api-key": apiKey,
      ...(options.headers || {}),
    },
  });
  return response;
}

async function elevenFetchJson(path, options = {}) {
  const response = await elevenFetch(path, options);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`ElevenLabs API error (${response.status}) at ${path}: ${errorText}`);
  }
  // A couple of endpoints (e.g. training kickoff) return 200 with no body.
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Converts an ArrayBuffer to a base64 string without relying on Node's
 * Buffer, so this keeps working on the Vercel Edge Runtime.
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000; // avoid blowing the call stack on large buffers
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// 1. Create the PVC voice (metadata only, no audio yet)
// POST /v1/voices/pvc
// ---------------------------------------------------------------------------
export async function createPvcVoice({ name, language, description }) {
  const data = await elevenFetchJson("/voices/pvc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      language,
      ...(description ? { description } : {}),
    }),
  });
  return { voiceId: data.voice_id, raw: data };
}

// ---------------------------------------------------------------------------
// 2. Add one or more audio samples to a PVC voice
// POST /v1/voices/pvc/{voice_id}/samples
// ---------------------------------------------------------------------------
export async function addPvcSamples({ voiceId, files, removeBackgroundNoise = false }) {
  const form = new FormData();
  for (const file of files) {
    // ElevenLabs accepts multiple files under the repeated "files" field.
    form.append("files", file.blob, file.filename || "sample.webm");
  }
  if (removeBackgroundNoise) {
    form.append("remove_background_noise", "true");
  }

  const response = await elevenFetch(`/voices/pvc/${voiceId}/samples`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error (${response.status}) adding samples: ${errorText}`);
  }
  const data = await response.json();
  // Response is an array of sample objects: { sample_id, file_name, ... }
  return Array.isArray(data) ? data : data.samples || [];
}

// ---------------------------------------------------------------------------
// 3. Kick off speaker separation for one sample
// POST /v1/voices/pvc/{voice_id}/samples/{sample_id}/separate-speakers
// ---------------------------------------------------------------------------
export async function startSpeakerSeparation({ voiceId, sampleId }) {
  return elevenFetchJson(`/voices/pvc/${voiceId}/samples/${sampleId}/separate-speakers`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// 4. Poll speaker separation status / results
// GET /v1/voices/pvc/{voice_id}/samples/{sample_id}/speakers
// ---------------------------------------------------------------------------
export async function getSpeakerSeparationStatus({ voiceId, sampleId }) {
  return elevenFetchJson(`/voices/pvc/${voiceId}/samples/${sampleId}/speakers`, {
    method: "GET",
  });
}

// ---------------------------------------------------------------------------
// 5. Fetch a preview clip for one detected speaker
// GET /v1/voices/pvc/{voice_id}/samples/{sample_id}/speakers/{speaker_id}/audio
// Documented to return { audio_base_64, media_type }.
// ---------------------------------------------------------------------------
export async function getSeparatedSpeakerAudio({ voiceId, sampleId, speakerId }) {
  const data = await elevenFetchJson(
    `/voices/pvc/${voiceId}/samples/${sampleId}/speakers/${speakerId}/audio`,
    { method: "GET" }
  );
  return {
    audioBase64: data.audio_base_64,
    mediaType: data.media_type || "audio/mpeg",
  };
}

// ---------------------------------------------------------------------------
// 6. Tell ElevenLabs which detected speaker to actually use for training
// POST /v1/voices/pvc/{voice_id}/samples/{sample_id}
// Per the docs, send ALL speaker ids you want in one call — each call
// overwrites the previous selection for that sample.
// ---------------------------------------------------------------------------
export async function selectPvcSampleSpeaker({ voiceId, sampleId, selectedSpeakerIds }) {
  return elevenFetchJson(`/voices/pvc/${voiceId}/samples/${sampleId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected_speaker_ids: selectedSpeakerIds }),
  });
}

// ---------------------------------------------------------------------------
// 7. Verification: get the CAPTCHA the voice owner must read aloud
// GET /v1/voices/pvc/{voice_id}/captcha
//
// NOTE ON AMBIGUITY: ElevenLabs' own Python quickstart treats the response
// body as an already-base64-encoded string and base64-decodes it before
// writing a .png. Their JS SDK, by contrast, has an open GitHub issue
// (elevenlabs/elevenlabs-js#221) where this same call returns nothing at all,
// suggesting the raw HTTP response is actually binary image bytes and the
// SDK's typing/handling is just out of date. We can't tell which is correct
// without a live account, so this handles both: if the response looks like an
// image (by content-type), we base64-encode the raw bytes ourselves; if it
// comes back as text/JSON, we assume it's already base64 and pass it through.
// If you find this guesses wrong against your real account, flip the branch.
// ---------------------------------------------------------------------------
export async function getPvcCaptcha({ voiceId }) {
  const response = await elevenFetch(`/voices/pvc/${voiceId}/captcha`, {
    method: "GET",
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`ElevenLabs API error (${response.status}) fetching captcha: ${errorText}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("json")) {
    // Some accounts may get { image_base_64 } or similar — try common shapes.
    const data = await response.json();
    const base64 =
      data.image_base_64 || data.captcha || data.image || (typeof data === "string" ? data : null);
    if (!base64) {
      throw new Error("Unrecognized JSON shape for PVC captcha response.");
    }
    return { imageBase64: base64, mediaType: "image/png" };
  }

  if (contentType.includes("text")) {
    // Likely already a base64 string sent as plain text.
    const text = await response.text();
    return { imageBase64: text.trim(), mediaType: "image/png" };
  }

  // Default assumption: raw binary image bytes.
  const buffer = await response.arrayBuffer();
  return { imageBase64: arrayBufferToBase64(buffer), mediaType: contentType || "image/png" };
}

// ---------------------------------------------------------------------------
// 8. Verification: submit a recording of the voice owner reading the CAPTCHA
// POST /v1/voices/pvc/{voice_id}/captcha
// Multipart form, file field name is "recording".
// ---------------------------------------------------------------------------
export async function verifyPvcCaptcha({ voiceId, recordingBlob, filename = "captcha-recording.webm" }) {
  const form = new FormData();
  form.append("recording", recordingBlob, filename);

  const response = await elevenFetch(`/voices/pvc/${voiceId}/captcha`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`ElevenLabs API error (${response.status}) verifying captcha: ${errorText}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : { status: "ok" };
}

// ---------------------------------------------------------------------------
// 9. (Fallback) Request manual verification instead of the CAPTCHA
// POST /v1/voices/pvc/{voice_id}/verification
// Multipart form: files[] (supporting documents) + optional extra_text.
// Per ElevenLabs, exactly which files are required varies case-by-case —
// this should only be used when the CAPTCHA route has failed or isn't
// possible, and the resulting request is reviewed manually by ElevenLabs, not
// approved instantly.
// ---------------------------------------------------------------------------
export async function requestManualVerification({ voiceId, files, extraText }) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file.blob, file.filename || "document");
  }
  if (extraText) {
    form.append("extra_text", extraText);
  }

  const response = await elevenFetch(`/voices/pvc/${voiceId}/verification`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs API error (${response.status}) requesting manual verification: ${errorText}`
    );
  }
  const text = await response.text();
  return text ? JSON.parse(text) : { status: "ok" };
}

// ---------------------------------------------------------------------------
// 10. Start training once verification is complete
// POST /v1/voices/pvc/{voice_id}/train
// ---------------------------------------------------------------------------
export async function trainPvcVoice({ voiceId, modelId = "eleven_multilingual_v2" }) {
  return elevenFetchJson(`/voices/pvc/${voiceId}/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId }),
  });
}

// ---------------------------------------------------------------------------
// 11. Poll voice + fine-tuning status (used both while training and to check
// overall voice state)
// GET /v1/voices/{voice_id}
// ---------------------------------------------------------------------------
export async function getVoice({ voiceId }) {
  return elevenFetchJson(`/voices/${voiceId}`, { method: "GET" });
}
