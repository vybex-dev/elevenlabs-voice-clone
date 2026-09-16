import { addPvcSamples } from "../../../lib/elevenlabs";
import { getSessionUser } from "../../../lib/auth";
import { parseMultipartForm } from "../../../lib/multipart";
import { getVoiceEntry, updateVoiceEntry, addLog } from "../../../lib/db";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_BYTES_PER_CALL = 50 * 1024 * 1024; // 50MB

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
    const { fields, files } = await parseMultipartForm(req);
    const voiceId = fields.voiceId;

    if (!voiceId) {
      return res.status(400).json({ error: "voiceId is required." });
    }

    const audioFiles = files.filter(
      (f) => f.fieldName === "audio" || (f.mimeType && f.mimeType.startsWith("audio/"))
    );

    if (audioFiles.length === 0) {
      return res.status(400).json({ error: "No audio files received." });
    }

    const totalBytes = audioFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_BYTES_PER_CALL) {
      return res.status(400).json({
        error: `That batch is too large (${Math.round(totalBytes / 1024 / 1024)}MB). Add samples in smaller batches.`,
      });
    }

    const formattedFiles = audioFiles.map((file, i) => ({
      blob: file.blob,
      filename: file.filename || `sample-${Date.now()}-${i}.webm`,
    }));

    const samples = await addPvcSamples({ voiceId, files: formattedFiles });

    const addedDuration = samples.reduce((sum, s) => sum + (s.duration_secs || 0), 0);
    const existingEntry = await getVoiceEntry(voiceId);
    const newSampleCount = (existingEntry?.sampleCount || 0) + samples.length;
    const newTotalDuration = (existingEntry?.totalDurationSecs || 0) + addedDuration;

    await updateVoiceEntry(voiceId, {
      status: "samples_added",
      sampleCount: newSampleCount,
      totalDurationSecs: newTotalDuration,
    });

    await addLog({
      voiceId,
      userId: user.id,
      username: user.username,
      event: "sample_uploaded",
      message: `Added ${samples.length} sample(s) (${Math.round(addedDuration)}s) to voice ${voiceId}.`,
      metadata: { sampleCount: samples.length, durationSecs: addedDuration },
    });

    return res.status(200).json({
      success: true,
      samples: samples.map((s) => ({
        sampleId: s.sample_id,
        fileName: s.file_name,
        durationSecs: s.duration_secs,
      })),
    });
  } catch (err) {
    console.error("PVC samples error:", err);
    return res.status(500).json({ error: err.message || "Failed to upload samples." });
  }
}
