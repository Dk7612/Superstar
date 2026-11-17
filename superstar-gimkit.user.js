// ==UserScript==
// @name         Superstar Gimkit AI Helper
// @namespace    https://github.com/Dk7612/Superstar
// @version      1.1.0
// @description  Ask Superstar's Gemini-powered backend for help with visible Gimkit questions.
// @match        https://gimkit.com/*
// @match        https://*.gimkit.com/*
// @grant        GM_xmlhttpRequest
// @connect      superstar-oa7t.onrender.com
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const API_URL = "https://superstar-oa7t.onrender.com/api/ai/answer";
  const HOST_ID = "superstar-gimkit-ai";
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;z-index:2147483647;right:18px;top:90px;width:320px;color:#f5f5f5;font:14px/1.4 Arial,sans-serif;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box} .panel{background:#171923;border:1px solid #626a83;border-radius:13px;box-shadow:0 10px 35px #0008;overflow:hidden}
      header{padding:10px 12px;background:#252a3b;display:flex;align-items:center;justify-content:space-between;cursor:move;user-select:none;font-weight:700}
      button{border:0;border-radius:7px;padding:8px 10px;background:#8b7cff;color:#fff;font-weight:700;cursor:pointer}
      button.secondary{background:#3a4054} button:disabled{opacity:.5;cursor:wait}
      main{padding:12px;display:grid;gap:8px} label{font-size:12px;color:#c5c9d8}
      textarea,input{width:100%;border:1px solid #454b60;border-radius:7px;background:#0f1119;color:#fff;padding:8px;font:inherit}
      textarea{resize:vertical;min-height:65px} #choices{min-height:100px}
      .actions{display:flex;gap:8px} .actions button{flex:1}
      .permission{background:#202638;border:1px solid #454b60;border-radius:8px;padding:8px;font-size:12px}
      .permission label{display:flex;gap:8px;align-items:center;color:#e0e3ee}.permission input{width:auto}
      #status{font-size:12px;color:#bfc5d8;min-height:18px} #result{background:#242a3b;padding:10px;border-radius:8px;white-space:pre-wrap}
      .answer{font-size:16px;font-weight:700;color:#a99cff}
      .hidden{display:none}
    </style>
    <div class="panel">
      <header id="drag"><span>⭐ Superstar AI</span><button id="min" class="secondary">−</button></header>
      <main id="body">
        <div class="permission"><label><input id="readPermission" type="checkbox"> Allow Superstar to read visible Gimkit questions</label></div>
        <div class="permission"><label><input id="clickPermission" type="checkbox"> Allow Superstar to click an answer (confirmation required)</label></div>
        <div class="actions"><button id="detect" class="secondary">Detect question</button><button id="clear" class="secondary">Clear</button></div>
        <label for="question">Question</label><textarea id="question" placeholder="Question text..."></textarea>
        <label for="choices">Answer choices (one per line)</label><textarea id="choices" placeholder="Choice 1&#10;Choice 2&#10;Choice 3&#10;Choice 4"></textarea>
        <button id="ask">Ask Superstar AI</button>
        <button id="apply" class="secondary hidden">Apply suggested answer</button>
        <div id="status" role="status">Ready. Detection may not work in every Gimkit game mode.</div>
        <div id="result" class="hidden"></div>
      </main>
    </div>`;

  document.documentElement.appendChild(host);
  const $ = id => shadow.getElementById(id);
  let minimized = false;
  let suggestedAnswer = "";
  const permissionKey = "superstar-gimkit-permissions-v1";
  let permissions = { read: false, click: false };
  try { permissions = { ...permissions, ...JSON.parse(localStorage.getItem(permissionKey) || "{}") }; } catch {}
  $("readPermission").checked = permissions.read === true;
  $("clickPermission").checked = permissions.click === true;
  function savePermissions() {
    permissions = { read: $("readPermission").checked, click: $("clickPermission").checked };
    localStorage.setItem(permissionKey, JSON.stringify(permissions));
    $("status").textContent = permissions.read
      ? "Screen reading is enabled. You can turn it off at any time."
      : "Screen reading is off. You can still enter questions manually.";
    if (!permissions.click) $("apply").classList.add("hidden");
  }
  $("readPermission").addEventListener("change", savePermissions);
  $("clickPermission").addEventListener("change", savePermissions);

  $("min").addEventListener("click", () => {
    minimized = !minimized;
    $("body").classList.toggle("hidden", minimized);
    $("min").textContent = minimized ? "+" : "−";
  });
  $("clear").addEventListener("click", () => {
    $("question").value = "";
    $("choices").value = "";
    $("result").classList.add("hidden");
    $("apply").classList.add("hidden");
    suggestedAnswer = "";
    $("status").textContent = "Cleared.";
  });

  // Best-effort text detection. Gimkit changes its page structure frequently;
  // manual editing is always available when the question is not detected.
  function detectQuestion() {
    if (!permissions.read) {
      $("status").textContent = "Turn on 'Allow Superstar to read visible Gimkit questions' first.";
      return;
    }
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        rect.width > 0 && rect.height > 0;
    };
    const candidates = [...document.querySelectorAll("h1,h2,h3,[role=heading],p")]
      .filter(visible)
      .map(el => (el.innerText || el.textContent || "").trim())
      .filter(text => text.length >= 12 && text.length <= 500);
    const question = candidates.sort((a,b) => b.length-a.length)[0] || "";
    const choiceElements = [...document.querySelectorAll("button,[role=button],[role=option]")]
      .filter(visible)
      .map(el => (el.innerText || el.textContent || "").trim())
      .filter(text => text.length > 0 && text.length <= 200);
    const choices = [...new Set(choiceElements)].filter(text => text !== question).slice(0,8);
    if (question) $("question").value = question;
    if (choices.length >= 2) $("choices").value = choices.join("\n");
    $("status").textContent = question && choices.length >= 2
      ? "Found possible question and choices. Check them, then ask AI."
      : "Couldn't confidently detect both. Enter the question and choices manually.";
  }

  $("detect").addEventListener("click", detectQuestion);

  $("ask").addEventListener("click", () => {
    const question = $("question").value.trim();
    const choices = $("choices").value.split("\n").map(s => s.trim()).filter(Boolean);
    if (!question || choices.length < 2) {
      $("status").textContent = "Enter a question and at least two choices.";
      return;
    }
    $("ask").disabled = true;
    $("status").textContent = "Thinking…";
    $("result").classList.add("hidden");
    GM_xmlhttpRequest({
      method: "POST",
      url: API_URL,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ question, choices }),
      timeout: 25000,
      onload: response => {
        $("ask").disabled = false;
        let data;
        try { data = JSON.parse(response.responseText); }
        catch { $("status").textContent = "The server returned an unreadable response."; return; }
        if (response.status < 200 || response.status >= 300) {
          $("status").textContent = data.error || "AI request failed.";
          return;
        }
        suggestedAnswer = typeof data.answer === "string" ? data.answer : "";
        $("result").innerHTML = "";
        const answer = document.createElement("div");
        answer.className = "answer";
        answer.textContent = data.answer ? "Answer: " + data.answer : "No confident answer";
        const explanation = document.createElement("div");
        explanation.textContent = data.explanation || "No explanation provided.";
        const confidence = document.createElement("div");
        confidence.style.cssText = "font-size:12px;color:#bfc5d8;margin-top:7px";
        confidence.textContent = "Confidence estimate: " + Math.round((data.confidence || 0) * 100) + "%";
        $("result").append(answer, explanation, confidence);
        $("result").classList.remove("hidden");
        $("apply").classList.toggle("hidden", !(permissions.click && suggestedAnswer));
        $("status").textContent = "Done. Check the explanation before choosing.";
      },
      onerror: () => { $("ask").disabled = false; $("status").textContent = "Couldn't contact Superstar. Check your connection."; },
      ontimeout: () => { $("ask").disabled = false; $("status").textContent = "The request timed out. Try again."; }
    });
  });

  $("apply").addEventListener("click", () => {
    if (!permissions.click || !suggestedAnswer) {
      $("status").textContent = "Answer clicking is disabled or there is no suggested answer.";
      return;
    }
    const normalize = value => (value || "").replace(/\\s+/g, " ").trim().toLowerCase();
    const target = [...document.querySelectorAll("button,[role=button],[role=option]")]
      .find(el => {
        const style = getComputedStyle(el), rect = el.getBoundingClientRect();
        const text = (el.innerText || el.textContent || "").trim();
        return style.display !== "none" && style.visibility !== "hidden" &&
          rect.width > 0 && rect.height > 0 && normalize(text) === normalize(suggestedAnswer);
      });
    if (!target) {
      $("status").textContent = "Couldn't find an exact visible answer button. Nothing was clicked.";
      return;
    }
    if (!confirm("Click this Gimkit answer?\\n\\n" + suggestedAnswer)) return;
    target.click();
    $("status").textContent = "Clicked the answer you confirmed.";
  });

  // Drag the panel using its header, without interfering with page interactions.
  let drag = null;
  $("drag").addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    const rect = host.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    $("drag").setPointerCapture(event.pointerId);
  });
  $("drag").addEventListener("pointermove", event => {
    if (!drag) return;
    host.style.left = Math.max(0, drag.left + event.clientX - drag.x) + "px";
    host.style.top = Math.max(0, drag.top + event.clientY - drag.y) + "px";
    host.style.right = "auto";
  });
  $("drag").addEventListener("pointerup", () => { drag = null; });
  $("drag").addEventListener("pointercancel", () => { drag = null; });
})();
