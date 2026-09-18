import { getPvcCaptcha, verifyPvcCaptcha } from "../../../lib/elevenlabs";
import { getSessionUser } from "../../../lib/auth";
import { parseMultipartForm } from "../../../lib/multipart";
import { getVoiceEntry, updateVoiceEntry, addLog } from "../../../lib/db";

export const config = {
  api: {
    bodyParser: false,
  },
};

// ElevenLabs caps how many verification attempts a voice gets before it
// locks the voice out and makes you wait ~24h (their own support docs: "If
// you fail all your verification attempts ... you can wait 24 hours, after
// which time you will be able to retry"). They don't return an exact reset
// time, so this is our own estimate, stored on the voice entry so we stop
// calling ElevenLabs (and burning further attempts) for the rest of that
// window instead of hammering an endpoint we already know will 400.
const VERIFICATION_LOCKOUT_MS = 24 * 60 * 60 * 1000;

function activeLock(voiceEntry) {
  const until = voiceEntry?.verificationLockedUntil;
  if (!until) return null;
  return new Date(until).getTime() > Date.now() ? until : null;
}

function lockedResponse(res, retryAfter) {
  return res.status(429).json({
    error:
      "You've used all the verification attempts ElevenLabs allows for this voice. " +
      "They require waiting about 24 hours before trying again, or you can request " +
      "manual verification if it's enabled for your workspace.",
    code: "max_verification_attempts_reached",
    retryAfter,
  });
}

async function lockVoiceVerification({ voiceId, user }) {
  const retryAfter = new Date(Date.now() + VERIFICATION_LOCKOUT_MS).toISOString();
  await updateVoiceEntry(voiceId, {
    status: "verification_locked",
    verificationLockedUntil: retryAfter,
  });
  await addLog({
    voiceId,
    userId: user.id,
    username: user.username,
    event: "voice_verification_locked",
    message: `Voice ${voiceId} hit ElevenLabs' verification attempt limit; locked (est.) until ${retryAfter}.`,
  });
  return retryAfter;
}

export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }

  if (req.method === "GET") {
    try {
      const voiceId = req.query.voiceId;
      if (!voiceId) {
        return res.status(400).json({ error: "voiceId query param is required." });
      }

      const existingEntry = await getVoiceEntry(voiceId);
      const lockedUntil = activeLock(existingEntry);
      if (lockedUntil) {
        return lockedResponse(res, lockedUntil);
      }

      const { imageBase64, mediaType } = await getPvcCaptcha({ voiceId });
      return res.status(200).json({ dataUri: `data:${mediaType};base64,${imageBase64}` });
    } catch (err) {
      console.error("PVC captcha GET error:", err);
      if (err.code === "max_verification_attempts_reached") {
        const retryAfter = await lockVoiceVerification({ voiceId: req.query.voiceId, user });
        return lockedResponse(res, retryAfter);
      }
      return res.status(500).json({ error: err.message || "Failed to load verification image." });
    }
  }

  if (req.method === "POST") {
    // Declared outside the try block so the catch handler (which needs it to
    // persist a lockout) can still reach it even if something below throws.
    let voiceId;
    try {
      const { fields, files } = await parseMultipartForm(req);
      voiceId = fields.voiceId;

      if (!voiceId) {
        return res.status(400).json({ error: "voiceId is required." });
      }

      const existingEntry = await getVoiceEntry(voiceId);
      const lockedUntil = activeLock(existingEntry);
      if (lockedUntil) {
        return lockedResponse(res, lockedUntil);
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

      await updateVoiceEntry(voiceId, { status: "verified" });

      await addLog({
        voiceId,
        userId: user.id,
        username: user.username,
        event: "voice_verified",
        message: `Identity verification completed for voice ${voiceId}.`,
      });

      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error("PVC captcha POST error:", err);
      if (err.code === "max_verification_attempts_reached" && voiceId) {
        const retryAfter = await lockVoiceVerification({ voiceId, user });
        return lockedResponse(res, retryAfter);
      }
      return res.status(500).json({ error: err.message || "Verification failed." });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ error: "Method not allowed. Use GET or POST." });
}
