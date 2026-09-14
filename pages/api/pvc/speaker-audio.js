import { getSeparatedSpeakerAudio } from "../../../lib/elevenlabs";
import { jsonResponse, methodNotAllowed, withErrorHandling } from "../../../lib/http";

// Lets the wizard play "is this you?" previews for each detected speaker
// without ever exposing ELEVENLABS_API_KEY to the browser. Returns a data URI
// the <audio> element can use directly.
export const config = {
  runtime: "edge",
};

async function handler(req) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const { searchParams } = new URL(req.url);
  const voiceId = searchParams.get("voiceId");
  const sampleId = searchParams.get("sampleId");
  const speakerId = searchParams.get("speakerId");
  if (!voiceId || !sampleId || !speakerId) {
    return jsonResponse({ error: "voiceId, sampleId and speakerId query params are required." }, 400);
  }

  const { audioBase64, mediaType } = await getSeparatedSpeakerAudio({ voiceId, sampleId, speakerId });

  return jsonResponse({ dataUri: `data:${mediaType};base64,${audioBase64}` });
}

export default withErrorHandling(handler);
