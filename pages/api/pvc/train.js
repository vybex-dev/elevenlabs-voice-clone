import { trainPvcVoice } from "../../../lib/elevenlabs";
import { getSessionUser } from "../../../lib/auth";
import { updateVoiceEntry, addLog } from "../../../lib/db";

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
    const { voiceId, modelId } = req.body || {};
    if (!voiceId) {
      return res.status(400).json({ error: "voiceId is required." });
    }

    const selectedModel = modelId || "eleven_multilingual_v2";
    const result = await trainPvcVoice({ voiceId, modelId: selectedModel });

    await updateVoiceEntry(voiceId, { status: "training" });

    await addLog({
      voiceId,
      userId: user.id,
      username: user.username,
      event: "training_started",
      message: `Fine-tuning training started for voice ${voiceId} using model ${selectedModel}.`,
      metadata: { modelId: selectedModel },
    });

    return res.status(200).json({ success: true, status: result.status || "ok" });
  } catch (err) {
    console.error("PVC train error:", err);
    return res.status(500).json({ error: err.message || "Failed to start training." });
  }
}
