(() => {
  "use strict";
  if (window.top !== window || document.getElementById("superstar-global-player-host")) return;

  const host = document.createElement("div");
  host.id = "superstar-global-player-host";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;left:18px;bottom:18px;";
  (document.documentElement || document.body).appendChild(host);
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    *{box-sizing:border-box}
    .shell{font:13px/1.45 Arial,sans-serif;color:#f4f6ff;width:min(350px,calc(100vw - 36px));filter:drop-shadow(0 10px 28px #0008)}
    .launcher{width:54px;height:54px;padding:7px;border:1px solid #7184d4;border-radius:50%;background:linear-gradient(145deg,#26396f,#111a35);display:grid;place-items:center;cursor:pointer;box-shadow:0 5px 18px #0007}
    .launcher:hover{filter:brightness(1.18);transform:translateY(-1px)}
    .launcher img{width:100%;height:100%;object-fit:contain;border-radius:50%}
    button{font:inherit;cursor:pointer}
    .panel{position:absolute;left:0;bottom:66px;width:100%;height:min(470px,calc(100vh - 110px));min-height:260px;display:flex;flex-direction:column;overflow:hidden;border:1px solid #5365a5;border-radius:16px;background:#101a34;box-shadow:0 14px 38px #0009}
    .panel[hidden]{display:none}
    .head{display:flex;align-items:center;gap:9px;padding:11px 13px;background:linear-gradient(110deg,#172448,#263765);border-bottom:1px solid #435587}
    .head img{width:25px;height:25px;object-fit:contain}
    .heading{font-weight:700;flex:1}
    .close{width:29px;height:29px;border:1px solid #5365a5;border-radius:8px;background:#2e4078;color:white;font-size:18px}
    .messages{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:9px}
    .bubble{max-width:91%;padding:9px 11px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}
    .assistant{align-self:flex-start;background:#202d50;color:#f4f6ff;border:1px solid #34466f}
    .user{align-self:flex-end;background:#5268c8;color:white}
    .welcome{color:#b8c5e8;font-size:12px;margin:2px 2px 7px}
    .composer{padding:10px;border-top:1px solid #34466f;background:#121e3b}
    textarea{display:block;width:100%;min-height:58px;max-height:120px;resize:vertical;border:1px solid #465780;border-radius:9px;padding:9px;background:#080f22;color:#fff;font:13px/1.4 Arial,sans-serif}
    .sendrow{display:flex;align-items:center;gap:8px;margin-top:8px}
    .status{flex:1;color:#b8c5e8;font-size:11px;min-height:15px}
    .send{border:0;border-radius:9px;background:#586fe0;color:white;padding:8px 15px;font-weight:700}
    .send:disabled{opacity:.55;cursor:wait}
    @media(max-width:440px){.shell{width:calc(100vw - 36px)}.panel{height:min(430px,calc(100vh - 100px))}}
    @media(prefers-reduced-motion:no-preference){.launcher{transition:transform .15s,filter .15s}}
  `;
  root.appendChild(style);

  const shell = document.createElement("section");
  shell.className = "shell";
  shell.innerHTML = `
    <section class="panel" id="panel" aria-label="Superstar AI chat" hidden>
      <header class="head">
        <img src="https://superstar-oa7t.onrender.com/favicon.png" alt="">
        <span class="heading">Superstar AI</span>
        <button class="close" id="close" type="button" aria-label="Close chat">×</button>
      </header>
      <div class="messages" id="messages" aria-live="polite">
        <p class="welcome">Hey! I'm Superstar AI. Ask me anything.</p>
      </div>
      <form class="composer" id="form">
        <textarea id="prompt" maxlength="2500" placeholder="Message Superstar AI…" aria-label="Message Superstar AI"></textarea>
        <div class="sendrow"><span class="status" id="status" role="status">Enter to send · Shift+Enter for a new line</span><button class="send" id="send" type="submit">Send</button></div>
      </form>
    </section>
    <button class="launcher" id="launcher" type="button" aria-label="Open Superstar AI" aria-expanded="false">
      <img src="https://superstar-oa7t.onrender.com/favicon.png" alt="Superstar">
    </button>
  `;
  root.appendChild(shell);

  const panel = root.getElementById("panel");
  const launcher = root.getElementById("launcher");
  const close = root.getElementById("close");
  const messages = root.getElementById("messages");
  const form = root.getElementById("form");
  const prompt = root.getElementById("prompt");
  const send = root.getElementById("send");
  const status = root.getElementById("status");
  const history = [];
  let waiting = false;

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute("aria-label", open ? "Close Superstar AI" : "Open Superstar AI");
    if (open) prompt.focus();
  }
  function addBubble(text, role) {
    const bubble = document.createElement("div");
    bubble.className = "bubble " + role;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }
  launcher.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));
  prompt.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const message = prompt.value.trim();
    if (!message || waiting) return;
    if (message.length > 2500) {
      status.textContent = "Please keep messages under 2,500 characters.";
      return;
    }
    history.push({ role: "user", content: message });
    addBubble(message, "user");
    prompt.value = "";
    waiting = true;
    send.disabled = true;
    status.textContent = "Thinking…";
    const pending = addBubble("Thinking…", "assistant");
    try {
      const response = await fetch("https://superstar-oa7t.onrender.com/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-12) }),
        signal: AbortSignal.timeout(35000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI request failed.");
      const reply = typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : "I couldn't form a response. Try asking another way.";
      pending.textContent = reply;
      history.push({ role: "assistant", content: reply });
      status.textContent = "Ready";
    } catch (error) {
      pending.remove();
      history.pop();
      status.textContent = error.name === "TimeoutError" ? "That took too long. Try again." : (error.message || "Could not contact Superstar.");
    } finally {
      waiting = false;
      send.disabled = false;
      prompt.focus();
    }
  });
})();
