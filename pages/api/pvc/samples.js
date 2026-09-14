import { addPvcSamples } from "../../../lib/elevenlabs";
import { jsonResponse, methodNotAllowed, withErrorHandling } from "../../../lib/http";

// Step 2 of the PVC flow: attach audio samples to an existing PVC voice.
// Called once per clip (or small batch of clips) as the person records or
// uploads them in the wizard, rather than one giant request at the end — PVC
// audio can add up to a couple of hours, which is well beyond what's sane to
// hold in a single request/response cycle.
export const config = {
  runtime: "edge",
};

// Per-call cap, not a total-audio cap. Raise this if your Vercel plan's body
// size limit allows it and you want to batch more clips per call.
const MAX_BYTES_PER_CALL = 50 * 1024 * 1024; // 50MB

async function handler(req) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const formData = await req.formData();
  const voiceId = formData.get("voiceId");
  if (!voiceId || typeof voiceId !== "string") {
    return jsonResponse({ error: "voiceId is required." }, 400);
  }

  const audioEntries = formData.getAll("audio").filter((entry) => typeof entry !== "string");
  if (audioEntries.length === 0) {
    return jsonResponse({ error: "No audio files received." }, 400);
  }

  let totalBytes = 0;
  const files = audioEntries.map((file, i) => {
    totalBytes += file.size;
    return { blob: file, filename: file.name || `sample-${Date.now()}-${i}.webm` };
  });

  if (totalBytes > MAX_BYTES_PER_CALL) {
    return jsonResponse(
      { error: `That batch is too large (${Math.round(totalBytes / 1024 / 1024)}MB). Add samples in smaller batches.` },
      400
    );
  }

  const samples = await addPvcSamples({ voiceId, files });

  return jsonResponse({
    success: true,
    samples: samples.map((s) => ({
      sampleId: s.sample_id,
      fileName: s.file_name,
      durationSecs: s.duration_secs,
    })),
  });
}

export default withErrorHandling(handler);
