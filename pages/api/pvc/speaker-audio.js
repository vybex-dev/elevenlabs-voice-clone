import { getSeparatedSpeakerAudio } from "../../../lib/elevenlabs";
import { getSessionUser } from "../../../lib/auth";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }

  const { voiceId, sampleId, speakerId } = req.query;
  if (!voiceId || !sampleId || !speakerId) {
    return res.status(400).json({
      error: "voiceId, sampleId and speakerId query params are required.",
    });
  }

  try {
    const { audioBase64, mediaType } = await getSeparatedSpeakerAudio({
      voiceId,
      sampleId,
      speakerId,
    });

    return res.status(200).json({ dataUri: `data:${mediaType};base64,${audioBase64}` });
  } catch (err) {
    console.error("PVC speaker-audio error:", err);
    return res.status(500).json({ error: err.message || "Failed to load speaker preview." });
  }
}
