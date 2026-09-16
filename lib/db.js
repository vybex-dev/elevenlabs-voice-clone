import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getFirestore } from "./firebase.js";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "app_data.json");

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
}

function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function getInitialAdminData() {
  const adminSalt = generateSalt();
  const defaultAdminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const defaultAdminUsername = process.env.ADMIN_USERNAME || "admin";

  return {
    id: "admin-" + crypto.randomBytes(4).toString("hex"),
    username: defaultAdminUsername,
    passwordHash: hashPassword(defaultAdminPassword, adminSalt),
    salt: adminSalt,
    role: "admin",
    createdAt: new Date().toISOString(),
  };
}

// ---------------- LOCAL FILE STORAGE FALLBACK ----------------

let memoryData = null;

function loadLocalData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      const initial = {
        users: [getInitialAdminData()],
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
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf-8");
      memoryData = initial;
      return memoryData;
    }
    const content = fs.readFileSync(DB_FILE, "utf-8");
    memoryData = JSON.parse(content);
    if (!memoryData.users || memoryData.users.length === 0) {
      memoryData.users = [getInitialAdminData()];
      saveLocalData(memoryData);
    }
    if (!memoryData.voices) memoryData.voices = [];
    if (!memoryData.logs) memoryData.logs = [];
    return memoryData;
  } catch (err) {
    console.error("Error loading local DB file:", err);
    if (!memoryData) {
      memoryData = { users: [getInitialAdminData()], voices: [], logs: [] };
    }
    return memoryData;
  }
}

function saveLocalData(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    memoryData = data;
    const tempFile = `${DB_FILE}.${Date.now()}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error("Error saving local DB file:", err);
  }
}

// ---------------- FIRESTORE SEEDING ----------------

let firestoreInitialized = false;

async function ensureFirestoreAdmin(firestore) {
  if (firestoreInitialized) return;
  try {
    const usersSnap = await firestore.collection("users").limit(1).get();
    if (usersSnap.empty) {
      const defaultAdmin = getInitialAdminData();
      await firestore.collection("users").doc(defaultAdmin.id).set(defaultAdmin);
      await firestore.collection("logs").add({
        id: "log-" + crypto.randomBytes(6).toString("hex"),
        voiceId: null,
        userId: defaultAdmin.id,
        username: defaultAdmin.username,
        event: "system_initialized",
        message: "Firebase Firestore initialized with default administrator account.",
        timestamp: new Date().toISOString(),
        metadata: {},
      });
      console.log("Seeded default admin in Firestore.");
    }
    firestoreInitialized = true;
  } catch (err) {
    console.error("Error ensuring Firestore admin seed:", err);
  }
}

// ---------------- USER OPERATIONS ----------------

export async function getUserByUsername(username) {
  const clean = (username || "").trim().toLowerCase();
  const firestore = getFirestore();

  if (firestore) {
    await ensureFirestoreAdmin(firestore);
    const snap = await firestore.collection("users").get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.username && data.username.toLowerCase() === clean) {
        return { id: doc.id, ...data };
      }
    }
    return null;
  }

  const data = loadLocalData();
  return data.users.find((u) => u.username.toLowerCase() === clean) || null;
}

export async function getUserById(id) {
  const firestore = getFirestore();
  if (firestore) {
    const doc = await firestore.collection("users").doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  const data = loadLocalData();
  return data.users.find((u) => u.id === id) || null;
}

export async function getAllUsers() {
  const firestore = getFirestore();
  if (firestore) {
    await ensureFirestoreAdmin(firestore);
    const [usersSnap, voicesSnap] = await Promise.all([
      firestore.collection("users").orderBy("createdAt", "desc").get(),
      firestore.collection("voices").get(),
    ]);

    const voices = voicesSnap.docs.map((d) => d.data());
    return usersSnap.docs.map((doc) => {
      const u = doc.data();
      const userVoices = voices.filter((v) => v.userId === doc.id || v.userId === u.id);
      return {
        id: doc.id,
        username: u.username,
        role: u.role,
        createdAt: u.createdAt,
        voicesCount: userVoices.length,
      };
    });
  }

  const data = loadLocalData();
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

export async function verifyUserPassword(username, password) {
  const user = await getUserByUsername(username);
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

export async function createUser({ username, password, role = "user" }) {
  const cleanUsername = (username || "").trim();
  if (!cleanUsername) {
    throw new Error("Username is required.");
  }
  if (!password || password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }

  const existing = await getUserByUsername(cleanUsername);
  if (existing) {
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

  const firestore = getFirestore();
  if (firestore) {
    await firestore.collection("users").doc(newUser.id).set(newUser);
  } else {
    const data = loadLocalData();
    data.users.push(newUser);
    saveLocalData(data);
  }

  await addLog({
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

export async function deleteUser(id) {
  const firestore = getFirestore();

  if (firestore) {
    const targetDoc = await firestore.collection("users").doc(id).get();
    if (!targetDoc.exists) throw new Error("User not found.");
    const target = targetDoc.data();

    if (target.role === "admin") {
      const adminSnap = await firestore.collection("users").where("role", "==", "admin").get();
      if (adminSnap.size <= 1) {
        throw new Error("Cannot delete the only administrator account.");
      }
    }

    await firestore.collection("users").doc(id).delete();

    await addLog({
      userId: id,
      username: target.username,
      event: "user_deleted",
      message: `User account "${target.username}" was deleted by administrator.`,
    });

    return { success: true };
  }

  const data = loadLocalData();
  const target = data.users.find((u) => u.id === id);
  if (!target) throw new Error("User not found.");

  if (target.role === "admin") {
    const adminCount = data.users.filter((u) => u.role === "admin").length;
    if (adminCount <= 1) {
      throw new Error("Cannot delete the only administrator account.");
    }
  }

  data.users = data.users.filter((u) => u.id !== id);
  saveLocalData(data);

  await addLog({
    userId: target.id,
    username: target.username,
    event: "user_deleted",
    message: `User account "${target.username}" was deleted by administrator.`,
  });

  return { success: true };
}

export async function updateUserPassword(id, newPassword) {
  if (!newPassword || newPassword.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(newPassword, salt);
  const updatedAt = new Date().toISOString();

  const firestore = getFirestore();
  if (firestore) {
    const targetDoc = await firestore.collection("users").doc(id).get();
    if (!targetDoc.exists) throw new Error("User not found.");
    const target = targetDoc.data();

    await firestore.collection("users").doc(id).update({
      passwordHash,
      salt,
      updatedAt,
    });

    await addLog({
      userId: id,
      username: target.username,
      event: "password_updated",
      message: `Password updated for user "${target.username}".`,
    });

    return { success: true };
  }

  const data = loadLocalData();
  const user = data.users.find((u) => u.id === id);
  if (!user) throw new Error("User not found.");

  user.passwordHash = passwordHash;
  user.salt = salt;
  user.updatedAt = updatedAt;

  saveLocalData(data);

  await addLog({
    userId: user.id,
    username: user.username,
    event: "password_updated",
    message: `Password updated for user "${user.username}".`,
  });

  return { success: true };
}

// ---------------- VOICE & ENTRY LOG OPERATIONS ----------------

export async function createVoiceEntry({
  userId,
  username,
  voiceId,
  name,
  language,
  description = "",
  status = "created",
}) {
  const now = new Date().toISOString();
  const newVoice = {
    id: "v-" + crypto.randomBytes(6).toString("hex"),
    userId,
    username,
    voiceId,
    name,
    language,
    description,
    status,
    sampleCount: 0,
    totalDurationSecs: 0,
    createdAt: now,
    updatedAt: now,
  };

  const firestore = getFirestore();
  if (firestore) {
    await firestore.collection("voices").doc(voiceId).set(newVoice);
  } else {
    const data = loadLocalData();
    data.voices.unshift(newVoice);
    saveLocalData(data);
  }

  await addLog({
    voiceId,
    userId,
    username,
    event: "voice_created",
    message: `Voice "${name}" (${language}) created with Voice ID ${voiceId}.`,
    metadata: { voiceId, name, language },
  });

  return newVoice;
}

export async function updateVoiceEntry(voiceId, updates = {}) {
  const now = new Date().toISOString();
  const firestore = getFirestore();

  if (firestore) {
    const docRef = firestore.collection("voices").doc(voiceId);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    await docRef.update({ ...updates, updatedAt: now });
    return { ...doc.data(), ...updates, updatedAt: now };
  }

  const data = loadLocalData();
  const voice = data.voices.find((v) => v.voiceId === voiceId);
  if (!voice) return null;

  Object.assign(voice, updates, { updatedAt: now });
  saveLocalData(data);
  return voice;
}

export async function getVoiceEntries({ userId = null, isAdmin = false } = {}) {
  const firestore = getFirestore();
  if (firestore) {
    let query = firestore.collection("voices").orderBy("createdAt", "desc");
    if (!isAdmin && userId) {
      query = firestore
        .collection("voices")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc");
    }
    const snap = await query.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const data = loadLocalData();
  if (isAdmin || !userId) {
    return data.voices;
  }
  return data.voices.filter((v) => v.userId === userId);
}

export async function getVoiceEntry(voiceId) {
  const firestore = getFirestore();
  if (firestore) {
    const doc = await firestore.collection("voices").doc(voiceId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  const data = loadLocalData();
  return data.voices.find((v) => v.voiceId === voiceId) || null;
}

export async function deleteVoiceEntry(voiceId, user) {
  const voice = await getVoiceEntry(voiceId);
  if (!voice) {
    throw new Error("Voice entry not found.");
  }
  if (user.role !== "admin" && voice.userId !== user.id) {
    throw new Error("Unauthorized to delete this voice.");
  }

  const firestore = getFirestore();
  if (firestore) {
    await firestore.collection("voices").doc(voiceId).delete();
  } else {
    const data = loadLocalData();
    data.voices = data.voices.filter((v) => v.voiceId !== voiceId);
    saveLocalData(data);
  }

  await addLog({
    voiceId,
    userId: user.id,
    username: user.username,
    event: "voice_deleted",
    message: `Voice "${voice.name}" (${voiceId}) deleted by ${user.username}.`,
  });

  return { success: true };
}

// ---------------- LOGGING OPERATIONS ----------------

export async function addLog({
  voiceId = null,
  userId = "system",
  username = "system",
  event,
  message,
  metadata = {},
}) {
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

  const firestore = getFirestore();
  if (firestore) {
    await firestore.collection("logs").doc(entry.id).set(entry);
    return entry;
  }

  const data = loadLocalData();
  data.logs.unshift(entry);
  if (data.logs.length > 500) {
    data.logs = data.logs.slice(0, 500);
  }
  saveLocalData(data);
  return entry;
}

export async function getLogs({ userId = null, isAdmin = false, voiceId = null, limit = 100 } = {}) {
  const firestore = getFirestore();
  if (firestore) {
    let query = firestore.collection("logs").orderBy("timestamp", "desc").limit(limit);
    if (voiceId) {
      query = firestore
        .collection("logs")
        .where("voiceId", "==", voiceId)
        .orderBy("timestamp", "desc")
        .limit(limit);
    } else if (!isAdmin && userId) {
      query = firestore
        .collection("logs")
        .where("userId", "==", userId)
        .orderBy("timestamp", "desc")
        .limit(limit);
    }
    const snap = await query.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const data = loadLocalData();
  let filtered = data.logs;

  if (voiceId) {
    filtered = filtered.filter((l) => l.voiceId === voiceId);
  } else if (!isAdmin && userId) {
    filtered = filtered.filter((l) => l.userId === userId);
  }

  return filtered.slice(0, limit);
}
