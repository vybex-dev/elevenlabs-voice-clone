import { getPvcCaptcha } from "../../../lib/elevenlabs";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { searchParams } = new URL(req.url);
    const voiceId = searchParams.get("voiceId");
    if (!voiceId) return jsonResponse({ error: "Missing voiceId." }, 400);

    const { dataUrl } = await getPvcCaptcha({ voiceId });
    return jsonResponse({ image: dataUrl });
  } catch (err) {
    console.error("pvc/captcha error:", err);
    return jsonResponse(
      { error: "Couldn't load the verification image. Please try again." },
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
