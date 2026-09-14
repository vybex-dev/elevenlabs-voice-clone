import { createPvcVoice } from "../../../lib/elevenlabs";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { name, consent } = await req.json();

    if (consent !== true) {
      return jsonResponse({ error: "Consent confirmation is required." }, 400);
    }
    if (!name || typeof name !== "string") {
      return jsonResponse({ error: "A voice name is required." }, 400);
    }

    const { voiceId } = await createPvcVoice({
      name,
      language: "en",
      description: "Created via website professional voice cloning flow",
    });

    return jsonResponse({ voiceId });
  } catch (err) {
    console.error("pvc/create error:", err);
    return jsonResponse({ error: "Couldn't create the voice. Please try again." }, 500);
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
