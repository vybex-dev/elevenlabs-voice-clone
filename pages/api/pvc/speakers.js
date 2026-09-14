import { getSpeakerSeparationStatus } from "../../../lib/elevenlabs";
import { jsonResponse, methodNotAllowed, withErrorHandling } from "../../../lib/http";

// Polled by the wizard every few seconds after /api/pvc/separate is called,
// until status is "completed" or "failed".
export const config = {
  runtime: "edge",
};

async function handler(req) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const { searchParams } = new URL(req.url);
  const voiceId = searchParams.get("voiceId");
  const sampleId = searchParams.get("sampleId");
  if (!voiceId || !sampleId) {
    return jsonResponse({ error: "voiceId and sampleId query params are required." }, 400);
  }

  const data = await getSpeakerSeparationStatus({ voiceId, sampleId });

  const speakers = data.speakers
    ? Object.values(data.speakers).map((speaker) => ({
        speakerId: speaker.speaker_id,
        durationSecs: speaker.duration_secs,
      }))
    : [];

  return jsonResponse({
    status: data.status, // "not_started" | "pending" | "completed" | "failed"
    speakers,
    selectedSpeakerIds: data.selected_speaker_ids || [],
  });
}

export default withErrorHandling(handler);
