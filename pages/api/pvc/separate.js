import { startSpeakerSeparation } from "../../../lib/elevenlabs";
import { getSessionUser } from "../../../lib/auth";
import { addLog } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }

  try {
    const { voiceId, sampleId } = req.body || {};
    if (!voiceId || !sampleId) {
      return res.status(400).json({ error: "voiceId and sampleId are required." });
    }

    const result = await startSpeakerSeparation({ voiceId, sampleId });

    await addLog({
      voiceId,
      userId: user.id,
      username: user.username,
      event: "speaker_separation_started",
      message: `Speaker separation triggered for sample ${sampleId}.`,
      metadata: { sampleId },
    });

    return res.status(200).json({ success: true, status: result.status || "ok" });
  } catch (err) {
    console.error("PVC separate error:", err);
    return res.status(500).json({ error: err.message || "Failed to start speaker separation." });
  }
}
