// Thin wrapper around the ElevenLabs "Add Voice" (instant voice cloning) endpoint.
// Kept isolated from the API route so that later — when accounts exist — this
// can be swapped for a per-user key, a queue, usage tracking, etc. without
// touching the request-handling code.

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

/**
 * Uploads a recorded/uploaded audio sample to ElevenLabs and creates a new
 * voice clone under the account tied to ELEVENLABS_API_KEY.
 *
 * @param {Object} params
 * @param {Blob} params.audioBlob - the audio sample (webm/wav/mp3/etc.)
 * @param {string} params.voiceName - display name for the cloned voice
 * @param {string} [params.description] - optional description
 * @returns {Promise<{voiceId: string, raw: any}>}
 */
export async function cloneVoice({ audioBlob, voiceName, description }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set on the server.");
  }

  const form = new FormData();
  form.append("name", voiceName);
  if (description) form.append("description", description);
  // ElevenLabs accepts one or more files under the "files" field.
  form.append("files", audioBlob, "sample.webm");

  const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/add`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `ElevenLabs API error (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();
  return { voiceId: data.voice_id, raw: data };
}
