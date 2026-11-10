(() => {
  const canvas = document.getElementById("dropperCanvas");
  if (!canvas) return;
  const gamePanel = document.getElementById("classicGame");
  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);
  const levelSelect = $("levelSelect");
  const overlay = $("gameOverlay");
  const WIDTH = canvas.width, HEIGHT = canvas.height, LEFT = 72, RIGHT = 648, LEVELS = 50;
  const KEY = "superstar-dropper-progress-v1";
  const keys = { left: false, right: false };
  const stars = Array.from({ length: 48 }, (_, i) => ({ x: (i * 167 + 37) % WIDTH, y: (i * 283 + 61) % HEIGHT, size: i % 5 ? 1 : 2 }));
  let level = 1, unlocked = 1, stage, state = "ready", x = WIDTH / 2, y = 70, previousY = y, cameraY = 0, elapsed = 0, lastFrame = 0, lastHud = 0;

  async function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && Number.isInteger(saved.unlocked)) unlocked = Math.max(1, Math.min(LEVELS, saved.unlocked));
    } catch { unlocked = 1; }
    const bestTimes = readBestTimes();
    const saved = await window.SuperstarGameSaves.load("dropper", { unlocked, bestTimes });
    unlocked = Math.max(1, Math.min(LEVELS, saved.unlocked));
    try { localStorage.setItem(KEY, JSON.stringify({ unlocked })); } catch { /* Continue without local progress caching. */ }
    for (let n = 1; n <= LEVELS; n++) {
      try { localStorage.removeItem(`superstar-dropper-best-${n}`); } catch { break; }
    }
    for (const [level, seconds] of Object.entries(saved.bestTimes)) {
      try { localStorage.setItem(`superstar-dropper-best-${level}`, String(seconds)); } catch { /* Best times are optional. */ }
    }
  }
  function readBestTimes() {
    const bestTimes = {};
    for (let n = 1; n <= LEVELS; n++) {
      try {
        const value = Number(localStorage.getItem(`superstar-dropper-best-${n}`));
        if (Number.isFinite(value) && value > 0) bestTimes[n] = value;
      } catch { break; }
    }
    return bestTimes;
  }
  function saveProgress() {
    try { localStorage.setItem(KEY, JSON.stringify({ unlocked })); } catch { /* Continue without persistent progress. */ }
    window.SuperstarGameSaves.save("dropper", { unlocked, bestTimes: readBestTimes() });
  }
  function bestFor(n) {
    try { const value = Number(localStorage.getItem(`superstar-dropper-best-${n}`)); return Number.isFinite(value) && value > 0 ? value : null; }
    catch { return null; }
  }
  function saveBest(n, seconds) {
    const old = bestFor(n);
    if (old !== null && old <= seconds) return old;
    try { localStorage.setItem(`superstar-dropper-best-${n}`, String(seconds)); } catch { /* Best times are optional. */ }
    saveProgress();
    return seconds;
  }
  function rng(seed) {
    let value = seed >>> 0;
    return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function createStage(n) {
    const random = rng(n * 7919 + 104729), count = 4 + Math.floor((n - 1) / 5), gap = Math.max(126, 250 - (n - 1) * 2.45), gates = [];
    let center = WIDTH / 2;
    for (let i = 0; i < count; i++) {
      center += (random() * 2 - 1) * Math.max(48, gap * .6);
      center = Math.max(LEFT + gap / 2 + 18, Math.min(RIGHT - gap / 2 - 18, center));
      gates.push({ y: 430 + i * 310, center, width: gap });
    }
    const finish = gates[gates.length - 1].y + 400;
    return { gates, finish, speed: 180 * Math.pow(1.022, n - 1), steer: 365 };
  }
  function difficulty(n) { return n < 6 ? "Warm up" : n < 16 ? "Picking up" : n < 31 ? "Fast fall" : n < 46 ? "Expert drop" : "Superstar"; }
  function renderLevels() {
    levelSelect.replaceChildren();
    for (let n = 1; n <= unlocked; n++) { const option = document.createElement("option"); option.value = String(n); option.textContent = `Level ${String(n).padStart(2, "0")}`; levelSelect.appendChild(option); }
    levelSelect.value = String(level);
  }
  function timeText(value) {
    if (!Number.isFinite(value)) return "—";
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  }
  function updateHud() {
    const percent = stage ? Math.floor(Math.max(0, Math.min(1, (y - 70) / (stage.finish - 70))) * 100) : 0;
    $("levelName").textContent = `LEVEL ${String(level).padStart(2, "0")} / ${LEVELS}`;
    $("difficulty").textContent = difficulty(level);
    $("progressFill").style.width = `${percent}%`;
    $("progressPercent").textContent = `${percent}%`;
    document.querySelector(".progress-track").setAttribute("aria-valuenow", String(percent));
    $("bestTime").textContent = timeText(bestFor(level));
    levelSelect.value = String(level);
    $("pauseButton").disabled = state !== "playing" && state !== "paused";
    $("pauseButton").textContent = state === "paused" ? "Resume" : "Pause";
    $("pauseButton").setAttribute("aria-label", state === "paused" ? "Resume game" : "Pause game");
  }
  function show(kicker, title, message, label) {
    $("overlayKicker").textContent = kicker; $("overlayTitle").textContent = title;
    $("overlayMessage").textContent = message; $("gameAction").textContent = label; overlay.hidden = false;
  }
  function loadLevel(n) {
    level = Math.max(1, Math.min(unlocked, n)); stage = createStage(level); x = WIDTH / 2; y = 70; previousY = y; cameraY = 0; elapsed = 0; state = "ready";
    show(`LEVEL ${String(level).padStart(2, "0")} · ${LEVELS}`, "Ready to drop?", "Steer through every opening. The further you fall, the faster it gets.", `Start level ${level}`);
    $("gameAnnouncement").textContent = `Level ${level} ready.`; updateHud();
  }
  function start() { x = WIDTH / 2; y = 70; previousY = y; cameraY = 0; elapsed = 0; state = "playing"; overlay.hidden = true; updateHud(); }
  function fail() {
    if (state !== "playing") return;
    state = "dead"; show("TRY AGAIN", "Missed the opening", "A little more steering will get you through. Your level is saved.", "Retry level");
    $("gameAnnouncement").textContent = `Level ${level} failed. Retry when ready.`; updateHud();
  }
  function complete() {
    if (state !== "playing") return;
    const best = saveBest(level, elapsed); state = level === LEVELS ? "won" : "complete";
    if (level < LEVELS && unlocked < level + 1) { unlocked = level + 1; saveProgress(); renderLevels(); }
    if (state === "won") {
      show("ALL 50 FLOORS", "You made it!", `Every level cleared. Your final drop took ${timeText(best)}.`, "Replay level 50");
      $("gameAnnouncement").textContent = "All 50 levels complete. Superstar!";
    } else {
      show(`LEVEL ${String(level).padStart(2, "0")} CLEARED`, "Nice drop!", `Level ${level + 1} is unlocked. Ready for a faster fall?`, `Continue to level ${level + 1}`);
      $("gameAnnouncement").textContent = `Level ${level} complete. Level ${level + 1} unlocked.`;
    }
    updateHud();
  }
  function pause() {
    if (state === "playing") { state = "paused"; show("PAUSED", "Take a breather", "Your fall is on hold. Pick up where you left off when you're ready.", "Resume"); }
    else if (state === "paused") { state = "playing"; overlay.hidden = true; lastFrame = 0; }
    updateHud();
  }
  function action() {
    if (state === "ready" || state === "dead") start();
    else if (state === "paused") pause();
    else if (state === "complete") loadLevel(level + 1);
    else if (state === "won") loadLevel(LEVELS);
  }
  function update(dt) {
    if (state !== "playing") return;
    elapsed += dt; previousY = y;
    x += (Number(keys.right) - Number(keys.left)) * stage.steer * dt;
    x = Math.max(LEFT + 18, Math.min(RIGHT - 18, x)); y += stage.speed * dt; cameraY = Math.max(0, y - 220);
    for (const gate of stage.gates) {
      if (previousY < gate.y - 12 && y >= gate.y - 12) {
        if (x - 12 < gate.center - gate.width / 2 || x + 12 > gate.center + gate.width / 2) { fail(); break; }
      }
    }
    if (state === "playing" && y + 12 >= stage.finish) complete();
    if (performance.now() - lastHud > 100) { updateHud(); lastHud = performance.now(); }
  }
  function drawGate(gate) {
    const gy = gate.y - cameraY;
    if (gy < -40 || gy > HEIGHT + 40) return;
    const start = gate.center - gate.width / 2, end = gate.center + gate.width / 2;
    ctx.fillStyle = "#49345f"; ctx.shadowColor = "#ff6796"; ctx.shadowBlur = 13;
    ctx.fillRect(LEFT, gy - 10, start - LEFT, 20); ctx.fillRect(end, gy - 10, RIGHT - end, 20); ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,174,207,.9)"; ctx.fillRect(LEFT, gy - 10, start - LEFT, 2); ctx.fillRect(end, gy - 10, RIGHT - end, 2);
    ctx.setLineDash([5, 8]); ctx.strokeStyle = "rgba(156,231,255,.65)"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(start, gy - 19); ctx.lineTo(start, gy + 19); ctx.moveTo(end, gy - 19); ctx.lineTo(end, gy + 19); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "rgba(156,231,255,.55)"; ctx.font = "10px Arial"; ctx.textAlign = "left"; ctx.fillText("GAP", start + 7, gy - 17);
  }
  function draw() {
    const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT); bg.addColorStop(0, "#111b37"); bg.addColorStop(1, "#080d1d"); ctx.fillStyle = bg; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const star of stars) { const sy = ((star.y + cameraY * .22) % HEIGHT + HEIGHT) % HEIGHT; ctx.fillStyle = "rgba(210,225,255,.45)"; ctx.fillRect(star.x, sy, star.size, star.size); }
    ctx.fillStyle = "rgba(94,117,185,.07)"; ctx.fillRect(LEFT, 0, RIGHT - LEFT, HEIGHT);
    ctx.fillStyle = "rgba(140,167,255,.18)"; ctx.fillRect(LEFT - 2, 0, 2, HEIGHT); ctx.fillRect(RIGHT, 0, 2, HEIGHT);
    for (let i = 0; i < 8; i++) { const gy = ((i * 100 - cameraY * .75) % HEIGHT + HEIGHT) % HEIGHT; ctx.strokeStyle = "rgba(150,174,235,.07)"; ctx.beginPath(); ctx.moveTo(LEFT + 5, gy); ctx.lineTo(RIGHT - 5, gy); ctx.stroke(); }
    for (const gate of stage.gates) drawGate(gate);
    const finishY = stage.finish - cameraY;
    if (finishY > -30 && finishY < HEIGHT + 30) { ctx.fillStyle = "rgba(105,245,199,.16)"; ctx.fillRect(LEFT, finishY - 8, RIGHT - LEFT, 16); ctx.fillStyle = "#7bf0c3"; ctx.fillRect(LEFT, finishY - 2, RIGHT - LEFT, 4); ctx.fillStyle = "#b2ffe5"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center"; ctx.fillText("FINISH", WIDTH / 2, finishY - 15); }
    const py = y - cameraY, ball = ctx.createRadialGradient(x - 4, py - 5, 2, x, py, 15); ball.addColorStop(0, "#fff"); ball.addColorStop(.38, "#a9f1ff"); ball.addColorStop(1, "#55a9e3");
    ctx.shadowColor = "#76dcff"; ctx.shadowBlur = 20; ctx.fillStyle = ball; ctx.beginPath(); ctx.arc(x, py, 12, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.beginPath(); ctx.arc(x - 4, py - 4, 3, 0, Math.PI * 2); ctx.fill();
  }
  function frame(timestamp) {
    const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .04) : 0; lastFrame = timestamp; update(dt); draw(); requestAnimationFrame(frame);
  }
  document.addEventListener("keydown", event => {
    if (gamePanel.hidden) return;
    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", " ", "a", "d"].includes(key)) event.preventDefault();
    if (key === "arrowleft" || key === "a") keys.left = true;
    if (key === "arrowright" || key === "d") keys.right = true;
    if (key === " " && !event.repeat) pause();
  });
  document.addEventListener("keyup", event => { const key = event.key.toLowerCase(); if (key === "arrowleft" || key === "a") keys.left = false; if (key === "arrowright" || key === "d") keys.right = false; });
  document.addEventListener("arcade-tab-change", event => { if (event.detail !== "classic" && state === "playing") pause(); keys.left = false; keys.right = false; });
  window.addEventListener("blur", () => { keys.left = false; keys.right = false; });
  for (const button of document.querySelectorAll(".touch-controls [data-direction]")) {
    const direction = button.dataset.direction;
    button.addEventListener("pointerdown", event => { event.preventDefault(); keys[direction] = true; button.setPointerCapture(event.pointerId); });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, () => { keys[direction] = false; });
  }
  $("gameAction").addEventListener("click", action); $("pauseButton").addEventListener("click", pause);
  $("resetDropper").addEventListener("click", async () => {
    if (!window.confirm("Reset The Drop progress for your login code? This clears all unlocked levels and best times for this game.")) return;
    try {
      await window.SuperstarGameSaves.reset("dropper");
      localStorage.removeItem(KEY);
      for (let n = 1; n <= LEVELS; n++) localStorage.removeItem(`superstar-dropper-best-${n}`);
      window.location.reload();
    } catch (error) {
      console.error("Could not reset The Drop progress:", error);
      window.alert(error.message);
    }
  });
  levelSelect.addEventListener("change", () => loadLevel(Number(levelSelect.value)));
  async function initialize() {
    await loadSaved();
    renderLevels(); loadLevel(1); requestAnimationFrame(frame);
  }
  initialize().catch(error => console.error("Could not initialize The Drop:", error));
})();
