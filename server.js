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
app.get("/dropper3d.js", (_req, res) => res.sendFile(path.join(__dirname, "dropper3d.js")));

const adminCode = process.env.ADMIN_CODE || process.env.SUPERADMIN_CODE;
const userCode = process.env.USER_CODE;
if (!adminCode || !userCode || adminCode === userCode) {
  throw new Error("Set distinct ADMIN_CODE (or legacy SUPERADMIN_CODE) and USER_CODE environment variables");
}

const users = Object.create(null);
users[adminCode] = { role: "admin", lockedDevice: null };
users[userCode] = { role: "user", lockedDevice: null };
const adminTokens = new Set();
const sessionTokens = new Map();
const MAX_LOGIN_HISTORY = 500;
const dataDirectory = process.env.DATA_DIR || path.join(__dirname, "data");
const dataFile = path.join(dataDirectory, "service-data.json");

function validateGameProgress(progress) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress) ||
      !Number.isInteger(progress.unlocked) || progress.unlocked < 1 || progress.unlocked > 50 ||
      !progress.bestTimes || typeof progress.bestTimes !== "object" || Array.isArray(progress.bestTimes) ||
      Object.keys(progress).some(key => !["unlocked", "bestTimes"].includes(key))) {
    return null;
  }
  const bestTimes = Object.create(null);
  for (const [level, seconds] of Object.entries(progress.bestTimes)) {
    if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(level) ||
        typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) {
      return null;
    }
    bestTimes[level] = seconds;
  }
  return { unlocked: progress.unlocked, bestTimes };
}

function emptyGameSaves() {
  return { dropper: { unlocked: 1, bestTimes: {} }, skyfall3d: { unlocked: 1, bestTimes: {} } };
}

function loadPersistentState() {
  fs.mkdirSync(dataDirectory, { recursive: true });
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    if (!Array.isArray(saved.loginHistory) ||
        !Array.isArray(saved.bannedDevices) ||
        !Array.isArray(saved.bannedIps) ||
        (saved.generatedUsers !== undefined && !Array.isArray(saved.generatedUsers)) ||
        (saved.lockedDevices !== undefined && !Array.isArray(saved.lockedDevices)) ||
        (saved.gameSaves !== undefined && (!saved.gameSaves || typeof saved.gameSaves !== "object" || Array.isArray(saved.gameSaves))) ||
        (saved.accountNames !== undefined && (!saved.accountNames || typeof saved.accountNames !== "object" || Array.isArray(saved.accountNames)))) {
      throw new Error("Stored service data has an invalid format");
    }
    const generatedUsers = Object.create(null);
    for (const account of saved.generatedUsers || []) {
      if (!account || typeof account.code !== "string" || !/^[a-f0-9]{8}$/i.test(account.code) ||
          !["admin", "user", "guest"].includes(account.role) ||
          Object.prototype.hasOwnProperty.call(generatedUsers, account.code)) {
        throw new Error("Stored generated users have an invalid format");
      }
      generatedUsers[account.code] = account.role === "admin" ? "user" : account.role;
    }
    const lockedDevices = [];
    const lockedCodes = new Set();
    for (const lock of saved.lockedDevices || []) {
      if (!lock || typeof lock.code !== "string" || !lock.code ||
          typeof lock.deviceID !== "string" || !lock.deviceID || lock.deviceID.length > 200 ||
          lockedCodes.has(lock.code)) {
        throw new Error("Stored device locks have an invalid format");
      }
      lockedCodes.add(lock.code);
      lockedDevices.push({ code: lock.code, deviceID: lock.deviceID });
    }
    const gameSaves = Object.create(null);
    for (const [code, savedGames] of Object.entries(saved.gameSaves || {})) {
      if (!code || code.length > 200 || !savedGames || typeof savedGames !== "object" || Array.isArray(savedGames)) {
        throw new Error("Stored game saves have an invalid format");
      }
      const games = emptyGameSaves();
      for (const [game, progress] of Object.entries(savedGames)) {
        if (!Object.prototype.hasOwnProperty.call(games, game)) {
          throw new Error("Stored game saves have an invalid format");
        }
        const validProgress = validateGameProgress(progress);
        if (!validProgress) throw new Error("Stored game saves have an invalid format");
        games[game] = validProgress;
      }
      gameSaves[code] = games;
    }
    const accountNames = Object.create(null);
    for (const [code, name] of Object.entries(saved.accountNames || {})) {
      if (!code || code.length > 200 || typeof name !== "string" || name.length > 40) {
        throw new Error("Stored account names have an invalid format");
      }
      accountNames[code] = name;
    }
    return {
      loginHistory: saved.loginHistory.slice(-MAX_LOGIN_HISTORY).map(login => {
        if (login?.role === "superadmin") return { ...login, role: "admin" };
        if (login?.role === "admin") return { ...login, role: "user" };
        return login;
      }),
      bannedDevices: new Set(saved.bannedDevices),
      bannedIps: new Set(saved.bannedIps),
      generatedUsers,
      lockedDevices,
      gameSaves,
      accountNames
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { loginHistory: [], bannedDevices: new Set(), bannedIps: new Set(), generatedUsers: Object.create(null), lockedDevices: [], gameSaves: Object.create(null), accountNames: Object.create(null) };
    }
    throw error;
  }
}

const persistentState = loadPersistentState();
for (const [code, role] of Object.entries(persistentState.generatedUsers)) {
  if (!Object.prototype.hasOwnProperty.call(users, code)) users[code] = { role, lockedDevice: null };
}
for (const lock of persistentState.lockedDevices) {
  if (Object.prototype.hasOwnProperty.call(users, lock.code)) users[lock.code].lockedDevice = lock.deviceID;
}
const loginHistory = persistentState.loginHistory;
const bannedDevices = persistentState.bannedDevices;
const bannedIps = persistentState.bannedIps;
const gameSaves = persistentState.gameSaves;
const accountNames = persistentState.accountNames;

function savePersistentState() {
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify({
    loginHistory,
    bannedDevices: Array.from(bannedDevices),
    bannedIps: Array.from(bannedIps),
    generatedUsers: Object.entries(users)
      .filter(([code]) => code !== adminCode && code !== userCode)
      .map(([code, user]) => ({ code, role: user.role })),
    lockedDevices: Object.entries(users)
      .filter(([, user]) => user.lockedDevice)
      .map(([code, user]) => ({ code, deviceID: user.lockedDevice })),
    gameSaves,
    accountNames
  }, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryFile, dataFile);
}

function normalizeIp(ip) {
  return ip && ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function requireAdmin(req, res, next) {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !adminTokens.has(token)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function requireSession(req, res, next) {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const code = token && sessionTokens.get(token);
  if (!code || !users[code]) return res.status(401).json({ error: "Sign in again to sync game progress" });
  req.userCode = code;
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/game-save", requireSession, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ...emptyGameSaves(), ...(gameSaves[req.userCode] || {}) });
});

app.put("/game-save", requireSession, (req, res) => {
  const { game, progress } = req.body || {};
  const newProgress = validateGameProgress(progress);
  if (!["dropper", "skyfall3d"].includes(game) || !newProgress) {
    return res.status(400).json({ error: "Invalid game progress" });
  }

  const previousGames = gameSaves[req.userCode];
  const games = previousGames || emptyGameSaves();
  const previousProgress = games[game];
  const bestTimes = { ...previousProgress.bestTimes };
  for (const [level, seconds] of Object.entries(newProgress.bestTimes)) {
    if (!bestTimes[level] || seconds < bestTimes[level]) bestTimes[level] = seconds;
  }
  games[game] = {
    unlocked: Math.max(previousProgress.unlocked, newProgress.unlocked),
    bestTimes
  };
  gameSaves[req.userCode] = games;
  try {
    savePersistentState();
  } catch (error) {
    if (previousGames) gameSaves[req.userCode] = previousGames;
    else delete gameSaves[req.userCode];
    if (previousGames) previousGames[game] = previousProgress;
    console.error("Could not save game progress:", error);
    return res.status(500).json({ error: "Could not save game progress" });
  }
  res.json(games[game]);
});

app.delete("/game-save/:game", requireSession, (req, res) => {
  const { game } = req.params;
  if (!["dropper", "skyfall3d"].includes(game)) {
    return res.status(400).json({ error: "Invalid game" });
  }
  const previousGames = gameSaves[req.userCode];
  const games = previousGames || emptyGameSaves();
  const previousProgress = games[game];
  games[game] = emptyGameSaves()[game];
  gameSaves[req.userCode] = games;
  try {
    savePersistentState();
  } catch (error) {
    if (previousGames) previousGames[game] = previousProgress;
    else delete gameSaves[req.userCode];
    console.error("Could not reset game progress:", error);
    return res.status(500).json({ error: "Could not reset game progress" });
  }
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

  const sessionToken = crypto.randomBytes(32).toString("hex");
  sessionTokens.set(sessionToken, code);
  const response = { ok: true, role: user.role, sessionToken };
  if (user.role === "admin") {
    adminTokens.add(sessionToken);
    response.adminToken = sessionToken;
  }
  res.json(response);
});

app.post("/generate", requireAdmin, (req, res) => {
  const role = req.body.role;
  if (!["user", "guest"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  let code;
  do {
    code = crypto.randomBytes(4).toString("hex");
  } while (users[code]);
  users[code] = { role, lockedDevice: null };
  try {
    savePersistentState();
  } catch (error) {
    delete users[code];
    console.error("Could not save generated code:", error);
    return res.status(500).json({ error: "Could not save generated code" });
  }
  res.json({ code });
});

app.get("/admin/users", requireAdmin, (_req, res) => {
  res.json(Object.fromEntries(Object.entries(users).map(([code, user]) => [
    code,
    { ...user, name: accountNames[code] || "" }
  ])));
});

app.post("/admin/user-name", requireAdmin, (req, res) => {
  const { code, name } = req.body || {};
  if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(users, code)) {
    return res.status(404).json({ error: "Code not found" });
  }
  if (typeof name !== "string" || name.length > 40 || name.trim() !== name) {
    return res.status(400).json({ error: "Name must be 40 characters or fewer with no surrounding spaces" });
  }
  const previousName = accountNames[code];
  if (name) accountNames[code] = name;
  else delete accountNames[code];
  try {
    savePersistentState();
  } catch (error) {
    if (previousName === undefined) delete accountNames[code];
    else accountNames[code] = previousName;
    console.error("Could not save account name:", error);
    return res.status(500).json({ error: "Could not save account name" });
  }
  res.json({ ok: true, name });
});

app.post("/admin/reset", requireAdmin, (req, res) => {
  const { code } = req.body;
  if (typeof code !== "string" || !users[code]) {
    return res.status(404).json({ error: "Code not found" });
  }
  const previousDevice = users[code].lockedDevice;
  users[code].lockedDevice = null;
  try {
    savePersistentState();
  } catch (error) {
    users[code].lockedDevice = previousDevice;
    console.error("Could not save device reset:", error);
    return res.status(500).json({ error: "Could not save device reset" });
  }
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
