import { getVoice } from "../../../lib/elevenlabs";
import { jsonResponse, methodNotAllowed, withErrorHandling } from "../../../lib/http";

const MODEL_ID = "eleven_multilingual_v2";

export const config = {
  runtime: "edge",
};

async function handler(req) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const { searchParams } = new URL(req.url);
  const voiceId = searchParams.get("voiceId");
  if (!voiceId) {
    return jsonResponse({ error: "voiceId query param is required." }, 400);
  }

  const voice = await getVoice({ voiceId });

  const fineTuning = voice.fine_tuning || {};
  const state = fineTuning.state ? fineTuning.state[MODEL_ID] : undefined;
  const progress = fineTuning.progress ? fineTuning.progress[MODEL_ID] : undefined;

  return jsonResponse({
    voiceId: voice.voice_id,
    name: voice.name,
    state: state || "not_started", // e.g. "not_started" | "training" | "fine_tuned" | "failed"
    progress: progress ?? null,
  });
}

export default withErrorHandling(handler);
