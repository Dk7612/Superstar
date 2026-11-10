const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/games", (_req, res) => res.sendFile(path.join(__dirname, "games.html")));
app.get("/starfield.js", (_req, res) => res.sendFile(path.join(__dirname, "starfield.js")));
app.get("/dropper.js", (_req, res) => res.sendFile(path.join(__dirname, "dropper.js")));

const superadminCode = process.env.SUPERADMIN_CODE;
const userCode = process.env.USER_CODE;
if (!superadminCode || !userCode || superadminCode === userCode) {
  throw new Error("Set distinct SUPERADMIN_CODE and USER_CODE environment variables");
}

const users = {
  [superadminCode]: { role: "superadmin", lockedDevice: null },
  [userCode]: { role: "user", lockedDevice: null }
};
const adminTokens = new Set();
const MAX_LOGIN_HISTORY = 500;
const dataDirectory = process.env.DATA_DIR || path.join(__dirname, "data");
const dataFile = path.join(dataDirectory, "service-data.json");

function loadPersistentState() {
  fs.mkdirSync(dataDirectory, { recursive: true });
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    if (!Array.isArray(saved.loginHistory) ||
        !Array.isArray(saved.bannedDevices) ||
        !Array.isArray(saved.bannedIps)) {
      throw new Error("Stored service data has an invalid format");
    }
    return {
      loginHistory: saved.loginHistory.slice(-MAX_LOGIN_HISTORY),
      bannedDevices: new Set(saved.bannedDevices),
      bannedIps: new Set(saved.bannedIps)
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { loginHistory: [], bannedDevices: new Set(), bannedIps: new Set() };
    }
    throw error;
  }
}

const persistentState = loadPersistentState();
const loginHistory = persistentState.loginHistory;
const bannedDevices = persistentState.bannedDevices;
const bannedIps = persistentState.bannedIps;

function savePersistentState() {
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify({
    loginHistory,
    bannedDevices: Array.from(bannedDevices),
    bannedIps: Array.from(bannedIps)
  }, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryFile, dataFile);
}

function normalizeIp(ip) {
  return ip && ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function requireAdmin(req, res, next) {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !adminTokens.has(token)) {
    return res.status(403).json({ error: "Superadmin access required" });
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/login", (req, res) => {
  const body = req.body || {};
  const code = typeof body.code === "string" ? body.code : "";
  const deviceID = typeof body.deviceID === "string" ? body.deviceID : "";
  const ip = normalizeIp(req.ip);

  if (!deviceID || deviceID.length > 200) {
    return res.status(400).json({ ok: false, error: "Invalid device ID" });
  }
  if (bannedDevices.has(deviceID) || bannedIps.has(ip)) {
    return res.status(403).json({ ok: false, error: "This device or IP address is banned" });
  }

  const user = users[code];
  if (!user) {
    return res.status(401).json({ ok: false, error: "Invalid code" });
  }

  const previousDevice = user.lockedDevice;
  const previousHistory = loginHistory.slice();
  user.lockedDevice = deviceID;
  loginHistory.push({
    code,
    role: user.role,
    ip,
    deviceID,
    time: new Date().toISOString()
  });
  if (loginHistory.length > MAX_LOGIN_HISTORY) loginHistory.shift();
  try {
    savePersistentState();
  } catch (error) {
    loginHistory.splice(0, loginHistory.length, ...previousHistory);
    user.lockedDevice = previousDevice;
    console.error("Could not save login history:", error);
    return res.status(500).json({ ok: false, error: "Could not save login history" });
  }

  const response = { ok: true, role: user.role };
  if (user.role === "superadmin") {
    const token = crypto.randomBytes(32).toString("hex");
    adminTokens.add(token);
    response.adminToken = token;
  }
  res.json(response);
});

app.post("/generate", requireAdmin, (req, res) => {
  const role = req.body.role;
  if (!["admin", "user", "guest"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  let code;
  do {
    code = crypto.randomBytes(4).toString("hex");
  } while (users[code]);
  users[code] = { role, lockedDevice: null };
  res.json({ code });
});

app.get("/admin/users", requireAdmin, (_req, res) => {
  res.json(users);
});

app.post("/admin/reset", requireAdmin, (req, res) => {
  const { code } = req.body;
  if (typeof code !== "string" || !users[code]) {
    return res.status(404).json({ error: "Code not found" });
  }
  users[code].lockedDevice = null;
  res.json({ ok: true });
});

app.get("/admin/logins", requireAdmin, (_req, res) => {
  res.json(loginHistory.slice().reverse());
});

app.get("/admin/bans", requireAdmin, (_req, res) => {
  res.json({
    devices: Array.from(bannedDevices),
    ips: Array.from(bannedIps)
  });
});

app.post("/admin/bans", requireAdmin, (req, res) => {
  const { type, value } = req.body;
  if (typeof value !== "string" || !value || value.length > 200) {
    return res.status(400).json({ error: "Invalid ban value" });
  }
  let bannedSet;
  let normalizedValue = value;
  if (type === "ip") {
    const ip = normalizeIp(value);
    if (!net.isIP(ip)) return res.status(400).json({ error: "Invalid IP address" });
    bannedSet = bannedIps;
    normalizedValue = ip;
  } else if (type === "device") {
    bannedSet = bannedDevices;
  } else {
    return res.status(400).json({ error: "Invalid ban type" });
  }
  bannedSet.add(normalizedValue);
  try {
    savePersistentState();
  } catch (error) {
    bannedSet.delete(normalizedValue);
    console.error("Could not save ban:", error);
    return res.status(500).json({ error: "Could not save ban" });
  }
  res.json({ ok: true });
});

app.delete("/admin/bans", requireAdmin, (req, res) => {
  const { type, value } = req.body;
  if (typeof value !== "string" || !value) {
    return res.status(400).json({ error: "Invalid ban value" });
  }
  const bannedSet = type === "ip" ? bannedIps : type === "device" ? bannedDevices : null;
  if (!bannedSet) return res.status(400).json({ error: "Invalid ban type" });
  const normalizedValue = type === "ip" ? normalizeIp(value) : value;
  const wasBanned = bannedSet.delete(normalizedValue);
  try {
    savePersistentState();
  } catch (error) {
    if (wasBanned) bannedSet.add(normalizedValue);
    console.error("Could not save ban removal:", error);
    return res.status(500).json({ error: "Could not save ban removal" });
  }
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
