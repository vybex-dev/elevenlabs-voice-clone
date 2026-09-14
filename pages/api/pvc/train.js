import { trainPvcVoice } from "../../../lib/elevenlabs";
import { jsonResponse, methodNotAllowed, withErrorHandling } from "../../../lib/http";

export const config = {
  runtime: "edge",
};

async function handler(req) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const { voiceId, modelId } = await req.json();
  if (!voiceId) {
    return jsonResponse({ error: "voiceId is required." }, 400);
  }

  const result = await trainPvcVoice({ voiceId, modelId: modelId || "eleven_multilingual_v2" });
  return jsonResponse({ success: true, status: result.status || "ok" });
}

export default withErrorHandling(handler);
