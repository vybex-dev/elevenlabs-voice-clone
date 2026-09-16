import crypto from "crypto";
import { getUserById } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "elevenlabs-voice-clone-secret-key-2026";
const COOKIE_NAME = "vc_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

export function createSessionToken(user) {
  const header = JSON.stringify({ alg: "HS256", typ: "JWT" });
  const payload = JSON.stringify({
    sub: user.id,
    username: user.username,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  });

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;

  cookieHeader.split(";").forEach((cookie) => {
    let [name, ...rest] = cookie.split("=");
    name = name?.trim();
    if (!name) return;
    const value = rest.join("=").trim();
    list[name] = decodeURIComponent(value);
  });

  return list;
}

export function getSessionUser(req) {
  let cookieHeader = "";
  if (req.headers && req.headers.cookie) {
    cookieHeader = req.headers.cookie;
  } else if (req.headers && typeof req.headers.get === "function") {
    cookieHeader = req.headers.get("cookie") || "";
  }

  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const session = verifySessionToken(token);
  if (!session || !session.sub) return null;

  const user = getUserById(session.sub);
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export function createAuthCookieHeader(token) {
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export function createLogoutCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function requireAuth(handler) {
  return async (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      if (res && typeof res.status === "function") {
        return res.status(401).json({ error: "Unauthorized. Please log in to continue." });
      }
      return new Response(JSON.stringify({ error: "Unauthorized. Please log in to continue." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    req.user = user;
    return handler(req, res);
  };
}

export function requireAdmin(handler) {
  return async (req, res) => {
    const user = getSessionUser(req);
    if (!user) {
      if (res && typeof res.status === "function") {
        return res.status(401).json({ error: "Unauthorized. Please log in to continue." });
      }
      return new Response(JSON.stringify({ error: "Unauthorized. Please log in to continue." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (user.role !== "admin") {
      if (res && typeof res.status === "function") {
        return res.status(403).json({ error: "Forbidden. Administrator privileges required." });
      }
      return new Response(JSON.stringify({ error: "Forbidden. Administrator privileges required." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    req.user = user;
    return handler(req, res);
  };
}
