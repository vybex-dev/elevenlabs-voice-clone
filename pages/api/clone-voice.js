import { cloneVoice } from "../../lib/elevenlabs";

// Edge runtime gives us native FormData/Request support on Vercel, and — as
// important for your original worry — each invocation is an isolated,
// independently-scaled function. One failing/slow clone request can't take
// the rest of the site down.
export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const formData = await req.formData();
    const audio = formData.get("audio");
    const name = formData.get("name") || `Voice ${new Date().toISOString()}`;
    const consent = formData.get("consent");

    if (!audio || typeof audio === "string") {
      return jsonResponse({ error: "No audio file received." }, 400);
    }

    if (consent !== "true") {
      return jsonResponse(
        { error: "Consent confirmation is required to clone a voice." },
        400
      );
    }

    // Basic sanity limits — generous enough for a short voice sample,
    // tight enough to stop someone lobbing huge files at your ElevenLabs bill.
    const MAX_BYTES = 25 * 1024 * 1024; // 25MB
    if (audio.size > MAX_BYTES) {
      return jsonResponse({ error: "Audio file is too large (25MB max)." }, 400);
    }

    const { voiceId } = await cloneVoice({
      audioBlob: audio,
      voiceName: name,
      description: "Created via website voice cloning MVP",
    });

    return jsonResponse({ success: true, voiceId });
  } catch (err) {
    console.error("clone-voice error:", err);
    return jsonResponse(
      { error: "Something went wrong while cloning the voice. Please try again." },
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
