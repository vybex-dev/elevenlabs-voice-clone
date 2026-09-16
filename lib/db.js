import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "app_data.json");

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
}

function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function getInitialData() {
  const adminSalt = generateSalt();
  const defaultAdminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const defaultAdminUsername = process.env.ADMIN_USERNAME || "admin";

  return {
    users: [
      {
        id: "admin-" + crypto.randomBytes(4).toString("hex"),
        username: defaultAdminUsername,
        passwordHash: hashPassword(defaultAdminPassword, adminSalt),
        salt: adminSalt,
        role: "admin",
        createdAt: new Date().toISOString(),
      },
    ],
    voices: [],
    logs: [
      {
        id: "log-" + crypto.randomBytes(6).toString("hex"),
        voiceId: null,
        userId: "system",
        username: "system",
        event: "system_initialized",
        message: "System initialized with default administrator account.",
        timestamp: new Date().toISOString(),
        metadata: {},
      },
    ],
  };
}

let memoryData = null;

function loadData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const initial = getInitialData();
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf-8");
      memoryData = initial;
      return memoryData;
    }
    const content = fs.readFileSync(DB_FILE, "utf-8");
    memoryData = JSON.parse(content);
    
    // Ensure default admin exists if users array is empty
    if (!memoryData.users || memoryData.users.length === 0) {
      const initial = getInitialData();
      memoryData.users = initial.users;
      saveData(memoryData);
    }
    if (!memoryData.voices) memoryData.voices = [];
    if (!memoryData.logs) memoryData.logs = [];

    return memoryData;
  } catch (err) {
    console.error("Error loading DB file:", err);
    if (!memoryData) {
      memoryData = getInitialData();
    }
    return memoryData;
  }
}

function saveData(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    memoryData = data;
    // Atomic write to prevent file corruption
    const tempFile = `${DB_FILE}.${Date.now()}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error("Error saving DB file:", err);
  }
}

// ---------------- USER OPERATIONS ----------------

export function getUserByUsername(username) {
  const data = loadData();
  const lower = (username || "").trim().toLowerCase();
  return data.users.find((u) => u.username.toLowerCase() === lower) || null;
}

export function getUserById(id) {
  const data = loadData();
  return data.users.find((u) => u.id === id) || null;
}

export function getAllUsers() {
  const data = loadData();
  return data.users.map(({ id, username, role, createdAt }) => {
    const userVoices = data.voices.filter((v) => v.userId === id);
    return {
      id,
      username,
      role,
      createdAt,
      voicesCount: userVoices.length,
    };
  });
}

export function verifyUserPassword(username, password) {
  const user = getUserByUsername(username);
  if (!user) return null;
  const hash = hashPassword(password, user.salt);
  if (hash === user.passwordHash) {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
  return null;
}

export function createUser({ username, password, role = "user" }) {
  const data = loadData();
  const cleanUsername = (username || "").trim();
  if (!cleanUsername) {
    throw new Error("Username is required.");
  }
  if (!password || password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }
  if (data.users.some((u) => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
    throw new Error(`Username "${cleanUsername}" is already taken.`);
  }

  const salt = generateSalt();
  const newUser = {
    id: "user-" + crypto.randomBytes(6).toString("hex"),
    username: cleanUsername,
    passwordHash: hashPassword(password, salt),
    salt,
    role: role === "admin" ? "admin" : "user",
    createdAt: new Date().toISOString(),
  };

  data.users.push(newUser);
  saveData(data);

  addLog({
    userId: newUser.id,
    username: newUser.username,
    event: "user_created",
    message: `Account "${newUser.username}" (${newUser.role}) created.`,
    metadata: { role: newUser.role },
  });

  return {
    id: newUser.id,
    username: newUser.username,
    role: newUser.role,
    createdAt: newUser.createdAt,
  };
}

export function deleteUser(id) {
  const data = loadData();
  const target = data.users.find((u) => u.id === id);
  if (!target) {
    throw new Error("User not found.");
  }

  // Prevent deleting the only admin
  if (target.role === "admin") {
    const adminCount = data.users.filter((u) => u.role === "admin").length;
    if (adminCount <= 1) {
      throw new Error("Cannot delete the only administrator account.");
    }
  }

  data.users = data.users.filter((u) => u.id !== id);
  saveData(data);

  addLog({
    userId: target.id,
    username: target.username,
    event: "user_deleted",
    message: `User account "${target.username}" was deleted by administrator.`,
  });

  return { success: true };
}

export function updateUserPassword(id, newPassword) {
  if (!newPassword || newPassword.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }
  const data = loadData();
  const user = data.users.find((u) => u.id === id);
  if (!user) {
    throw new Error("User not found.");
  }

  const salt = generateSalt();
  user.passwordHash = hashPassword(newPassword, salt);
  user.salt = salt;
  user.updatedAt = new Date().toISOString();

  saveData(data);

  addLog({
    userId: user.id,
    username: user.username,
    event: "password_updated",
    message: `Password updated for user "${user.username}".`,
  });

  return { success: true };
}

// ---------------- VOICE & ENTRY LOG OPERATIONS ----------------

export function createVoiceEntry({
  userId,
  username,
  voiceId,
  name,
  language,
  description = "",
  status = "created",
}) {
  const data = loadData();
  const now = new Date().toISOString();

  const newVoice = {
    id: "v-" + crypto.randomBytes(6).toString("hex"),
    userId,
    username,
    voiceId,
    name,
    language,
    description,
    status, // created | samples_added | verified | training | fine_tuned | failed
    sampleCount: 0,
    totalDurationSecs: 0,
    createdAt: now,
    updatedAt: now,
  };

  data.voices.unshift(newVoice);
  saveData(data);

  addLog({
    voiceId,
    userId,
    username,
    event: "voice_created",
    message: `Voice "${name}" (${language}) created with Voice ID ${voiceId}.`,
    metadata: { voiceId, name, language },
  });

  return newVoice;
}

export function updateVoiceEntry(voiceId, updates = {}) {
  const data = loadData();
  const voice = data.voices.find((v) => v.voiceId === voiceId);
  if (!voice) return null;

  Object.assign(voice, updates, { updatedAt: new Date().toISOString() });
  saveData(data);
  return voice;
}

export function getVoiceEntries({ userId = null, isAdmin = false } = {}) {
  const data = loadData();
  if (isAdmin || !userId) {
    return data.voices;
  }
  return data.voices.filter((v) => v.userId === userId);
}

export function getVoiceEntry(voiceId) {
  const data = loadData();
  return data.voices.find((v) => v.voiceId === voiceId) || null;
}

export function deleteVoiceEntry(voiceId, user) {
  const data = loadData();
  const target = data.voices.find((v) => v.voiceId === voiceId);
  if (!target) {
    throw new Error("Voice entry not found.");
  }
  if (user.role !== "admin" && target.userId !== user.id) {
    throw new Error("Unauthorized to delete this voice.");
  }

  data.voices = data.voices.filter((v) => v.voiceId !== voiceId);
  saveData(data);

  addLog({
    voiceId,
    userId: user.id,
    username: user.username,
    event: "voice_deleted",
    message: `Voice "${target.name}" (${voiceId}) deleted by ${user.username}.`,
  });

  return { success: true };
}

// ---------------- LOGGING OPERATIONS ----------------

export function addLog({
  voiceId = null,
  userId = "system",
  username = "system",
  event,
  message,
  metadata = {},
}) {
  const data = loadData();
  const entry = {
    id: "log-" + crypto.randomBytes(6).toString("hex"),
    voiceId,
    userId,
    username,
    event,
    message,
    metadata,
    timestamp: new Date().toISOString(),
  };

  data.logs.unshift(entry);
  // Cap logs at 500 entries in storage
  if (data.logs.length > 500) {
    data.logs = data.logs.slice(0, 500);
  }
  saveData(data);
  return entry;
}

export function getLogs({ userId = null, isAdmin = false, voiceId = null, limit = 100 } = {}) {
  const data = loadData();
  let filtered = data.logs;

  if (voiceId) {
    filtered = filtered.filter((l) => l.voiceId === voiceId);
  } else if (!isAdmin && userId) {
    filtered = filtered.filter((l) => l.userId === userId);
  }

  return filtered.slice(0, limit);
}
