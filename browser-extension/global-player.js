(() => {
  "use strict";
  if (window.top !== window || document.getElementById("superstar-global-player-host")) return;

  const host = document.createElement("div");
  host.id = "superstar-global-player-host";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;left:16px;bottom:16px;display:none;";
  (document.documentElement || document.body).appendChild(host);
  async function checkExtensionAccess() {
    try {
      const stored = await new Promise(resolve => chrome.storage.local.get(["superstarSessionToken"], resolve));
      const token = stored.superstarSessionToken || "";
      if (!token) { host.style.display = "none"; return; }
      const response = await fetch("https://superstar-oa7t.onrender.com/account/permissions", {
        headers: { "Authorization": "Bearer " + token },
        cache: "no-store"
      });
      if (!response.ok) { host.style.display = "none"; return; }
      const permissions = await response.json();
      host.style.display = permissions.extension === true ? "block" : "none";
      const aiOption = root?.querySelector?.('[data-view="ai"]');
      const gamesOption = root?.querySelector?.('[data-view="games"]');
      const websiteOption = root?.querySelector?.('[data-view="website"]');
      if (aiOption) aiOption.hidden = permissions.ai !== true;
      if (gamesOption) gamesOption.hidden = permissions.games !== true;
      if (websiteOption) websiteOption.hidden = permissions.dashboard !== true;
    } catch { host.style.display = "none"; }
  }
  checkExtensionAccess();
  setInterval(checkExtensionAccess, 30000);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.superstarSessionToken) checkExtensionAccess();
  });
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    *{box-sizing:border-box}
    :host{all:initial}
    .shell{font:13px/1.45 Arial,sans-serif;color:#f4f6ff;width:46px;position:relative}.shell.open{width:min(310px,calc(100vw - 32px))}
    .launcher{width:46px;height:46px;padding:0;border:0;border-radius:50%;background:transparent;box-shadow:none;display:grid;place-items:center;cursor:pointer;outline-offset:4px}
    .launcher img{width:100%;height:100%;object-fit:contain;display:block;background:transparent;filter:url(#superstar-remove-dark-background);pointer-events:none}
    .menu{position:absolute;left:0;bottom:54px;width:100%;padding:12px;border:1px solid #5365a5;border-radius:16px;background:rgba(13,20,42,.94);backdrop-filter:blur(16px);box-shadow:0 12px 36px #0008;display:flex;flex-direction:column;gap:8px}
    [hidden]{display:none!important}
    .brand{display:flex;align-items:center;gap:9px;padding:2px 3px 8px;border-bottom:1px solid #34466f}
    .brand img{width:25px;height:25px;object-fit:contain;background:transparent;filter:url(#superstar-remove-dark-background)}
    .brand strong{font-size:14px;flex:1}
    .hint{font-size:10px;color:#9eadd6}
    .options{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    button{font:inherit;cursor:pointer}
    .option{min-height:68px;text-align:left;padding:10px;border:1px solid #35466f;border-radius:11px;background:rgba(37,52,91,.72);color:#f4f6ff;display:flex;flex-direction:column;justify-content:center;gap:3px}
    .option:hover,.option:focus-visible{background:#354a83;border-color:#8194e9;outline:none}
    .option b{font-size:12px}.option small{font-size:10px;color:#b8c5e8}
    .view{display:flex;flex-direction:column;gap:9px}
    .viewhead{display:flex;align-items:center;gap:8px}
    .back,.close{border:1px solid #526494;border-radius:8px;background:#26365f;color:white;padding:6px 9px}
    .viewtitle{font-weight:700;flex:1;font-size:14px}
    .messages{height:210px;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:3px}
    .bubble{max-width:94%;padding:8px 10px;border-radius:11px;white-space:pre-wrap;overflow-wrap:anywhere}
    .assistant{align-self:flex-start;background:#202d50;border:1px solid #34466f}
    .user{align-self:flex-end;background:#5268c8}
    .welcome,.muted{font-size:11px;color:#b8c5e8;margin:0}
    textarea{width:100%;min-height:56px;resize:vertical;border:1px solid #465780;border-radius:9px;padding:9px;background:#080f22;color:#fff;font:13px/1.4 Arial,sans-serif}
    .sendrow{display:flex;align-items:center;gap:8px}.status{flex:1;color:#b8c5e8;font-size:10px}
    .primary{border:0;border-radius:9px;background:#586fe0;color:white;padding:8px 13px;font-weight:700}
    .primary:disabled{opacity:.5}
    canvas{display:block;width:100%;max-width:280px;height:auto;align-self:center;border-radius:12px;background:#87d9fa;border:1px solid #718ac0;touch-action:manipulation}
    .gamebar{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .focusclock{font-size:34px;font-weight:700;text-align:center;letter-spacing:2px;padding:16px 0 6px}
    .focusactions{display:flex;justify-content:center;gap:8px}
    .secondary{border:1px solid #5365a5;border-radius:9px;background:#26365f;color:white;padding:8px 12px}
    @media(prefers-reduced-motion:no-preference){.option{transition:background .12s,border-color .12s}}
  `;
  root.appendChild(style);

  // Apply alpha transparency to dark pixels baked into the favicon.
  const logoFilter = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  logoFilter.setAttribute("width", "0");
  logoFilter.setAttribute("height", "0");
  logoFilter.style.position = "absolute";
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filter.setAttribute("id", "superstar-remove-dark-background");
  const matrix = document.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
  matrix.setAttribute("type", "matrix");
  matrix.setAttribute("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0.3 0.59 0.11 0 0");
  const alpha = document.createElementNS("http://www.w3.org/2000/svg", "feComponentTransfer");
  const alphaFunc = document.createElementNS("http://www.w3.org/2000/svg", "feFuncA");
  alphaFunc.setAttribute("type", "linear");
  alphaFunc.setAttribute("slope", "1.8");
  alphaFunc.setAttribute("intercept", "-0.01");
  alpha.appendChild(alphaFunc);
  filter.append(matrix, alpha);
  defs.appendChild(filter);
  logoFilter.appendChild(defs);
  root.appendChild(logoFilter);

  const shell = document.createElement("section");
  shell.className = "shell";
  shell.innerHTML = `
    <section class="menu" id="menu" hidden aria-label="Superstar menu">
      <header class="brand"><img src="https://superstar-oa7t.onrender.com/favicon.png" alt=""><strong>Superstar</strong><span class="hint">Quick menu</span></header>
      <div class="options" id="options">
        <button class="option" data-view="games"><b>🎮 Games</b><small>Flappy Bird</small></button>
        <button class="option" data-view="ai"><b>✦ AI Assistant</b><small>Ask Superstar</small></button>
        <button class="option" data-view="focus"><b>🏄 Subway Surfers Focus</b><small>Focus timer</small></button>
        <button class="option" data-view="website"><b>🌐 Full website</b><small>Everything Superstar</small></button>
      </div>
      <p class="muted">More tools will appear here as they're released.</p>
    </section>
    <section class="menu view" id="view" hidden aria-label="Superstar tool">
      <header class="viewhead"><button class="back" id="back" type="button">←</button><strong class="viewtitle" id="viewtitle">Superstar</strong><button class="close" id="close" type="button" aria-label="Close menu">×</button></header>
      <div id="viewbody"></div>
    </section>
    <button class="launcher" id="launcher" type="button" aria-label="Open Superstar menu" aria-expanded="false">
      <img src="https://superstar-oa7t.onrender.com/favicon.png" alt="Superstar">
    </button>
  `;
  root.appendChild(shell);

  const menu = root.getElementById("menu");
  const view = root.getElementById("view");
  const viewbody = root.getElementById("viewbody");
  const viewtitle = root.getElementById("viewtitle");
  const launcher = root.getElementById("launcher");
  const history = [];
  let open = false;
  let activeView = null;
  let waiting = false;
  let focusInterval = null;
  let focusSeconds = 25 * 60;
  let gameFrame = 0;
  let gameKeyHandler = null;

  function stopGame() {
    if (gameFrame) cancelAnimationFrame(gameFrame);
    gameFrame = 0;
    if (gameKeyHandler) window.removeEventListener("keydown", gameKeyHandler);
    gameKeyHandler = null;
  }
  function clearFocusTimer() { if (focusInterval) clearInterval(focusInterval); focusInterval = null; }
  function showMenu() {
    open = true; activeView = null; shell.classList.add("open"); menu.hidden = false; view.hidden = true;
    launcher.setAttribute("aria-expanded", "true");
  }
  function hideMenu() {
    open = false; activeView = null; shell.classList.remove("open"); menu.hidden = true; view.hidden = true;
    stopGame();
    launcher.setAttribute("aria-expanded", "false");
  }
  function showView(name) {
    activeView = name;
    menu.hidden = true; view.hidden = false; viewbody.replaceChildren();
    stopGame();
    if (name === "ai") renderAI();
    else if (name === "games") renderGames();
    else if (name === "focus") renderFocus();
    else if (name === "website") window.open("https://superstar-oa7t.onrender.com", "_blank", "noopener");
  }
  function element(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function renderAI() {
    viewtitle.textContent = "Superstar AI";
    const messages = element("div", "messages");
    messages.setAttribute("aria-live", "polite");
    if (!history.length) messages.appendChild(element("p", "welcome", "Hey! Ask me anything."));
    for (const item of history.slice(-12)) messages.appendChild(element("div", "bubble " + item.role, item.content));
    const form = element("form");
    const input = element("textarea"); input.maxLength = 2500; input.placeholder = "Message Superstar AI…"; input.setAttribute("aria-label", "Message Superstar AI");
    const row = element("div", "sendrow");
    const status = element("span", "status", "Enter to send · Shift+Enter for a new line");
    const send = element("button", "primary", "Send"); send.type = "submit";
    row.append(status, send); form.append(input, row); viewbody.append(messages, form);
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const message = input.value.trim();
      if (!message || waiting) return;
      history.push({role:"user",content:message});
      messages.appendChild(element("div","bubble user",message)); input.value = "";
      waiting = true; send.disabled = true; status.textContent = "Thinking…";
      const pending = element("div","bubble assistant","Thinking…"); messages.appendChild(pending); messages.scrollTop = messages.scrollHeight;
      try {
        const stored = await new Promise(resolve => chrome.storage.local.get(["superstarSessionToken"], resolve));
        const sessionToken = stored.superstarSessionToken || "";
        const prefs = await chrome.storage.local.get("quickReply");
        const response = await fetch("https://superstar-oa7t.onrender.com/api/ai/chat", {
          method:"POST", headers:{"Content-Type":"application/json", "Authorization":"Bearer " + sessionToken},
          body:JSON.stringify({messages:history.slice(-12), quickReply:prefs.quickReply !== false}), signal:AbortSignal.timeout(35000)
        });
        const data = await response.json().catch(()=>({}));
        if (!response.ok) throw new Error(data.error || "AI request failed.");
        const reply = typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : "I couldn't form a response. Try again.";
        pending.textContent = reply; history.push({role:"assistant",content:reply}); status.textContent = "Ready";
      } catch (err) {
        pending.remove(); history.pop(); status.textContent = err.name === "TimeoutError" ? "That took too long. Try again." : (err.message || "Could not contact Superstar.");
      } finally { waiting = false; send.disabled = false; input.focus(); }
    });
    input.focus();
  }
  function renderGames() {
    viewtitle.textContent = "Games";
    const title = element("p","welcome","Only Flappy Bird is available in the extension for now. Visit the website for the full games library.");
    const canvas = element("canvas"); canvas.width = 280; canvas.height = 360; canvas.setAttribute("aria-label","Flappy Bird game. Click or press Space to flap.");
    const bar = element("div","gamebar");
    const score = element("span","muted","Score: 0");
    const start = element("button","primary","Start game"); start.type = "button";
    bar.append(score,start); viewbody.append(title,canvas,bar);
    const ctx = canvas.getContext("2d");
    let birdY=170, velocity=0, pipes=[], points=0, running=false, last=0, started=false;
    function draw() {
      ctx.fillStyle="#87d9fa"; ctx.fillRect(0,0,280,360);
      ctx.fillStyle="#d8f4ff"; ctx.beginPath(); ctx.arc(48,56,18,0,Math.PI*2); ctx.arc(68,58,13,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#6acb62"; ctx.fillRect(0,325,280,35); ctx.fillStyle="#4a9e48"; ctx.fillRect(0,325,280,5);
      for(const p of pipes){ctx.fillStyle="#36b34a";ctx.fillRect(p.x,0,46,p.top);ctx.fillRect(p.x,p.top+105,46,325-(p.top+105));ctx.fillStyle="#218c38";ctx.fillRect(p.x-4,p.top-14,54,14);ctx.fillRect(p.x-4,p.top+105,54,14);}
      ctx.fillStyle="#ffd447";ctx.beginPath();ctx.arc(72,birdY,12,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(77,birdY-4,4,0,Math.PI*2);ctx.fill();ctx.fillStyle="#222";ctx.beginPath();ctx.arc(78,birdY-4,1.8,0,Math.PI*2);ctx.fill();ctx.fillStyle="#f47a32";ctx.beginPath();ctx.moveTo(83,birdY);ctx.lineTo(94,birdY+4);ctx.lineTo(83,birdY+7);ctx.fill();
      if(!started||!running){ctx.fillStyle="#10234b";ctx.font="bold 17px Arial";ctx.textAlign="center";ctx.fillText(started?"Game over!":"Flappy Bird",140,150);ctx.font="12px Arial";ctx.fillText(started?"Press Start to try again":"Press Start to play",140,174);}
    }
    function reset(){birdY=170;velocity=0;pipes=[{x:205,top:95,passed:false}];points=0;score.textContent="Score: 0";running=true;started=true;last=0;start.textContent="Restart";stopGame();gameFrame=requestAnimationFrame(tick);}
    function tick(t){
      if(!running){draw();return;}
      const dt=Math.min((t-last||16)/16,2);last=t;velocity+=0.34*dt;birdY+=velocity*dt;
      for(const p of pipes){p.x-=2.1*dt;if(!p.passed&&p.x+46<72){p.passed=true;points++;score.textContent="Score: "+points;}if(p.x< -50){p.x=300;p.top=55+Math.random()*160;p.passed=false;}
        if(72+10>p.x&&72-10<p.x+46&&(birdY-10<p.top||birdY+10>p.top+105))running=false;}
      if(birdY>315||birdY<5)running=false;
      draw(); if(running)gameFrame=requestAnimationFrame(tick); else {gameFrame=0;draw();}
    }
    function flap(){if(!running){if(!started)reset();return;}velocity=-5.4;}
    canvas.addEventListener("pointerdown",flap);
    const keyHandler=e=>{if(e.code==="Space"&&!view.hidden&&open){e.preventDefault();flap();}};
    gameKeyHandler = keyHandler;
    window.addEventListener("keydown",gameKeyHandler);
    start.addEventListener("click",reset);
    draw();
  }
  function renderFocus() {
    stopGame(); viewtitle.textContent = "Subway Surfers Focus";
    const desc = element("p","welcome","A simple 25-minute focus session. Stay on task, then take a break.");
    const clock = element("div","focusclock",formatTime(focusSeconds));
    const actions = element("div","focusactions");
    const start = element("button","primary","Start focus"); start.type="button";
    const reset = element("button","secondary","Reset"); reset.type="button";
    actions.append(start,reset); viewbody.append(desc,clock,actions);
    start.addEventListener("click",()=>{
      if(focusInterval){clearFocusTimer();start.textContent="Resume";return;}
      start.textContent="Pause";
      focusInterval=setInterval(()=>{focusSeconds=Math.max(0,focusSeconds-1);clock.textContent=formatTime(focusSeconds);if(!focusSeconds){clearFocusTimer();start.textContent="Finished!";}},1000);
    });
    reset.addEventListener("click",()=>{clearFocusTimer();focusSeconds=25*60;clock.textContent=formatTime(focusSeconds);start.textContent="Start focus";});
  }
  function formatTime(s){return Math.floor(s/60).toString().padStart(2,"0")+":"+Math.floor(s%60).toString().padStart(2,"0");}

  launcher.addEventListener("click", () => {
    if (open) hideMenu();
    else showMenu();
  });
  // Keep the menu open while the pointer moves away; dismiss only on an outside click.
  document.addEventListener("click", e => {
    if (open && activeView !== "focus" && !e.composedPath().includes(host)) hideMenu();
  }, true);
  root.getElementById("options").addEventListener("click",e=>{
    const button=e.target.closest("[data-view]"); if(!button)return;
    const name=button.dataset.view;
    if(name==="website"){hideMenu();window.open("https://superstar-oa7t.onrender.com","_blank","noopener");return;}
    showView(name);
  });
  root.getElementById("back").addEventListener("click",showMenu);
  root.getElementById("close").addEventListener("click",hideMenu);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&open)hideMenu();});
})();
