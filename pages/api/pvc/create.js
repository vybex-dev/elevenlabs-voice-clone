import { createPvcVoice } from "../../../lib/elevenlabs";
import { jsonResponse, methodNotAllowed, withErrorHandling } from "../../../lib/http";

// Step 1 of the PVC flow: create the voice "shell" (name/language/description)
// before any audio exists. Everything downstream (samples, verification,
// training) hangs off the voice_id returned here.
export const config = {
  runtime: "edge",
};

async function handler(req) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const body = await req.json();
  const { name, language, description, consent } = body || {};

  if (consent !== true) {
    return jsonResponse(
      { error: "Consent confirmation is required to create a professional voice clone." },
      400
    );
  }
  if (!name || !name.trim()) {
    return jsonResponse({ error: "A name for the voice is required." }, 400);
  }
  if (!language || !language.trim()) {
    return jsonResponse({ error: "A language for the voice samples is required." }, 400);
  }

  const { voiceId } = await createPvcVoice({
    name: name.trim().slice(0, 100),
    language: language.trim(),
    description: description ? description.trim().slice(0, 500) : "Created via PVC wizard",
  });

  return jsonResponse({ success: true, voiceId });
}

export default withErrorHandling(handler);
