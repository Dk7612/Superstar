const SITE_URL = "https://superstar-oa7t.onrender.com/";
const DEFAULT_MODE = "ai-helper";

async function getMode() {
  const stored = await chrome.storage.local.get("miniWindowMode");
  return stored.miniWindowMode === "full-site" ? "full-site" : DEFAULT_MODE;
}

async function openMiniWindow() {
  const stored = await chrome.storage.local.get("superstarSessionToken");
  const token = stored.superstarSessionToken || "";
  if (!token) return;
  const permissionResponse = await fetch(SITE_URL + "account/permissions", {
    headers: { "Authorization": "Bearer " + token },
    cache: "no-store"
  });
  if (!permissionResponse.ok) return;
  const permissions = await permissionResponse.json();
  if (permissions.extension !== true) return;
  const mode = await getMode();
  if (mode === "ai-helper" && permissions.ai !== true) return;
  const url = mode === "full-site"
    ? SITE_URL
    : chrome.runtime.getURL("helper.html");
  const dimensions = mode === "full-site"
    ? { width: 1120, height: 820 }
    : { width: 430, height: 720 };
  await chrome.windows.create({
    url,
    type: "popup",
    width: dimensions.width,
    height: dimensions.height,
    focused: true
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("miniWindowMode");
  if (!stored.miniWindowMode) {
    await chrome.storage.local.set({ miniWindowMode: DEFAULT_MODE });
  }
});

chrome.action.onClicked.addListener(() => {
  openMiniWindow().catch(error => console.error("Could not open Superstar mini-window:", error));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "SET_SESSION") {
    if (typeof message.sessionToken !== "string" || !/^[a-f0-9]{64}$/i.test(message.sessionToken)) {
      sendResponse({ ok: false }); return false;
    }
    chrome.storage.local.set({ superstarSessionToken: message.sessionToken })
      .then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "GET_MINI_MODE") {
    getMode().then(mode => sendResponse({ ok: true, mode }))
      .catch(() => sendResponse({ ok: false, mode: DEFAULT_MODE }));
    return true;
  }

  if (message.type === "SET_MINI_MODE") {
    const mode = message.mode === "full-site" ? "full-site" : "ai-helper";
    chrome.storage.local.set({ miniWindowMode: mode })
      .then(() => sendResponse({ ok: true, mode }))
      .catch(() => sendResponse({ ok: false, mode }));
    return true;
  }

  if (message.type === "OPEN_MINI_WINDOW") {
    openMiniWindow()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});