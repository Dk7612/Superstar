(() => {
  "use strict";

  const ALLOWED_ORIGIN = "https://superstar-oa7t.onrender.com";

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== ALLOWED_ORIGIN) return;
    const message = event.data;
    if (!message || message.source !== "superstar-site") return;
    if (!["GET_MINI_MODE", "SET_MINI_MODE", "OPEN_MINI_WINDOW", "SET_SESSION"].includes(message.type)) return;

    const payload = { type: message.type };
    if (message.type === "SET_MINI_MODE") {
      payload.mode = message.mode === "full-site" ? "full-site" : "ai-helper";
    }
    if (message.type === "SET_SESSION" && typeof message.sessionToken === "string" && /^[a-f0-9]{64}$/i.test(message.sessionToken)) {
      payload.sessionToken = message.sessionToken;
    }

    chrome.runtime.sendMessage(payload, response => {
      const runtimeError = chrome.runtime.lastError;
      window.postMessage({
        source: "superstar-extension",
        type: message.type + "_RESULT",
        requestId: typeof message.requestId === "string" ? message.requestId : "",
        ok: !runtimeError && !!response?.ok,
        mode: response?.mode || "ai-helper"
      }, ALLOWED_ORIGIN);
    });
  });
})();