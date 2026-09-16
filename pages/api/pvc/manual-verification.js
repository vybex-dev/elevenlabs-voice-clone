import { requestManualVerification } from "../../../lib/elevenlabs";
import { getSessionUser } from "../../../lib/auth";
import { parseMultipartForm } from "../../../lib/multipart";
import { updateVoiceEntry, addLog } from "../../../lib/db";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_BYTES = 25 * 1024 * 1024; // 25MB

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
    const { fields, files } = await parseMultipartForm(req);
    const voiceId = fields.voiceId;
    const extraText = fields.extraText || "";

    if (!voiceId) {
      return res.status(400).json({ error: "voiceId is required." });
    }

    const docFiles = files.filter((f) => f.fieldName === "files" || f.fieldName === "file");
    if (docFiles.length === 0) {
      return res.status(400).json({
        error: "At least one supporting file is required for manual verification.",
      });
    }

    const totalBytes = docFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_BYTES) {
      return res.status(400).json({
        error: "Supporting files are too large (25MB max total).",
      });
    }

    const formattedFiles = docFiles.map((file, i) => ({
      blob: file.blob,
      filename: file.filename || `verification-doc-${i}`,
    }));

    const result = await requestManualVerification({
      voiceId,
      files: formattedFiles,
      extraText,
    });

    updateVoiceEntry(voiceId, { status: "manual_verification_pending" });

    addLog({
      voiceId,
      userId: user.id,
      username: user.username,
      event: "manual_verification_requested",
      message: `Manual verification requested for voice ${voiceId} with ${docFiles.length} supporting document(s).`,
      metadata: { fileCount: docFiles.length },
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("PVC manual-verification error:", err);
    return res.status(500).json({
      error: err.message || "Something went wrong submitting manual verification.",
    });
  }
}
