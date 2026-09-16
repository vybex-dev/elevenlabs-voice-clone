import { selectPvcSampleSpeaker } from "../../../lib/elevenlabs";
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
    const { voiceId, sampleId, speakerId } = req.body || {};
    if (!voiceId || !sampleId || !speakerId) {
      return res.status(400).json({ error: "voiceId, sampleId and speakerId are required." });
    }

    await selectPvcSampleSpeaker({
      voiceId,
      sampleId,
      selectedSpeakerIds: [speakerId],
    });

    await addLog({
      voiceId,
      userId: user.id,
      username: user.username,
      event: "speaker_selected",
      message: `Selected speaker ${speakerId} for sample ${sampleId}.`,
      metadata: { sampleId, speakerId },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("PVC select-speaker error:", err);
    return res.status(500).json({ error: err.message || "Failed to select speaker." });
  }
}
