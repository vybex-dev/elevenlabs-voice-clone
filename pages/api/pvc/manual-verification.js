import { requestManualVerification } from "../../../lib/elevenlabs";
import { jsonResponse, methodNotAllowed, withErrorHandling } from "../../../lib/http";

// Fallback path when CAPTCHA verification has failed or isn't possible (e.g.
// the voice owner is visually impaired, per ElevenLabs' own guidance). This
// is reviewed by ElevenLabs directly — it does not unblock training
// immediately the way a successful CAPTCHA does.
export const config = {
  runtime: "edge",
};

const MAX_BYTES = 25 * 1024 * 1024; // 25MB across supporting documents

async function handler(req) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const formData = await req.formData();
  const voiceId = formData.get("voiceId");
  const extraText = formData.get("extraText") || "";

  if (!voiceId || typeof voiceId !== "string") {
    return jsonResponse({ error: "voiceId is required." }, 400);
  }

  const fileEntries = formData.getAll("files").filter((entry) => typeof entry !== "string");
  if (fileEntries.length === 0) {
    return jsonResponse(
      { error: "At least one supporting file is required for manual verification." },
      400
    );
  }

  const totalBytes = fileEntries.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_BYTES) {
    return jsonResponse({ error: "Supporting files are too large (25MB max total)." }, 400);
  }

  const files = fileEntries.map((file, i) => ({
    blob: file,
    filename: file.name || `verification-doc-${i}`,
  }));

  const result = await requestManualVerification({ voiceId, files, extraText });
  return jsonResponse({ success: true, ...result });
}

export default withErrorHandling(handler);
