import { requireAdmin } from "../../../lib/auth";
import {
  getAllUsers,
  createUser,
  deleteUser,
  updateUserPassword,
} from "../../../lib/db";

async function handler(req, res) {
  if (req.method === "GET") {
    const users = await getAllUsers();
    return res.status(200).json({ users });
  }

  if (req.method === "POST") {
    try {
      const { username, password, role } = req.body || {};
      const newUser = await createUser({
        username,
        password,
        role: role === "admin" ? "admin" : "user",
      });
      return res.status(201).json({ success: true, user: newUser });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Failed to create user." });
    }
  }

  if (req.method === "DELETE") {
    try {
      const id = req.query.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: "User ID is required." });
      }
      await deleteUser(id);
      return res.status(200).json({ success: true, message: "User deleted successfully." });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Failed to delete user." });
    }
  }

  if (req.method === "PUT") {
    try {
      const { id, password } = req.body || {};
      if (!id || !password) {
        return res.status(400).json({ error: "User ID and new password are required." });
      }
      await updateUserPassword(id, password);
      return res.status(200).json({ success: true, message: "Password updated successfully." });
    } catch (err) {
      return res.status(400).json({ error: err.message || "Failed to update password." });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE", "PUT"]);
  return res.status(405).json({ error: "Method not allowed." });
}

export default requireAdmin(handler);
