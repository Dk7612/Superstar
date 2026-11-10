(() => {
  const canvas = document.getElementById("skyCanvas");
  if (!canvas) return;
  const gamePanel = document.getElementById("skyGame");

  const context = canvas.getContext("2d");
  const $ = id => document.getElementById(id);
  const levelSelect = $("skyLevelSelect");
  const overlay = $("skyOverlay");
  const WIDTH = canvas.width, HEIGHT = canvas.height, LEVELS = 50;
  const SHAFT = { left: -4.7, right: 4.7, bottom: -3.25, top: 3.25 };
  const CAMERA_DISTANCE = 10, FOCAL_LENGTH = 760, HORIZON = HEIGHT * .34, CAMERA_Y = 2;
  const STORAGE_KEY = "superstar-skyfall-progress-v1";
  const keys = { left: false, right: false, up: false, down: false };
  const stars = Array.from({ length: 60 }, (_, i) => ({ x: (i * 197 + 31) % WIDTH, y: (i * 281 + 17) % HEIGHT, size: i % 6 === 0 ? 2 : 1 }));
  let level = 1, unlocked = 1, stage, state = "ready", playerX = 0, playerY = 0, distance = 0, elapsed = 0, lastFrame = 0, lastHud = 0, fallRotation = 0;

  async function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Number.isInteger(saved.unlocked)) unlocked = Math.max(1, Math.min(LEVELS, saved.unlocked));
    } catch { unlocked = 1; }
    const bestTimes = readBestTimes();
    const saved = await window.SuperstarGameSaves.load("skyfall3d", { unlocked, bestTimes });
    unlocked = Math.max(1, Math.min(LEVELS, saved.unlocked));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked })); } catch { /* Continue without local progress caching. */ }
    for (let n = 1; n <= LEVELS; n++) {
      try { localStorage.removeItem(`superstar-skyfall-best-${n}`); } catch { break; }
    }
    for (const [level, seconds] of Object.entries(saved.bestTimes)) {
      try { localStorage.setItem(`superstar-skyfall-best-${level}`, String(seconds)); } catch { /* Best times are optional. */ }
    }
  }
  function readBestTimes() {
    const bestTimes = {};
    for (let n = 1; n <= LEVELS; n++) {
      try {
        const value = Number(localStorage.getItem(`superstar-skyfall-best-${n}`));
        if (Number.isFinite(value) && value > 0) bestTimes[n] = value;
      } catch { break; }
    }
    return bestTimes;
  }
  function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked })); } catch { /* Continue without persistent progress. */ }
    window.SuperstarGameSaves.save("skyfall3d", { unlocked, bestTimes: readBestTimes() });
  }
  function bestFor(n) {
    try { const value = Number(localStorage.getItem(`superstar-skyfall-best-${n}`)); return Number.isFinite(value) && value > 0 ? value : null; }
    catch { return null; }
  }
  function saveBest(n, seconds) {
    const old = bestFor(n);
    if (old !== null && old <= seconds) return old;
    try { localStorage.setItem(`superstar-skyfall-best-${n}`, String(seconds)); } catch { /* Best times are optional. */ }
    saveProgress();
    return seconds;
  }
  function rng(seed) {
    let value = seed >>> 0;
    return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function createStage(n) {
    const random = rng(n * 104729 + 7919);
    const count = 5 + Math.floor((n - 1) / 5);
    const gap = Math.max(1.8, 3.15 - (n - 1) * .027);
    const gates = [];
    let centerX = 0, centerY = 0;
    for (let index = 0; index < count; index++) {
      centerX += (random() * 2 - 1) * 1.5;
      centerY += (random() * 2 - 1) * 1.25;
      const marginX = gap / 2 + .4, marginY = gap / 2 + .4;
      centerX = Math.max(SHAFT.left + marginX, Math.min(SHAFT.right - marginX, centerX));
      centerY = Math.max(SHAFT.bottom + marginY, Math.min(SHAFT.top - marginY, centerY));
      gates.push({ distance: 38 + index * 25, centerX, centerY, gap });
    }
    const finish = gates[gates.length - 1].distance + 27;
    return { gates, finish, speed: 8.5 * Math.pow(1.018, n - 1), steer: 7.2 };
  }
  function difficulty(n) { return n < 6 ? "First dive" : n < 16 ? "Winding tower" : n < 31 ? "Deep drop" : n < 46 ? "Expert diver" : "Skyfall legend"; }
  function renderLevels() {
    levelSelect.replaceChildren();
    for (let n = 1; n <= unlocked; n++) {
      const option = document.createElement("option"); option.value = String(n); option.textContent = `Level ${String(n).padStart(2, "0")}`; levelSelect.appendChild(option);
    }
    levelSelect.value = String(level);
  }
  function timeText(value) {
    if (!Number.isFinite(value)) return "—";
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  }
  function updateHud() {
    const percent = stage ? Math.floor(Math.max(0, Math.min(1, distance / stage.finish)) * 100) : 0;
    $("skyLevelName").textContent = `LEVEL ${String(level).padStart(2, "0")} / ${LEVELS}`;
    $("skyDifficulty").textContent = difficulty(level);
    $("skyProgressFill").style.width = `${percent}%`;
    $("skyProgressPercent").textContent = `${percent}%`;
    document.querySelector("#skyGame .progress-track").setAttribute("aria-valuenow", String(percent));
    $("skyBestTime").textContent = timeText(bestFor(level));
    levelSelect.value = String(level);
    $("skyPause").disabled = state !== "playing" && state !== "paused";
    $("skyPause").textContent = state === "paused" ? "Resume" : "Pause";
    $("skyPause").setAttribute("aria-label", state === "paused" ? "Resume Skyfall 3D" : "Pause Skyfall 3D");
  }
  function show(kicker, title, message, label) {
    $("skyOverlayKicker").textContent = kicker; $("skyOverlayTitle").textContent = title;
    $("skyOverlayMessage").textContent = message; $("skyAction").textContent = label; overlay.hidden = false;
  }
  function loadLevel(n) {
    level = Math.max(1, Math.min(unlocked, n)); stage = createStage(level);
    playerX = 0; playerY = 0; distance = 0; elapsed = 0; fallRotation = 0; state = "ready";
    show(`LEVEL ${String(level).padStart(2, "0")} · ${LEVELS}`, "Ready to jump?", "Dodge left, right, up and down through the square gaps. Miss one and you'll restart this level.", `Start level ${level}`);
    $("skyAnnouncement").textContent = `Skyfall level ${level} ready.`; updateHud();
  }
  function start() {
    playerX = 0; playerY = 0; distance = 0; elapsed = 0; fallRotation = 0; state = "playing"; overlay.hidden = true; updateHud();
  }
  function fail() {
    if (state !== "playing") return;
    state = "dead"; show("SPLAT!", "Obstacle hit", "Find the glowing square opening and steer through its center. Try this level again.", "Retry level");
    $("skyAnnouncement").textContent = `Skyfall level ${level} failed. Retry when ready.`; updateHud();
  }
  function complete() {
    if (state !== "playing") return;
    const best = saveBest(level, elapsed); state = level === LEVELS ? "won" : "complete";
    if (level < LEVELS && unlocked < level + 1) { unlocked = level + 1; saveProgress(); renderLevels(); }
    if (state === "won") {
      show("ALL 50 FLOORS", "Skyfall legend!", `You made it through the whole tower in ${timeText(best)}.`, "Replay level 50");
      $("skyAnnouncement").textContent = "All 50 Skyfall levels complete. What a dive!";
    } else {
      show(`LEVEL ${String(level).padStart(2, "0")} CLEARED`, "Clean landing!", `Level ${level + 1} is unlocked. The tower gets faster and tighter.`, `Continue to level ${level + 1}`);
      $("skyAnnouncement").textContent = `Skyfall level ${level} complete. Level ${level + 1} unlocked.`;
    }
    updateHud();
  }
  function pause() {
    if (state === "playing") { state = "paused"; show("PAUSED", "Mid-air break", "The tower can wait. Resume when you are ready to dive again.", "Resume"); }
    else if (state === "paused") { state = "playing"; overlay.hidden = true; lastFrame = 0; }
    updateHud();
  }
  function action() {
    if (state === "ready" || state === "dead") start();
    else if (state === "paused") pause();
    else if (state === "complete") loadLevel(level + 1);
    else if (state === "won") loadLevel(LEVELS);
  }
  function clearKeys() { for (const direction of Object.keys(keys)) keys[direction] = false; }
  function update(dt) {
    if (state !== "playing") return;
    elapsed += dt;
    playerX += (Number(keys.right) - Number(keys.left)) * stage.steer * dt;
    playerY += (Number(keys.up) - Number(keys.down)) * stage.steer * dt;
    playerX = Math.max(SHAFT.left + .3, Math.min(SHAFT.right - .3, playerX));
    playerY = Math.max(SHAFT.bottom + .3, Math.min(SHAFT.top - .3, playerY));
    distance += stage.speed * dt;
    fallRotation += dt * (Number(keys.right) - Number(keys.left)) * 1.2;
    for (const gate of stage.gates) {
      if (!gate.passed && distance >= gate.distance) {
        gate.passed = true;
        const safeRadius = gate.gap / 2 - .3;
        if (Math.abs(playerX - gate.centerX) > safeRadius || Math.abs(playerY - gate.centerY) > safeRadius) { fail(); break; }
      }
    }
    if (state === "playing" && distance >= stage.finish) complete();
    if (performance.now() - lastHud > 100) { updateHud(); lastHud = performance.now(); }
  }
  function project(x, y, depth) {
    const scale = FOCAL_LENGTH / (depth + CAMERA_DISTANCE);
    return { x: WIDTH / 2 + x * scale, y: HORIZON + (CAMERA_Y - y) * scale, scale };
  }
  function polygon(points, color) {
    context.fillStyle = color; context.beginPath(); context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) context.lineTo(points[index].x, points[index].y);
    context.closePath(); context.fill();
  }
  function drawTunnel() {
    const far = 108;
    const leftNearTop = project(SHAFT.left, SHAFT.top, 0), leftNearBottom = project(SHAFT.left, SHAFT.bottom, 0);
    const leftFarTop = project(SHAFT.left, SHAFT.top, far), leftFarBottom = project(SHAFT.left, SHAFT.bottom, far);
    const rightNearTop = project(SHAFT.right, SHAFT.top, 0), rightNearBottom = project(SHAFT.right, SHAFT.bottom, 0);
    const rightFarTop = project(SHAFT.right, SHAFT.top, far), rightFarBottom = project(SHAFT.right, SHAFT.bottom, far);
    polygon([leftFarTop, leftNearTop, leftNearBottom, leftFarBottom], "rgba(67,74,129,.2)");
    polygon([rightFarTop, rightNearTop, rightNearBottom, rightFarBottom], "rgba(58,62,112,.2)");
    polygon([leftFarTop, rightFarTop, rightNearTop, leftNearTop], "rgba(99,95,160,.12)");
    polygon([leftFarBottom, rightFarBottom, rightNearBottom, leftNearBottom], "rgba(55,93,145,.18)");
    const drift = distance % 14;
    for (let index = 0; index < 9; index++) {
      const depth = 14 * index - drift;
      if (depth < .5 || depth > far) continue;
      const corners = [project(SHAFT.left, SHAFT.bottom, depth), project(SHAFT.right, SHAFT.bottom, depth), project(SHAFT.right, SHAFT.top, depth), project(SHAFT.left, SHAFT.top, depth)];
      context.strokeStyle = "rgba(132,170,237,.18)"; context.lineWidth = Math.max(.7, 1.4 - depth / 100); context.beginPath();
      context.moveTo(corners[0].x, corners[0].y); for (let c = 1; c < corners.length; c++) context.lineTo(corners[c].x, corners[c].y);
      context.closePath(); context.stroke();
    }
    context.lineWidth = 2;
    for (const x of [SHAFT.left, SHAFT.right]) for (const y of [SHAFT.bottom, SHAFT.top]) {
      const a = project(x, y, 0), b = project(x, y, far);
      context.strokeStyle = "rgba(153,177,255,.55)"; context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
  }
  function drawBox(box, depth, thickness, hue) {
    const front = [project(box.x1, box.y1, depth), project(box.x2, box.y1, depth), project(box.x2, box.y2, depth), project(box.x1, box.y2, depth)];
    const back = [project(box.x1, box.y1, depth + thickness), project(box.x2, box.y1, depth + thickness), project(box.x2, box.y2, depth + thickness), project(box.x1, box.y2, depth + thickness)];
    const light = `hsl(${hue} 78% 57%)`, face = `hsl(${hue} 75% 43%)`, shadow = `hsl(${hue} 72% 29%)`;
    polygon([front[1], front[2], back[2], back[1]], shadow);
    polygon([front[2], front[3], back[3], back[2]], light);
    polygon(front, face);
    context.strokeStyle = "rgba(255,255,255,.22)"; context.lineWidth = 1;
    context.beginPath(); context.moveTo(front[3].x, front[3].y); context.lineTo(front[2].x, front[2].y); context.lineTo(back[2].x, back[2].y); context.stroke();
    context.fillStyle = "rgba(255,255,255,.18)";
    const stripeY = front[3].y + (front[0].y - front[3].y) * .3;
    context.fillRect(front[0].x + 5, stripeY, Math.max(0, front[1].x - front[0].x - 10), 2);
  }
  function drawGate(gate) {
    const depth = gate.distance - distance;
    if (depth < -1.5 || depth > 108) return;
    const half = gate.gap / 2, gx1 = gate.centerX - half, gx2 = gate.centerX + half;
    const gy1 = gate.centerY - half, gy2 = gate.centerY + half;
    const blocks = [
      { x1: SHAFT.left, x2: gx1, y1: SHAFT.bottom, y2: SHAFT.top },
      { x1: gx2, x2: SHAFT.right, y1: SHAFT.bottom, y2: SHAFT.top },
      { x1: gx1, x2: gx2, y1: SHAFT.bottom, y2: gy1 },
      { x1: gx1, x2: gx2, y1: gy2, y2: SHAFT.top }
    ];
    for (const block of blocks) if (block.x2 - block.x1 > 0.01 && block.y2 - block.y1 > 0.01) drawBox(block, Math.max(0, depth), .82, 346 + level * 2 % 30);
    const opening = [project(gx1, gy1, Math.max(0, depth)), project(gx2, gy1, Math.max(0, depth)), project(gx2, gy2, Math.max(0, depth)), project(gx1, gy2, Math.max(0, depth))];
    context.strokeStyle = "rgba(109,245,226,.9)"; context.shadowColor = "#65ffe5"; context.shadowBlur = 12; context.lineWidth = 2;
    context.beginPath(); context.moveTo(opening[0].x, opening[0].y); for (let index = 1; index < opening.length; index++) context.lineTo(opening[index].x, opening[index].y); context.closePath(); context.stroke(); context.shadowBlur = 0;
  }
  function drawPlayer() {
    const p = project(playerX, playerY, 0), scale = p.scale, bodyWidth = 14, bodyHeight = 20;
    context.save(); context.translate(p.x, p.y); context.rotate(fallRotation * .08);
    context.fillStyle = "rgba(0,0,0,.4)"; context.beginPath(); context.ellipse(0, bodyHeight * .74, bodyWidth * .95, 4, 0, 0, Math.PI * 2); context.fill();
    context.shadowColor = "#70eaff"; context.shadowBlur = 18;
    context.fillStyle = "#36b7df"; context.fillRect(-bodyWidth / 2, -bodyHeight / 2 + 5, bodyWidth, bodyHeight * .78);
    context.fillStyle = "#b9f4ff"; context.fillRect(-bodyWidth * .42, -bodyHeight / 2 - 7, bodyWidth * .84, 11);
    context.fillStyle = "#20345e"; context.fillRect(-bodyWidth * .28, -bodyHeight / 2 - 3, bodyWidth * .18, 2);
    context.fillRect(bodyWidth * .1, -bodyHeight / 2 - 3, bodyWidth * .18, 2);
    context.fillStyle = "#3282b5"; context.fillRect(-bodyWidth / 2 - 4, -bodyHeight / 2 + 8, 4, 12); context.fillRect(bodyWidth / 2, -bodyHeight / 2 + 8, 4, 12);
    context.fillStyle = "#344c7c"; context.fillRect(-bodyWidth / 2 + 1, bodyHeight * .28, 5, 9); context.fillRect(2, bodyHeight * .28, 5, 9);
    context.restore();
  }
  function draw() {
    const sky = context.createLinearGradient(0, 0, 0, HEIGHT); sky.addColorStop(0, "#10142c"); sky.addColorStop(.5, "#171d3a"); sky.addColorStop(1, "#080b18");
    context.fillStyle = sky; context.fillRect(0, 0, WIDTH, HEIGHT);
    for (const star of stars) {
      const sy = ((star.y + distance * 19) % HEIGHT + HEIGHT) % HEIGHT;
      context.fillStyle = `rgba(210,230,255,${.22 + (star.size === 2 ? .3 : 0)})`; context.fillRect(star.x, sy, star.size, star.size);
    }
    drawTunnel();
    const visibleGates = stage.gates.filter(gate => gate.distance - distance > -1.5 && gate.distance - distance < 108).sort((a, b) => b.distance - a.distance);
    for (const gate of visibleGates) drawGate(gate);
    const finishDepth = stage.finish - distance;
    if (finishDepth > 0 && finishDepth < 108) {
      const edgeA = project(SHAFT.left, SHAFT.bottom, finishDepth), edgeB = project(SHAFT.right, SHAFT.bottom, finishDepth), edgeC = project(SHAFT.right, SHAFT.top, finishDepth), edgeD = project(SHAFT.left, SHAFT.top, finishDepth);
      context.strokeStyle = "#8affce"; context.shadowColor = "#65ffc4"; context.shadowBlur = 14; context.lineWidth = 3;
      context.beginPath(); context.moveTo(edgeA.x, edgeA.y); context.lineTo(edgeB.x, edgeB.y); context.lineTo(edgeC.x, edgeC.y); context.lineTo(edgeD.x, edgeD.y); context.closePath(); context.stroke(); context.shadowBlur = 0;
      context.fillStyle = "#bcffe5"; context.font = "bold 12px Arial"; context.textAlign = "center"; context.fillText("LANDING PLATFORM", (edgeA.x + edgeB.x) / 2, (edgeA.y + edgeC.y) / 2);
    }
    drawPlayer();
    context.fillStyle = "rgba(205,225,255,.65)"; context.font = "11px Arial"; context.textAlign = "left"; context.fillText(`FALL SPEED  ${(stage.speed * 3.6).toFixed(0)} km/h`, 18, HEIGHT - 18);
  }
  function frame(timestamp) {
    const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .04) : 0; lastFrame = timestamp; update(dt); draw(); requestAnimationFrame(frame);
  }
  document.addEventListener("keydown", event => {
    if (gamePanel.hidden) return;
    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "w", "a", "s", "d"].includes(key)) event.preventDefault();
    if (key === "arrowleft" || key === "a") keys.left = true;
    if (key === "arrowright" || key === "d") keys.right = true;
    if (key === "arrowup" || key === "w") keys.up = true;
    if (key === "arrowdown" || key === "s") keys.down = true;
    if (key === " " && !event.repeat) pause();
  });
  document.addEventListener("keyup", event => {
    if (gamePanel.hidden) { clearKeys(); return; }
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") keys.left = false;
    if (key === "arrowright" || key === "d") keys.right = false;
    if (key === "arrowup" || key === "w") keys.up = false;
    if (key === "arrowdown" || key === "s") keys.down = false;
  });
  window.addEventListener("blur", clearKeys);
  for (const button of document.querySelectorAll(".sky-touch-controls [data-move]")) {
    const direction = button.dataset.move;
    button.addEventListener("pointerdown", event => { event.preventDefault(); keys[direction] = true; button.setPointerCapture(event.pointerId); });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, () => { keys[direction] = false; });
  }
  $("skyAction").addEventListener("click", action);
  $("skyPause").addEventListener("click", pause);
  $("resetSkyfall").addEventListener("click", async () => {
    if (!window.confirm("Reset Skyfall 3D progress for your login code? This clears all unlocked levels and best times for this game.")) return;
    try {
      await window.SuperstarGameSaves.reset("skyfall3d");
      localStorage.removeItem(STORAGE_KEY);
      for (let n = 1; n <= LEVELS; n++) localStorage.removeItem(`superstar-skyfall-best-${n}`);
      window.location.reload();
    } catch (error) {
      console.error("Could not reset Skyfall 3D progress:", error);
      window.alert(error.message);
    }
  });
  levelSelect.addEventListener("change", () => loadLevel(Number(levelSelect.value)));
  document.addEventListener("arcade-tab-change", event => {
    if (event.detail !== "sky" && state === "playing") pause();
    clearKeys();
  });
  $("classicTab").addEventListener("click", () => {
    $("classicTab").setAttribute("aria-selected", "true"); $("classicTab").removeAttribute("tabindex");
    $("skyTab").setAttribute("aria-selected", "false"); $("skyTab").setAttribute("tabindex", "-1");
    $("classicGame").hidden = false; $("skyGame").hidden = true;
    document.dispatchEvent(new CustomEvent("arcade-tab-change", { detail: "classic" }));
  });
  $("skyTab").addEventListener("click", () => {
    $("skyTab").setAttribute("aria-selected", "true"); $("skyTab").removeAttribute("tabindex");
    $("classicTab").setAttribute("aria-selected", "false"); $("classicTab").setAttribute("tabindex", "-1");
    $("skyGame").hidden = false; $("classicGame").hidden = true;
    document.dispatchEvent(new CustomEvent("arcade-tab-change", { detail: "sky" }));
  });
  async function initialize() {
    await loadSaved();
    renderLevels(); loadLevel(1); requestAnimationFrame(frame);
  }
  initialize().catch(error => console.error("Could not initialize Skyfall 3D:", error));
})();