import { startSpeakerSeparation } from "../../../lib/elevenlabs";
import { jsonResponse, methodNotAllowed, withErrorHandling } from "../../../lib/http";

// Kicks off ElevenLabs' speaker-separation pass on one sample. Only called
// on-demand (from an explicit "detect speakers / clean up audio" action in
// the wizard) rather than automatically for every sample — for a normal,
// single-voice recording it's unnecessary latency, so it's opt-in for the
// messier cases (background noise, more than one voice in the clip).
export const config = {
  runtime: "edge",
};

async function handler(req) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const { voiceId, sampleId } = await req.json();
  if (!voiceId || !sampleId) {
    return jsonResponse({ error: "voiceId and sampleId are required." }, 400);
  }

  const result = await startSpeakerSeparation({ voiceId, sampleId });
  return jsonResponse({ success: true, status: result.status || "ok" });
}

export default withErrorHandling(handler);
