import { createPvcVoice } from "../../../lib/elevenlabs";
import { getSessionUser } from "../../../lib/auth";
import { createVoiceEntry, addLog } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }

  try {
    const { name, language, description, consent } = req.body || {};

    if (consent !== true) {
      return res.status(400).json({
        error: "Consent confirmation is required to create a professional voice clone.",
      });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "A name for the voice is required." });
    }
    if (!language || !language.trim()) {
      return res.status(400).json({ error: "A language for the voice samples is required." });
    }

    const trimmedName = name.trim().slice(0, 100);
    const trimmedLang = language.trim();
    const trimmedDesc = description ? description.trim().slice(0, 500) : "Created via PVC wizard";

    const { voiceId } = await createPvcVoice({
      name: trimmedName,
      language: trimmedLang,
      description: trimmedDesc,
    });

    const voiceEntry = createVoiceEntry({
      userId: user.id,
      username: user.username,
      voiceId,
      name: trimmedName,
      language: trimmedLang,
      description: trimmedDesc,
      status: "created",
    });

    return res.status(200).json({ success: true, voiceId, voice: voiceEntry });
  } catch (err) {
    console.error("PVC create error:", err);
    addLog({
      userId: user.id,
      username: user.username,
      event: "voice_create_failed",
      message: `Failed creating voice "${req.body?.name}": ${err.message}`,
    });
    return res.status(500).json({ error: err.message || "Failed to create voice." });
  }
}
