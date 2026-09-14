import { getPvcCaptcha, verifyPvcCaptcha } from "../../../lib/elevenlabs";
import { jsonResponse, methodNotAllowed, withErrorHandling } from "../../../lib/http";

// GET  -> fetch the CAPTCHA image (a few lines of text) the voice owner must
//         read aloud, proving they have permission to use the voice.
// POST -> submit a recording of them reading it, for verification.
export const config = {
  runtime: "edge",
};

async function handler(req) {
  if (req.method === "GET") {
    const { searchParams } = new URL(req.url);
    const voiceId = searchParams.get("voiceId");
    if (!voiceId) {
      return jsonResponse({ error: "voiceId query param is required." }, 400);
    }
    const { imageBase64, mediaType } = await getPvcCaptcha({ voiceId });
    return jsonResponse({ dataUri: `data:${mediaType};base64,${imageBase64}` });
  }

  if (req.method === "POST") {
    const formData = await req.formData();
    const voiceId = formData.get("voiceId");
    const recording = formData.get("recording");

    if (!voiceId || typeof voiceId !== "string") {
      return jsonResponse({ error: "voiceId is required." }, 400);
    }
    if (!recording || typeof recording === "string") {
      return jsonResponse({ error: "No recording received." }, 400);
    }

    const result = await verifyPvcCaptcha({ voiceId, recordingBlob: recording });
    return jsonResponse({ success: true, ...result });
  }

  return methodNotAllowed(["GET", "POST"]);
}

export default withErrorHandling(handler);
