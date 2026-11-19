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
app.get("/physics3d.js", (_req, res) => res.sendFile(path.join(__dirname, "physics3d.js")));
app.get("/dropper3d.js", (_req, res) => res.sendFile(path.join(__dirname, "dropper3d.js")));
app.get("/favicon.png", (_req, res) => res.sendFile(path.join(__dirname, "favicon.png")));
app.get("/ideas", (_req, res) => res.sendFile(path.join(__dirname, "ideas.html")));

const adminCode = process.env.ADMIN_CODE || process.env.SUPERADMIN_CODE;
const userCode = process.env.USER_CODE;
const PERMISSION_KEYS = ["dashboard", "games", "extension", "ai", "ideas"];
const ALL_GUEST_PERMISSIONS = { dashboard: true, games: true, extension: true, ai: true, ideas: true };
function validPermissions(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).every(key => PERMISSION_KEYS.includes(key)) &&
    PERMISSION_KEYS.every(key => typeof value[key] === "boolean");
}
function effectivePermissions(code) {
  return { ...ALL_GUEST_PERMISSIONS, ...defaultGuestPermissions, ...(guestPermissions[code] || {}) };
}
if (!adminCode) {
  throw new Error("Set ADMIN_CODE (or legacy SUPERADMIN_CODE) environment variable");
}

const users = Object.create(null);
users[adminCode] = { role: "admin", lockedDevice: null };
const sessionTokens = new Map();
const MAX_LOGIN_HISTORY = 500;
const MAX_TRUSTED_ADMIN_DEVICES = 20;
const TRUSTED_ADMIN_COOKIE = "superstar_admin_trust";
const TRUSTED_ADMIN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
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
        (saved.trustedAdminDevices !== undefined && !Array.isArray(saved.trustedAdminDevices)) ||
        (saved.authSessions !== undefined && !Array.isArray(saved.authSessions)) ||
        (saved.gameSaves !== undefined && (!saved.gameSaves || typeof saved.gameSaves !== "object" || Array.isArray(saved.gameSaves))) ||
        (saved.accountNames !== undefined && (!saved.accountNames || typeof saved.accountNames !== "object" || Array.isArray(saved.accountNames))) ||
        (saved.guestPermissions !== undefined && (!saved.guestPermissions || typeof saved.guestPermissions !== "object" || Array.isArray(saved.guestPermissions))) ||
        (saved.defaultGuestPermissions !== undefined && !validPermissions(saved.defaultGuestPermissions))) {
      throw new Error("Stored service data has an invalid format");
    }
    const generatedUsers = Object.create(null);
    const generatedUserOrder = [];
    for (const account of saved.generatedUsers || []) {
      if (!account || typeof account.code !== "string" ||
          !(/^[a-f0-9]{8}$/i.test(account.code) || /^[A-Za-z0-9_-]{4,32}$/.test(account.code)) ||
          !["admin", "user", "guest"].includes(account.role) ||
          Object.prototype.hasOwnProperty.call(generatedUsers, account.code)) {
        throw new Error("Stored generated users have an invalid format");
      }
      generatedUsers[account.code] = "guest";
      generatedUserOrder.push(account.code);
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
    const guestPermissions = Object.create(null);
    for (const [code, permissions] of Object.entries(saved.guestPermissions || {})) {
      if (!generatedUsers[code] || !permissions || typeof permissions !== "object" || Array.isArray(permissions) ||
          Object.keys(permissions).some(key => !PERMISSION_KEYS.includes(key)) ||
          Object.values(permissions).some(value => typeof value !== "boolean")) throw new Error("Stored guest permissions have an invalid format");
      guestPermissions[code] = { ...permissions };
    }
    const accountNames = Object.create(null);
    for (const [code, name] of Object.entries(saved.accountNames || {})) {
      if (!code || code.length > 200 || typeof name !== "string" || name.length > 40) {
        throw new Error("Stored account names have an invalid format");
      }
      accountNames[code] = name;
    }
    const trustedAdminDevices = [];
    for (const trustedDevice of saved.trustedAdminDevices || []) {
      if (!trustedDevice || typeof trustedDevice.tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(trustedDevice.tokenHash) ||
          typeof trustedDevice.deviceID !== "string" || !trustedDevice.deviceID || trustedDevice.deviceID.length > 200 ||
          typeof trustedDevice.code !== "string" || !trustedDevice.code ||
          !Number.isInteger(trustedDevice.expiresAt) || trustedDevice.expiresAt <= 0) {
        throw new Error("Stored trusted admin devices have an invalid format");
      }
      if (trustedDevice.code === adminCode && trustedDevice.expiresAt > Date.now()) {
        trustedAdminDevices.push(trustedDevice);
      }
    }
    const authSessions = [];
    for (const session of saved.authSessions || []) {
      if (!session || typeof session.tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(session.tokenHash) ||
          typeof session.code !== "string" || !session.code ||
          !Number.isInteger(session.expiresAt) || session.expiresAt <= 0) {
        throw new Error("Stored authentication sessions have an invalid format");
      }
      if ((session.code === adminCode || Object.prototype.hasOwnProperty.call(generatedUsers, session.code)) &&
          session.expiresAt > Date.now()) {
        authSessions.push(session);
      }
    }
    return {
      loginHistory: saved.loginHistory.slice(-MAX_LOGIN_HISTORY).map(login => {
        if (login?.code === adminCode) return { ...login, role: "admin" };
        if (login?.role === "superadmin" || login?.role === "admin" || login?.role === "user") {
          return { ...login, role: "guest" };
        }
        return login;
      }),
      bannedDevices: new Set(saved.bannedDevices),
      bannedIps: new Set(saved.bannedIps),
      generatedUsers,
      generatedUserOrder,
      lockedDevices,
      gameSaves,
      accountNames,
      guestPermissions,
      defaultGuestPermissions: { ...ALL_GUEST_PERMISSIONS, ...(saved.defaultGuestPermissions || {}) },
      trustedAdminDevices,
      authSessions
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { loginHistory: [], bannedDevices: new Set(), bannedIps: new Set(), generatedUsers: Object.create(null), generatedUserOrder: [], lockedDevices: [], gameSaves: Object.create(null), accountNames: Object.create(null), guestPermissions: Object.create(null), defaultGuestPermissions: { ...ALL_GUEST_PERMISSIONS }, trustedAdminDevices: [], authSessions: [] };
    }
    throw error;
  }
}

const persistentState = loadPersistentState();
const generatedUserOrder = persistentState.generatedUserOrder.filter(code => code !== userCode);
for (const code of generatedUserOrder) {
  const role = persistentState.generatedUsers[code];
  if (code !== userCode && !Object.prototype.hasOwnProperty.call(users, code)) users[code] = { role, lockedDevice: null };
}
for (const lock of persistentState.lockedDevices) {
  if (Object.prototype.hasOwnProperty.call(users, lock.code)) users[lock.code].lockedDevice = lock.deviceID;
}
const loginHistory = persistentState.loginHistory;
const bannedDevices = persistentState.bannedDevices;
const bannedIps = persistentState.bannedIps;
const gameSaves = persistentState.gameSaves;
const accountNames = persistentState.accountNames;
const guestPermissions = persistentState.guestPermissions;
let defaultGuestPermissions = persistentState.defaultGuestPermissions;
const trustedAdminDevices = persistentState.trustedAdminDevices;
for (const session of persistentState.authSessions) {
  sessionTokens.set(session.tokenHash, { code: session.code, expiresAt: session.expiresAt });
}

function savePersistentState() {
  for (const [tokenHash, session] of sessionTokens) {
    if (session.expiresAt <= Date.now() || !users[session.code]) sessionTokens.delete(tokenHash);
  }
  const temporaryFile = `${dataFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify({
    loginHistory,
    bannedDevices: Array.from(bannedDevices),
    bannedIps: Array.from(bannedIps),
    generatedUsers: generatedUserOrder
      .filter(code => code !== adminCode && code !== userCode && users[code])
      .map(code => ({ code, role: users[code].role })),
    lockedDevices: Object.entries(users)
      .filter(([, user]) => user.lockedDevice)
      .map(([code, user]) => ({ code, deviceID: user.lockedDevice })),
    gameSaves,
    accountNames,
    guestPermissions,
    defaultGuestPermissions,
    trustedAdminDevices,
    authSessions: Array.from(sessionTokens, ([tokenHash, session]) => ({
      tokenHash,
      code: session.code,
      expiresAt: session.expiresAt
    }))
  }, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryFile, dataFile);
}

function normalizeIp(ip) {
  return ip && ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function requireAdmin(req, res, next) {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const session = token && sessionTokens.get(hashTrustedToken(token));
  if (!session || session.expiresAt <= Date.now() || session.code !== adminCode || users[session.code]?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function requireSession(req, res, next) {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const session = token && sessionTokens.get(hashTrustedToken(token));
  if (!session || session.expiresAt <= Date.now() || !users[session.code]) {
    return res.status(401).json({ error: "Sign in again to sync game progress" });
  }
  req.userCode = session.code;
  next();
}

function requireFeaturePermission(feature) {
  return (req, res, next) => requireSession(req, res, () => {
    if (users[req.userCode]?.role === "admin" || effectivePermissions(req.userCode)[feature] === true) return next();
    return res.status(403).json({ error: "This feature is disabled for this access code." });
  });
}

function trustedAdminCookieOptions(req) {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: "lax",
    path: "/"
  };
}

function readCookie(req, name) {
  const prefix = `${name}=`;
  const value = (req.get("cookie") || "").split(";").map(part => part.trim()).find(part => part.startsWith(prefix));
  return value ? value.slice(prefix.length) : "";
}

function hashTrustedToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function issueSessionTokens(code) {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashTrustedToken(sessionToken);
  const session = { code, expiresAt: Date.now() + SESSION_MAX_AGE };
  sessionTokens.set(tokenHash, session);
  try {
    savePersistentState();
  } catch (error) {
    sessionTokens.delete(tokenHash);
    console.error("Could not save authentication session:", error);
    throw new Error("Could not save login session");
  }
  const response = { role: users[code].role, sessionToken };
  if (users[code].role === "admin") response.adminToken = sessionToken;
  return response;
}

function rememberTrustedAdminDevice(req, res, deviceID) {
  const trustedToken = crypto.randomBytes(32).toString("hex");
  const previousTrustedDevices = trustedAdminDevices.slice();
  const now = Date.now();
  const retainedDevices = trustedAdminDevices
    .filter(device => device.deviceID !== deviceID && device.expiresAt > now)
    .slice(-(MAX_TRUSTED_ADMIN_DEVICES - 1));
  trustedAdminDevices.splice(0, trustedAdminDevices.length, ...retainedDevices, {
    tokenHash: hashTrustedToken(trustedToken),
    deviceID,
    code: adminCode,
    expiresAt: now + TRUSTED_ADMIN_MAX_AGE
  });
  try {
    savePersistentState();
  } catch (error) {
    trustedAdminDevices.splice(0, trustedAdminDevices.length, ...previousTrustedDevices);
    console.error("Could not remember trusted admin device:", error);
    return false;
  }
  res.cookie(TRUSTED_ADMIN_COOKIE, trustedToken, {
    ...trustedAdminCookieOptions(req),
    maxAge: TRUSTED_ADMIN_MAX_AGE
  });
  return true;
}

function revokeTrustedAdminCookie(req, res) {
  const token = readCookie(req, TRUSTED_ADMIN_COOKIE);
  if (token) {
    const tokenHash = hashTrustedToken(token);
    const index = trustedAdminDevices.findIndex(device => device.tokenHash === tokenHash);
    if (index !== -1) {
      const [removed] = trustedAdminDevices.splice(index, 1);
      try {
        savePersistentState();
      } catch (error) {
        trustedAdminDevices.splice(index, 0, removed);
        console.error("Could not revoke trusted admin device:", error);
        return false;
      }
    }
  }
  res.clearCookie(TRUSTED_ADMIN_COOKIE, trustedAdminCookieOptions(req));
  return true;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/session/trusted-device/enroll", requireAdmin, (req, res) => {
  const deviceID = req.get("x-device-id") || "";
  const ip = normalizeIp(req.ip);
  if (!deviceID || deviceID.length > 200 ||
      users[adminCode].lockedDevice !== deviceID ||
      bannedDevices.has(deviceID) || bannedIps.has(ip)) {
    return res.status(403).json({ ok: false, error: "Could not trust this device" });
  }
  if (!rememberTrustedAdminDevice(req, res, deviceID)) {
    return res.status(500).json({ ok: false, error: "Could not remember this device" });
  }
  res.set("Cache-Control", "no-store");
  res.json({ ok: true });
});

app.post("/session/trusted-device/revoke", (req, res) => {
  const token = readCookie(req, TRUSTED_ADMIN_COOKIE);
  const deviceID = req.get("x-device-id") || "";
  const tokenHash = token ? hashTrustedToken(token) : "";
  const trustedDevice = trustedAdminDevices.find(device => device.tokenHash === tokenHash);
  if (trustedDevice && trustedDevice.deviceID === deviceID) {
    if (!revokeTrustedAdminCookie(req, res)) {
      return res.status(500).json({ ok: false, error: "Could not revoke trusted admin device" });
    }
  } else {
    res.clearCookie(TRUSTED_ADMIN_COOKIE, trustedAdminCookieOptions(req));
  }
  res.set("Cache-Control", "no-store");
  res.json({ ok: true });
});

app.get("/session/restore", (req, res) => {
  const token = readCookie(req, TRUSTED_ADMIN_COOKIE);
  const deviceID = req.get("x-device-id") || "";
  const tokenHash = token ? hashTrustedToken(token) : "";
  const tokenRecord = trustedAdminDevices.find(device => device.tokenHash === tokenHash);
  if (tokenRecord &&
      tokenRecord.code === adminCode &&
      tokenRecord.expiresAt > Date.now() &&
      tokenRecord.deviceID !== deviceID) {
    res.set("Cache-Control", "no-store");
    return res.status(401).json({ ok: false });
  }
  const trustedDevice = trustedAdminDevices.find(device =>
    device.tokenHash === tokenHash &&
    device.code === adminCode &&
    device.deviceID === deviceID &&
    device.expiresAt > Date.now()
  );
  if (!trustedDevice) {
    res.set("Cache-Control", "no-store");
    if (!revokeTrustedAdminCookie(req, res)) {
      return res.status(500).json({ ok: false, error: "Could not revoke trusted admin device" });
    }
    return res.status(401).json({ ok: false });
  }
  const ip = normalizeIp(req.ip);
  if (bannedDevices.has(deviceID) || bannedIps.has(ip)) {
    if (!revokeTrustedAdminCookie(req, res)) {
      return res.status(500).json({ ok: false, error: "Could not revoke trusted admin device" });
    }
    return res.status(403).json({ ok: false, error: "This device or IP address is banned" });
  }
  const previousExpiry = trustedDevice.expiresAt;
  trustedDevice.expiresAt = Date.now() + TRUSTED_ADMIN_MAX_AGE;
  try {
    savePersistentState();
  } catch (error) {
    trustedDevice.expiresAt = previousExpiry;
    console.error("Could not renew trusted admin device:", error);
    return res.status(500).json({ ok: false, error: "Could not renew trusted admin device" });
  }
  res.set("Cache-Control", "no-store");
  res.cookie(TRUSTED_ADMIN_COOKIE, token, {
    ...trustedAdminCookieOptions(req),
    maxAge: TRUSTED_ADMIN_MAX_AGE
  });
  try {
    res.json({ ok: true, ...issueSessionTokens(adminCode), remembered: true });
  } catch {
    res.status(500).json({ ok: false, error: "Could not save login session" });
  }
});

app.get("/account/permissions", requireSession, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(effectivePermissions(req.userCode));
});

app.get("/game-save", requireFeaturePermission("games"), (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ...emptyGameSaves(), ...(gameSaves[req.userCode] || {}) });
});

app.put("/game-save", requireFeaturePermission("games"), (req, res) => {
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

app.delete("/game-save/:game", requireFeaturePermission("games"), (req, res) => {
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

  if (user.role === "admin" && body.rememberDevice === true) {
    if (!rememberTrustedAdminDevice(req, res, deviceID)) {
      return res.status(500).json({ ok: false, error: "Could not remember this device" });
    }
  } else if (readCookie(req, TRUSTED_ADMIN_COOKIE) && !revokeTrustedAdminCookie(req, res)) {
    return res.status(500).json({ ok: false, error: "Could not revoke trusted admin device" });
  }
  try {
    res.json({
      ok: true,
      ...issueSessionTokens(code),
      remembered: user.role === "admin" && body.rememberDevice === true
    });
  } catch {
    res.status(500).json({ ok: false, error: "Could not save login session" });
  }
});

app.post("/generate", requireAdmin, (req, res) => {
  const body = req.body || {};
  if (body.role !== "guest") {
    return res.status(400).json({ error: "Invalid role" });
  }

  let code;
  if (body.code !== undefined && body.code !== "") {
    if (typeof body.code !== "string" || !/^[A-Za-z0-9_-]{4,32}$/.test(body.code)) {
      return res.status(400).json({ error: "Custom codes must be 4-32 characters using letters, numbers, hyphens, or underscores" });
    }
    code = body.code;
    if (Object.prototype.hasOwnProperty.call(users, code)) {
      return res.status(409).json({ error: "That code is already in use" });
    }
  } else {
    do {
      code = crypto.randomBytes(4).toString("hex");
    } while (Object.prototype.hasOwnProperty.call(users, code));
  }
  users[code] = { role: "guest", lockedDevice: null };
  guestPermissions[code] = { ...defaultGuestPermissions };
  generatedUserOrder.push(code);
  try {
    savePersistentState();
  } catch (error) {
    delete users[code];
    delete guestPermissions[code];
    generatedUserOrder.pop();
    console.error("Could not save generated code:", error);
    return res.status(500).json({ error: "Could not save generated code" });
  }
  res.json({ code });
});

app.get("/admin/users", requireAdmin, (_req, res) => {
  res.json(generatedUserOrder
    .filter(code => code !== adminCode && code !== userCode && users[code])
    .map(code => ({ code, ...users[code], name: accountNames[code] || "", permissions: effectivePermissions(code) })));
});

app.get("/admin/permissions", requireAdmin, (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ defaults: defaultGuestPermissions });
});
app.put("/admin/permissions/defaults", requireAdmin, (req, res) => {
  const permissions = req.body?.permissions;
  if (!validPermissions(permissions) || Object.keys(permissions).length !== PERMISSION_KEYS.length)
    return res.status(400).json({ error: "Provide a boolean value for every guest permission." });
  const previous = defaultGuestPermissions;
  defaultGuestPermissions = { ...permissions };
  try { savePersistentState(); } catch (error) {
    defaultGuestPermissions = previous;
    console.error("Could not save default guest permissions:", error);
    return res.status(500).json({ error: "Could not save default guest permissions." });
  }
  res.json({ ok: true, defaults: defaultGuestPermissions });
});
app.put("/admin/user-permissions", requireAdmin, (req, res) => {
  const { code, permissions } = req.body || {};
  if (typeof code !== "string" || users[code]?.role !== "guest" || !generatedUserOrder.includes(code))
    return res.status(404).json({ error: "Guest access code not found." });
  if (!validPermissions(permissions) || Object.keys(permissions).length !== PERMISSION_KEYS.length)
    return res.status(400).json({ error: "Provide a boolean value for every guest permission." });
  const previous = guestPermissions[code];
  guestPermissions[code] = { ...permissions };
  try { savePersistentState(); } catch (error) {
    if (previous === undefined) delete guestPermissions[code]; else guestPermissions[code] = previous;
    console.error("Could not save guest permissions:", error);
    return res.status(500).json({ error: "Could not save guest permissions." });
  }
  res.json({ ok: true, permissions: effectivePermissions(code) });
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


// Superstar Gimkit AI helper. The API key stays on the server and is never sent to browsers.
const geminiApiKey = process.env.GEMINI_API_KEY;
// Public suggestions are stored on the persistent DATA_DIR volume.
const ideasFile = path.join(dataDirectory, "ideas.json");
const MAX_IDEAS = 2000;
function loadIdeas() {
  try {
    const items = JSON.parse(fs.readFileSync(ideasFile, "utf8"));
    if (!Array.isArray(items) || items.length > MAX_IDEAS || items.some(x =>
      !x || typeof x.id !== "string" || typeof x.title !== "string" ||
      typeof x.originalTitle !== "string" || typeof x.description !== "string" ||
      typeof x.summary !== "string" || typeof x.category !== "string" ||
      typeof x.createdAt !== "string")) throw new Error("Stored ideas have an invalid format");
    return items;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
let submittedIdeas = loadIdeas();
function saveIdeas() {
  const tmp = ideasFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(submittedIdeas, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, ideasFile);
}
const ideaBuckets = new Map();
app.post("/api/ideas", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!geminiApiKey) return res.status(503).json({ error: "Idea submissions are temporarily unavailable." });
  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!title || title.length > 100 || !description || description.length > 2000)
    return res.status(400).json({ error: "Add a title (up to 100 characters) and description (up to 2,000 characters)." });
  if (submittedIdeas.length >= MAX_IDEAS) return res.status(503).json({ error: "The idea inbox is full." });
  const now = Date.now(), ip = normalizeIp(req.ip) || "unknown";
  const bucket = ideaBuckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start >= 3600000) { bucket.start = now; bucket.count = 0; }
  if (++bucket.count > 5) return res.status(429).json({ error: "Please wait before submitting another idea." });
  ideaBuckets.set(ip, bucket);
  const prompt = [
    "You organize feature requests for the website Superstar.",
    "Summarize the suggestion faithfully and do not invent requested features.",
    "Return JSON with exactly title (short), summary (2-4 concise actionable sentences), category.",
    "Category must be one of: Website, Games, AI, Browser extension, Other.",
    "Visitor title: " + title, "Visitor description: " + description
  ].join("\n");
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(geminiApiKey), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: {
          title: { type: "STRING" }, summary: { type: "STRING" },
          category: { type: "STRING", enum: ["Website", "Games", "AI", "Browser extension", "Other"] }
        }, required: ["title", "summary", "category"] },
        temperature: 0.2, maxOutputTokens: 260
      }}),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini idea summary returned", response.status, detail.slice(0, 300));
      return res.status(response.status === 429 ? 429 : 502).json({ error: "Could not summarize your idea right now. Please try again later." });
    }
    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    let result;
    try { result = JSON.parse(raw); } catch { return res.status(502).json({ error: "The AI summary could not be processed. Please try again." }); }
    const categories = ["Website", "Games", "AI", "Browser extension", "Other"];
    if (typeof result.title !== "string" || typeof result.summary !== "string" || !categories.includes(result.category))
      return res.status(502).json({ error: "The AI summary was incomplete. Please try again." });
    const idea = { id: crypto.randomUUID(), title: result.title.trim().slice(0, 120) || title,
      originalTitle: title, description, summary: result.summary.trim().slice(0, 1200),
      category: result.category, createdAt: new Date().toISOString() };
    submittedIdeas.unshift(idea);
    try { saveIdeas(); } catch (error) {
      submittedIdeas.shift(); console.error("Could not save feature idea:", error);
      return res.status(500).json({ error: "Your idea could not be saved. Please try again." });
    }
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("Feature idea submission failed:", error.message);
    return res.status(502).json({ error: "Could not reach the AI service. Please try again later." });
  }
});
app.get("/admin/ideas", requireAdmin, (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(submittedIdeas);
});

const aiRequestBuckets = new Map();
const AI_WINDOW_MS = 60_000;
const AI_MAX_REQUESTS = 20;

// General conversational Superstar AI. Conversation history is supplied by the popup; the API key stays server-side.
app.post("/api/ai/chat", requireFeaturePermission("ai"), async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!geminiApiKey) {
    return res.status(503).json({ error: "AI is not configured yet. Add GEMINI_API_KEY to the Render environment." });
  }

  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = rawMessages.slice(-12).map(item => ({
    role: item?.role === "assistant" ? "model" : item?.role === "user" ? "user" : "",
    text: typeof item?.content === "string" ? item.content.trim() : ""
  }));
  const totalLength = messages.reduce((sum, item) => sum + item.text.length, 0);
  if (!messages.length || messages.some(item => !item.role || !item.text || item.text.length > 2500) ||
      messages[messages.length - 1].role !== "user" || totalLength > 8000) {
    return res.status(400).json({ error: "Send a conversation with a latest message (up to 2,500 characters)." });
  }

  const now = Date.now();
  const ip = normalizeIp(req.ip) || "unknown";
  const bucket = aiRequestBuckets.get(ip) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt >= AI_WINDOW_MS) {
    bucket.startedAt = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  aiRequestBuckets.set(ip, bucket);
  if (bucket.count > AI_MAX_REQUESTS) {
    return res.status(429).json({ error: "AI request limit reached. Wait a minute and try again." });
  }
  if (aiRequestBuckets.size > 2000) {
    for (const [key, value] of aiRequestBuckets) {
      if (now - value.startedAt >= AI_WINDOW_MS) aiRequestBuckets.delete(key);
    }
  }

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(geminiApiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are Superstar AI, a friendly, capable general-purpose assistant. Answer naturally and conversationally, explain things clearly, ask a follow-up when needed, and be honest when uncertain. Do not assume you can see the user's webpage or files; only use information they provide in chat." }]
        },
        contents: messages.map(item => ({ role: item.role, parts: [{ text: item.text }] })),
        generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
      }),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini chat API returned", response.status, detail.slice(0, 500));
      if (response.status === 429) return res.status(429).json({ error: "The AI provider's free-tier limit was reached. Try again later." });
      return res.status(502).json({ error: "The AI provider could not answer right now." });
    }
    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || "";
    if (!reply) return res.status(502).json({ error: "The AI returned an empty response. Try again." });
    res.json({ reply: reply.slice(0, 6000) });
  } catch (error) {
    console.error("AI chat request failed:", error.message);
    res.status(502).json({ error: "Could not reach the AI provider. Try again in a moment." });
  }
});

app.post("/api/ai/answer", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!geminiApiKey) {
    return res.status(503).json({ error: "AI is not configured yet. Add GEMINI_API_KEY to the Render environment." });
  }

  const body = req.body || {};
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const choices = Array.isArray(body.choices)
    ? body.choices.filter(choice => typeof choice === "string").map(choice => choice.trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!question || question.length > 1200 || choices.length < 2 || choices.some(choice => choice.length > 200)) {
    return res.status(400).json({ error: "Send a question (up to 1200 characters) and 2-8 answer choices (up to 200 characters each)." });
  }

  const now = Date.now();
  const ip = normalizeIp(req.ip) || "unknown";
  const bucket = aiRequestBuckets.get(ip) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt >= AI_WINDOW_MS) {
    bucket.startedAt = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  aiRequestBuckets.set(ip, bucket);
  if (bucket.count > AI_MAX_REQUESTS) {
    return res.status(429).json({ error: "AI request limit reached. Wait a minute and try again." });
  }
  if (aiRequestBuckets.size > 2000) {
    for (const [key, value] of aiRequestBuckets) {
      if (now - value.startedAt >= AI_WINDOW_MS) aiRequestBuckets.delete(key);
    }
  }

  const prompt = [
    "You help a student understand and answer a multiple-choice question.",
    "Use the question and choices only. Do not assume access to a game's answer key.",
    "Choose the best matching choice exactly as written. If the information is insufficient, set answer to an empty string and explain uncertainty.",
    "Return JSON with exactly these fields: answer (string), explanation (string), confidence (number from 0 to 1).",
    "",
    "Question: " + question,
    "Choices:",
    ...choices.map((choice, index) => (index + 1) + ". " + choice)
  ].join("\n");

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(geminiApiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              answer: { type: "STRING" },
              explanation: { type: "STRING" },
              confidence: { type: "NUMBER" }
            },
            required: ["answer", "explanation", "confidence"]
          },
          temperature: 0.1,
          maxOutputTokens: 220
        }
      }),
      signal: AbortSignal.timeout(20_000)
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini API returned", response.status, detail.slice(0, 500));
      if (response.status === 429) return res.status(429).json({ error: "The AI provider's free-tier limit was reached. Try again later." });
      return res.status(502).json({ error: "The AI provider could not answer right now." });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "";
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "The AI returned an unreadable answer. Try again." });
    }

    const answer = typeof result.answer === "string" ? result.answer.trim() : "";
    const matchedChoice = choices.find(choice => choice.toLowerCase() === answer.toLowerCase());
    res.json({
      answer: matchedChoice || "",
      explanation: typeof result.explanation === "string" ? result.explanation.slice(0, 500) : "",
      confidence: Number.isFinite(result.confidence) ? Math.max(0, Math.min(1, result.confidence)) : 0
    });
  } catch (error) {
    console.error("AI answer request failed:", error.message);
    res.status(502).json({ error: "Could not reach the AI provider. Try again in a moment." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
