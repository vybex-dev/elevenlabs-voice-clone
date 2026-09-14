import { verifyPvcCaptcha, trainPvcVoice } from "../../../lib/elevenlabs";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const formData = await req.formData();
    const voiceId = formData.get("voiceId");
    const recording = formData.get("recording");

    if (!voiceId || typeof voiceId !== "string") {
      return jsonResponse({ error: "Missing voiceId." }, 400);
    }
    if (!recording || typeof recording === "string") {
      return jsonResponse({ error: "No verification recording received." }, 400);
    }

    await verifyPvcCaptcha({ voiceId, recordingBlob: recording });

    // Verification succeeded — immediately start training so the user
    // doesn't have to make a separate request for it.
    await trainPvcVoice({ voiceId });

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("pvc/verify-captcha error:", err);
    return jsonResponse(
      {
        error:
          "Verification failed. Make sure you read the image text clearly and try again.",
      },
      500
    );
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
