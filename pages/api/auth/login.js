import { verifyUserPassword, addLog } from "../../../lib/db";
import { createSessionToken, createAuthCookieHeader } from "../../../lib/auth";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const user = await verifyUserPassword(username, password);
    if (!user) {
      await addLog({
        userId: "anonymous",
        username: (username || "").trim(),
        event: "login_failed",
        message: `Failed login attempt for username "${username}".`,
      });
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = createSessionToken(user);
    const cookieHeader = createAuthCookieHeader(token);

    res.setHeader("Set-Cookie", cookieHeader);

    await addLog({
      userId: user.id,
      username: user.username,
      event: "login_success",
      message: `User "${user.username}" logged in successfully.`,
    });

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Something went wrong during login." });
  }
}
