import { getPvcStatus } from "../../../lib/elevenlabs";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { searchParams } = new URL(req.url);
    const voiceId = searchParams.get("voiceId");
    if (!voiceId) return jsonResponse({ error: "Missing voiceId." }, 400);

    const status = await getPvcStatus({ voiceId });
    return jsonResponse(status);
  } catch (err) {
    console.error("pvc/status error:", err);
    return jsonResponse(
      { error: "Couldn't check status. Double check the Voice ID and try again." },
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
