const fs = require("fs");
const path = require("path");

const token = process.env.GITHUB_DATA_TOKEN || "";
const repository = process.env.GITHUB_DATA_REPO || "";
const branch = process.env.GITHUB_DATA_BRANCH || "main";
const enabled = Boolean(token && repository);
if (Boolean(token) !== Boolean(repository)) {
  throw new Error("Set both GITHUB_DATA_TOKEN and GITHUB_DATA_REPO to enable GitHub-backed storage.");
}
if (enabled && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error("GITHUB_DATA_REPO must use owner/repository format.");
}

let writeQueue = Promise.resolve();

function apiUrl(resource) {
  return `https://api.github.com/repos/${repository}/${resource}`;
}

async function request(resource, options = {}) {
  const response = await fetch(apiUrl(resource), {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Superstar-Persistent-Storage",
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  return { status: response.status, data, raw };
}

async function uploadFile(localPath, remoteName) {
  const contentsPath = `contents/${encodeURIComponent(remoteName)}`;
  const fileContents = fs.readFileSync(localPath, "utf8");
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await request(`${contentsPath}?ref=${encodeURIComponent(branch)}`);
    if (current.status !== 200 && current.status !== 404) {
      throw new Error(`GitHub could not read ${remoteName} (HTTP ${current.status}).`);
    }
    const body = {
      message: `Persist Superstar ${remoteName}`,
      content: Buffer.from(fileContents, "utf8").toString("base64"),
      branch
    };
    if (current.status === 200) body.sha = current.data.sha;
    const saved = await request(contentsPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (saved.status === 200 || saved.status === 201) return;
    if (saved.status !== 409 && saved.status !== 422) {
      throw new Error(`GitHub could not save ${remoteName} (HTTP ${saved.status}).`);
    }
  }
  throw new Error(`GitHub storage kept changing while saving ${remoteName}; retry the action.`);
}

function persist(localPath, remoteName) {
  if (!enabled) return Promise.resolve();
  const task = writeQueue.catch(() => {}).then(() => uploadFile(localPath, remoteName));
  writeQueue = task;
  task.catch(() => {});
  return task;
}

async function flush() {
  if (!enabled) return;
  const pending = writeQueue;
  try {
    await pending;
  } finally {
    if (writeQueue === pending) writeQueue = Promise.resolve();
  }
}

async function restoreFile(dataDirectory, remoteName) {
  const localPath = path.join(dataDirectory, remoteName);
  const result = await request(`contents/${encodeURIComponent(remoteName)}?ref=${encodeURIComponent(branch)}`);
  if (result.status === 404) {
    if (fs.existsSync(localPath)) {
      await uploadFile(localPath, remoteName);
      console.log(`Migrated existing ${remoteName} into the private GitHub data repository.`);
      return true;
    }
    return false;
  }
  if (result.status !== 200) {
    throw new Error(`GitHub could not restore ${remoteName} (HTTP ${result.status}). Check the token and repository permissions.`);
  }
  if (result.data.type !== "file" || typeof result.data.content !== "string") {
    throw new Error(`GitHub returned an unexpected format for ${remoteName}.`);
  }
  const decoded = Buffer.from(result.data.content.replace(/\n/g, ""), "base64").toString("utf8");
  JSON.parse(decoded);
  const temporary = `${localPath}.restore.tmp`;
  fs.writeFileSync(temporary, decoded, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, localPath);
  console.log(`Restored ${remoteName} from the private GitHub data repository.`);
  return true;
}

async function initialize(dataDirectory) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  if (!enabled) {
    console.warn("WARNING: GitHub persistent storage is not configured. Local data may be temporary across redeploys.");
    return { enabled: false, serviceDataInitialized: false, ideasInitialized: false };
  }

  const repo = await request("");
  if (repo.status !== 200 || repo.data.private !== true) {
    throw new Error("GitHub data repository could not be verified as private. Check GITHUB_DATA_TOKEN and GITHUB_DATA_REPO.");
  }

  const [serviceDataInitialized, ideasInitialized] = await Promise.all([
    restoreFile(dataDirectory, "service-data.json"),
    restoreFile(dataDirectory, "ideas.json")
  ]);
  console.log(`GitHub persistent storage enabled: ${repository}/${branch}.`);
  return { enabled: true, serviceDataInitialized, ideasInitialized };
}

function attachResponseFlush(app) {
  app.use((req, res, next) => {
    const sendJson = res.json.bind(res);
    res.json = payload => {
      if (!enabled) return sendJson(payload);
      return flush().then(() => sendJson(payload)).catch(error => {
        console.error("GitHub persistent storage write failed:", error.message);
        if (res.headersSent) return;
        res.status(503);
        return sendJson({
          error: "Persistent storage is temporarily unavailable. Your change was saved locally but not confirmed in GitHub; please retry."
        });
      });
    };
    next();
  });
}

module.exports = { enabled, initialize, persist, flush, attachResponseFlush };
