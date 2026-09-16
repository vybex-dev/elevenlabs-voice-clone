import { getSpeakerSeparationStatus } from "../../../lib/elevenlabs";
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

  const { voiceId, sampleId } = req.query;
  if (!voiceId || !sampleId) {
    return res.status(400).json({ error: "voiceId and sampleId query params are required." });
  }

  try {
    const data = await getSpeakerSeparationStatus({ voiceId, sampleId });

    const speakers = data.speakers
      ? Object.values(data.speakers).map((speaker) => ({
          speakerId: speaker.speaker_id,
          durationSecs: speaker.duration_secs,
        }))
      : [];

    return res.status(200).json({
      status: data.status, // "not_started" | "pending" | "completed" | "failed"
      speakers,
      selectedSpeakerIds: data.selected_speaker_ids || [],
    });
  } catch (err) {
    console.error("PVC speakers error:", err);
    return res.status(500).json({ error: err.message || "Failed to get speaker status." });
  }
}
