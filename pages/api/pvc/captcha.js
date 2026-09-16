import { getPvcCaptcha, verifyPvcCaptcha } from "../../../lib/elevenlabs";
import { getSessionUser } from "../../../lib/auth";
import { parseMultipartForm } from "../../../lib/multipart";
import { updateVoiceEntry, addLog } from "../../../lib/db";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }

  if (req.method === "GET") {
    try {
      const voiceId = req.query.voiceId;
      if (!voiceId) {
        return res.status(400).json({ error: "voiceId query param is required." });
      }

      const { imageBase64, mediaType } = await getPvcCaptcha({ voiceId });
      return res.status(200).json({ dataUri: `data:${mediaType};base64,${imageBase64}` });
    } catch (err) {
      console.error("PVC captcha GET error:", err);
      return res.status(500).json({ error: err.message || "Failed to load verification image." });
    }
  }

  if (req.method === "POST") {
    try {
      const { fields, files } = await parseMultipartForm(req);
      const voiceId = fields.voiceId;

      if (!voiceId) {
        return res.status(400).json({ error: "voiceId is required." });
      }

      const recordingFile = files.find(
        (f) => f.fieldName === "recording" || (f.mimeType && f.mimeType.startsWith("audio/"))
      );

      if (!recordingFile) {
        return res.status(400).json({ error: "No recording received." });
      }

      const result = await verifyPvcCaptcha({
        voiceId,
        recordingBlob: recordingFile.blob,
      });

      updateVoiceEntry(voiceId, { status: "verified" });

      addLog({
        voiceId,
        userId: user.id,
        username: user.username,
        event: "voice_verified",
        message: `Identity verification completed for voice ${voiceId}.`,
      });

      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error("PVC captcha POST error:", err);
      return res.status(500).json({ error: err.message || "Verification failed." });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method not allowed. Use GET or POST." });
}
