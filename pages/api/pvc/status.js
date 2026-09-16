import { getVoice } from "../../../lib/elevenlabs";
import { getSessionUser } from "../../../lib/auth";
import { getVoiceEntry, updateVoiceEntry, addLog } from "../../../lib/db";

const MODEL_ID = "eleven_multilingual_v2";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }

  const voiceId = req.query.voiceId;
  if (!voiceId) {
    return res.status(400).json({ error: "voiceId query param is required." });
  }

  try {
    const voice = await getVoice({ voiceId });

    const fineTuning = voice.fine_tuning || {};
    const state = fineTuning.state ? fineTuning.state[MODEL_ID] : undefined;
    const progress = fineTuning.progress ? fineTuning.progress[MODEL_ID] : undefined;
    const currentState = state || "not_started";

    const existingEntry = getVoiceEntry(voiceId);
    if (existingEntry && existingEntry.status !== currentState) {
      updateVoiceEntry(voiceId, { status: currentState });

      if (currentState === "fine_tuned") {
        addLog({
          voiceId,
          userId: user.id,
          username: user.username,
          event: "training_completed",
          message: `Training completed successfully! Voice clone "${voice.name}" (${voiceId}) is ready.`,
        });
      } else if (currentState === "failed") {
        addLog({
          voiceId,
          userId: user.id,
          username: user.username,
          event: "training_failed",
          message: `Training failed for voice "${voice.name}" (${voiceId}).`,
        });
      }
    }

    return res.status(200).json({
      voiceId: voice.voice_id,
      name: voice.name,
      state: currentState, // e.g. "not_started" | "training" | "fine_tuned" | "failed"
      progress: progress ?? null,
    });
  } catch (err) {
    console.error("PVC status error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch voice status." });
  }
}
