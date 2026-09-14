import { addPvcSample } from "../../../lib/elevenlabs";

export const config = { runtime: "edge" };

// Kept intentionally small per request — the frontend sends one sample per
// call (one recorded segment, or one uploaded file at a time) instead of
// bundling everything into a single huge request. This keeps every request
// well under typical serverless body-size limits, even when a user's total
// audio adds up to 30+ minutes.
const MAX_BYTES = 20 * 1024 * 1024; // 20MB per individual sample

export default async function handler(req) {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const formData = await req.formData();
    const voiceId = formData.get("voiceId");
    const audio = formData.get("audio");

    if (!voiceId || typeof voiceId !== "string") {
      return jsonResponse({ error: "Missing voiceId." }, 400);
    }
    if (!audio || typeof audio === "string") {
      return jsonResponse({ error: "No audio sample received." }, 400);
    }
    if (audio.size > MAX_BYTES) {
      return jsonResponse({ error: "This sample is too large (20MB max per segment)." }, 400);
    }

    const data = await addPvcSample({
      voiceId,
      audioBlob: audio,
      filename: audio.name || "sample.webm",
    });

    return jsonResponse({ success: true, data });
  } catch (err) {
    console.error("pvc/samples error:", err);
    return jsonResponse({ error: "Couldn't upload that sample. Please try again." }, 500);
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
