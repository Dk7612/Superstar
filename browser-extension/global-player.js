(() => {
  "use strict";
  if (window.top !== window || document.getElementById("superstar-global-player-host")) return;

  const host = document.createElement("div");
  host.id = "superstar-global-player-host";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;right:20px;bottom:18px;";
  (document.documentElement || document.body).appendChild(host);
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    *{box-sizing:border-box}
    .shell{font:13px/1.4 Arial,sans-serif;color:#f4f6ff;width:min(370px,calc(100vw - 28px));filter:drop-shadow(0 10px 28px #0008)}
    .bar{display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid #5365a5;border-radius:14px;background:linear-gradient(110deg,#121b36,#202d55);min-height:54px}
    .brand{font-weight:700;white-space:nowrap;flex:1;display:flex;align-items:center;gap:7px}
    .star{font-size:18px}.muted{color:#b8c5e8;font-size:11px}
    button,a{font:inherit;cursor:pointer}
    button{border:1px solid #5365a5;border-radius:9px;background:#2e4078;color:#fff;padding:7px 10px}
    button:hover,a:hover{filter:brightness(1.18)}
    button.icon{width:30px;height:30px;padding:0;font-size:17px}
    a.open{color:#fff;text-decoration:none;border:1px solid #5365a5;border-radius:9px;padding:6px 9px;background:#2e4078;white-space:nowrap}
    .panel{margin-bottom:8px;padding:13px;border:1px solid #5365a5;border-radius:14px;background:#111a33}
    .panel[hidden]{display:none}
    label{display:block;color:#c6d1ef;margin:9px 0 5px;font-size:12px}
    textarea{display:block;width:100%;resize:vertical;min-height:66px;border:1px solid #465780;border-radius:8px;padding:9px;background:#080f22;color:#fff;font:13px/1.4 Arial,sans-serif}
    #q{min-height:75px}
    .ask{width:100%;margin-top:9px;background:#586fe0;font-weight:700}
    .status{color:#b8c5e8;font-size:11px;min-height:16px;margin:8px 0 0}
    .answer{margin-top:9px;padding:10px;border-radius:9px;background:#202d50;white-space:pre-wrap;overflow-wrap:anywhere}
    .answer[hidden]{display:none}
    .answer strong{color:#c5bdff}
    @media(max-width:440px){.shell{width:calc(100vw - 24px)}}
  `;
  root.appendChild(style);

  const shell = document.createElement("section");
  shell.className = "shell";
  shell.innerHTML = `
    <div class="panel" id="panel" hidden>
      <label for="q">Ask Superstar AI</label>
      <textarea id="q" maxlength="1200" placeholder="Type or paste your question…"></textarea>
      <label for="choices">Answer choices (one per line)</label>
      <textarea id="choices" placeholder="Choice 1&#10;Choice 2&#10;Choice 3&#10;Choice 4"></textarea>
      <button class="ask" id="ask">Ask AI</button>
      <p class="status" id="status" role="status">Enter a question and at least two choices.</p>
      <div class="answer" id="answer" hidden></div>
    </div>
    <div class="bar">
      <div class="brand"><span class="star">⭐</span><span>Superstar</span><span class="muted">Mini player</span></div>
      <button id="ai" type="button">AI</button>
      <a class="open" href="https://superstar-oa7t.onrender.com/" target="_blank" rel="noopener noreferrer">Open</a>
      <button class="icon" id="min" type="button" aria-label="Hide mini player">−</button>
    </div>
  `;
  root.appendChild(shell);

  const panel = root.getElementById("panel");
  const aiButton = root.getElementById("ai");
  const q = root.getElementById("q");
  const choices = root.getElementById("choices");
  const ask = root.getElementById("ask");
  const status = root.getElementById("status");
  const answer = root.getElementById("answer");
  const min = root.getElementById("min");

  aiButton.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) q.focus();
  });
  min.addEventListener("click", () => {
    host.remove();
  });

  ask.addEventListener("click", async () => {
    const question = q.value.trim();
    const options = choices.value.split("\n").map(value => value.trim()).filter(Boolean);
    if (!question || options.length < 2) {
      status.textContent = "Enter a question and at least two choices.";
      return;
    }
    if (question.length > 1200 || options.length > 8 || options.some(value => value.length > 200)) {
      status.textContent = "Use 2–8 choices, each up to 200 characters.";
      return;
    }
    ask.disabled = true;
    status.textContent = "Thinking…";
    answer.hidden = true;
    try {
      const response = await fetch("https://superstar-oa7t.onrender.com/api/ai/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, choices: options }),
        signal: AbortSignal.timeout(25000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI request failed.");
      const heading = document.createElement("strong");
      heading.textContent = data.answer ? "Suggested answer: " + data.answer : "No confident answer";
      const detail = document.createElement("div");
      detail.textContent = (data.explanation || "No explanation provided.") +
        "\nConfidence estimate: " + Math.round((data.confidence || 0) * 100) + "%";
      answer.replaceChildren(heading, detail);
      answer.hidden = false;
      status.textContent = "Done — review the explanation before deciding.";
    } catch (error) {
      status.textContent = error.name === "TimeoutError"
        ? "Request timed out. Try again."
        : (error.message || "Could not contact Superstar.");
    } finally {
      ask.disabled = false;
    }
  });
})();
