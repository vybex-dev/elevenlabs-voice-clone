import { selectPvcSampleSpeaker } from "../../../lib/elevenlabs";
import { jsonResponse, methodNotAllowed, withErrorHandling } from "../../../lib/http";

export const config = {
  runtime: "edge",
};

async function handler(req) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const { voiceId, sampleId, speakerId } = await req.json();
  if (!voiceId || !sampleId || !speakerId) {
    return jsonResponse({ error: "voiceId, sampleId and speakerId are required." }, 400);
  }

  await selectPvcSampleSpeaker({ voiceId, sampleId, selectedSpeakerIds: [speakerId] });
  return jsonResponse({ success: true });
}

export default withErrorHandling(handler);
