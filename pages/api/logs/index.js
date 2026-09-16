import { requireAuth } from "../../../lib/auth";
import {
  getLogs,
  getVoiceEntries,
  getVoiceEntry,
  addLog,
  deleteVoiceEntry,
} from "../../../lib/db";

async function handler(req, res) {
  const user = req.user;
  const isAdmin = user.role === "admin";

  if (req.method === "GET") {
    try {
      const { voiceId, limit } = req.query;
      const voices = await getVoiceEntries({
        userId: user.id,
        isAdmin,
      });

      const logs = await getLogs({
        userId: user.id,
        isAdmin,
        voiceId: voiceId || null,
        limit: limit ? parseInt(limit, 10) : 100,
      });

      return res.status(200).json({
        voices,
        logs,
      });
    } catch (err) {
      console.error("Logs GET error:", err);
      return res.status(500).json({ error: "Failed to fetch logs." });
    }
  }

  if (req.method === "POST") {
    try {
      const { voiceId, event, message, metadata } = req.body || {};
      if (!event || !message) {
        return res.status(400).json({ error: "Event and message are required." });
      }

      // If voiceId is provided, verify ownership unless admin
      if (voiceId) {
        const voice = await getVoiceEntry(voiceId);
        if (voice && !isAdmin && voice.userId !== user.id) {
          return res.status(403).json({ error: "Unauthorized for this voice." });
        }
      }

      const log = await addLog({
        voiceId: voiceId || null,
        userId: user.id,
        username: user.username,
        event,
        message,
        metadata: metadata || {},
      });

      return res.status(201).json({ success: true, log });
    } catch (err) {
      console.error("Logs POST error:", err);
      return res.status(500).json({ error: "Failed to create log." });
    }
  }

  if (req.method === "DELETE") {
    try {
      const voiceId = req.query.voiceId || req.body?.voiceId;
      if (!voiceId) {
        return res.status(400).json({ error: "voiceId is required to delete." });
      }

      await deleteVoiceEntry(voiceId, user);
      return res.status(200).json({ success: true, message: "Voice entry removed." });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Failed to delete voice entry." });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed." });
}

export default requireAuth(handler);
