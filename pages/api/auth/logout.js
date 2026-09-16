import { createLogoutCookieHeader, getSessionUser } from "../../../lib/auth";
import { addLog } from "../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const user = await getSessionUser(req);
  if (user) {
    await addLog({
      userId: user.id,
      username: user.username,
      event: "logout",
      message: `User "${user.username}" logged out.`,
    });
  }

  res.setHeader("Set-Cookie", createLogoutCookieHeader());
  return res.status(200).json({ success: true, message: "Logged out successfully." });
}
