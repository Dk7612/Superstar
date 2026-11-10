(() => {
  const canvas = document.getElementById("skyCanvas");
  if (!canvas) return;
  const gamePanel = document.getElementById("skyGame");

  const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
  const $ = id => document.getElementById(id);
  const levelSelect = $("skyLevelSelect");
  const overlay = $("skyOverlay");
  const LEVELS = 50;
  const SHAFT = { left: -4.7, right: 4.7, bottom: -3.25, top: 3.25 };
  const STORAGE_KEY = "superstar-skyfall-progress-v1";
  const keys = { left: false, right: false, up: false, down: false };
  let level = 1, unlocked = 1, stage, state = "ready", playerX = 0, playerY = 0, distance = 0, elapsed = 0, lastFrame = 0, lastHud = 0, cameraYaw = 0, cameraPitch = .18;

  if (!gl) {
    $("skyOverlayKicker").textContent = "3D rendering unavailable";
    $("skyOverlayTitle").textContent = "WebGL is not available";
    $("skyOverlayMessage").textContent = "Enable hardware acceleration or use a browser that supports WebGL to play Skyfall 3D.";
    $("skyAction").hidden = true;
    return;
  }

  canvas.tabIndex = 0;
  canvas.style.touchAction = "none";
  const vertexShaderSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    uniform mat4 uViewProjection;
    uniform mat4 uModel;
    varying vec3 vNormal;
    void main() {
      vNormal = mat3(uModel) * aNormal;
      gl_Position = uViewProjection * uModel * vec4(aPosition, 1.0);
    }
  `;
  const fragmentShaderSource = `
    precision mediump float;
    uniform vec4 uColor;
    varying vec3 vNormal;
    void main() {
      vec3 normal = normalize(vNormal);
      float light = 0.48 + 0.52 * max(dot(normal, normalize(vec3(-0.35, 0.8, 0.45))), 0.0);
      gl_FragColor = vec4(uColor.rgb * light, uColor.a);
    }
  `;
  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Could not compile Skyfall 3D shader: ${error}`);
    }
    return shader;
  }
  function createProgram() {
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Could not link Skyfall 3D renderer: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
  }
  function createMesh(vertices) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    return { buffer, count: vertices.length / 6 };
  }
  function createCubeMesh() {
    const faces = [
      [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
      [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
      [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
      [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
      [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
      [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]]
    ];
    const vertices = [];
    for (const [normal, corners] of faces) {
      for (const index of [0, 1, 2, 0, 2, 3]) vertices.push(...corners[index].map(value => value * .5), ...normal);
    }
    return createMesh(vertices);
  }
  function createSphereMesh() {
    const vertices = [];
    const rings = 10, segments = 14;
    const points = [];
    for (let ring = 0; ring <= rings; ring++) {
      const theta = ring * Math.PI / rings;
      const row = [];
      for (let segment = 0; segment <= segments; segment++) {
        const phi = segment * Math.PI * 2 / segments;
        row.push([Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)]);
      }
      points.push(row);
    }
    for (let ring = 0; ring < rings; ring++) {
      for (let segment = 0; segment < segments; segment++) {
        const a = points[ring][segment], b = points[ring + 1][segment], c = points[ring + 1][segment + 1], d = points[ring][segment + 1];
        for (const point of [a, b, d, b, c, d]) vertices.push(...point, ...point);
      }
    }
    return createMesh(vertices);
  }
  let program, cubeMesh, sphereMesh, positionLocation, normalLocation, viewProjectionLocation, modelLocation, colorLocation;
  try {
    program = createProgram();
    cubeMesh = createCubeMesh();
    sphereMesh = createSphereMesh();
    positionLocation = gl.getAttribLocation(program, "aPosition");
    normalLocation = gl.getAttribLocation(program, "aNormal");
    viewProjectionLocation = gl.getUniformLocation(program, "uViewProjection");
    modelLocation = gl.getUniformLocation(program, "uModel");
    colorLocation = gl.getUniformLocation(program, "uColor");
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(.025, .04, .1, 1);
  } catch (error) {
    console.error("Could not initialize Skyfall 3D:", error);
    $("skyOverlayKicker").textContent = "3D renderer error";
    $("skyOverlayTitle").textContent = "Skyfall could not start";
    $("skyOverlayMessage").textContent = "This browser could not initialize the 3D renderer. Reload the page or try another browser.";
    $("skyAction").hidden = true;
    return;
  }

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
    playerX = 0; playerY = 0; distance = 0; elapsed = 0; cameraYaw = 0; cameraPitch = .18; state = "ready";
    show(`LEVEL ${String(level).padStart(2, "0")} · ${LEVELS}`, "Ready to jump?", "Dodge left, right, up and down through the square gaps. Miss one and you'll restart this level.", `Start level ${level}`);
    $("skyAnnouncement").textContent = `Skyfall level ${level} ready.`; updateHud();
  }
  function start() {
    playerX = 0; playerY = 0; distance = 0; elapsed = 0; state = "playing"; overlay.hidden = true; updateHud();
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
  function multiplyMatrices(a, b) {
    const result = new Float32Array(16);
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 4; row++) {
        for (let index = 0; index < 4; index++) result[column * 4 + row] += a[index * 4 + row] * b[column * 4 + index];
      }
    }
    return result;
  }
  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), range = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * range, -1,
      0, 0, near * far * 2 * range, 0
    ]);
  }
  function lookAt(eye, center) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let length = Math.hypot(zx, zy, zz) || 1;
    zx /= length; zy /= length; zz /= length;
    let xx = zz, xy = 0, xz = -zx;
    length = Math.hypot(xx, xz) || 1;
    xx /= length; xz /= length;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
    ]);
  }
  function modelMatrix(x, y, z, sx, sy, sz) {
    return new Float32Array([
      sx, 0, 0, 0,
      0, sy, 0, 0,
      0, 0, sz, 0,
      x, y, z, 1
    ]);
  }
  function resizeRenderer() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    return true;
  }
  function setColor(color) {
    gl.uniform4f(colorLocation, color[0], color[1], color[2], 1);
  }
  function drawMesh(mesh, x, y, z, sx, sy, sz, color) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.enableVertexAttribArray(normalLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 24, 12);
    gl.uniformMatrix4fv(modelLocation, false, modelMatrix(x, y, z, sx, sy, sz));
    setColor(color);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }
  function drawBox(x, y, z, sx, sy, sz, color) {
    drawMesh(cubeMesh, x, y, z, sx, sy, sz, color);
  }
  function drawTunnel() {
    const centerY = -distance - 48;
    const wallColor = [.11, .16, .31];
    const railColor = [.25, .39, .66];
    drawBox(SHAFT.left, centerY, 0, .24, 112, SHAFT.top - SHAFT.bottom, wallColor);
    drawBox(SHAFT.right, centerY, 0, .24, 112, SHAFT.top - SHAFT.bottom, wallColor);
    drawBox(0, centerY, SHAFT.bottom, SHAFT.right - SHAFT.left, 112, .24, wallColor);
    drawBox(0, centerY, SHAFT.top, SHAFT.right - SHAFT.left, 112, .24, wallColor);
    for (const x of [SHAFT.left + .12, SHAFT.right - .12]) {
      for (const z of [SHAFT.bottom + .12, SHAFT.top - .12]) drawBox(x, centerY, z, .1, 112, .1, railColor);
    }
    const firstLine = Math.floor(distance / 14) * 14;
    for (let index = 0; index < 9; index++) {
      const lineY = -(firstLine + index * 14);
      if (Math.abs(lineY + distance) > 102) continue;
      const gridColor = [.23, .31, .5];
      drawBox(0, lineY, SHAFT.bottom + .18, SHAFT.right - SHAFT.left - .3, .035, .035, gridColor);
      drawBox(0, lineY, SHAFT.top - .18, SHAFT.right - SHAFT.left - .3, .035, .035, gridColor);
      drawBox(SHAFT.left + .18, lineY, 0, .035, .035, SHAFT.top - SHAFT.bottom - .3, gridColor);
      drawBox(SHAFT.right - .18, lineY, 0, .035, .035, SHAFT.top - SHAFT.bottom - .3, gridColor);
    }
  }
  function drawGate(gate) {
    const y = -gate.distance, half = gate.gap / 2;
    const x1 = gate.centerX - half, x2 = gate.centerX + half;
    const z1 = gate.centerY - half, z2 = gate.centerY + half;
    const blockColor = level < 16 ? [.78, .19, .43] : level < 32 ? [.83, .31, .16] : [.74, .15, .31];
    const leftWidth = x1 - SHAFT.left, rightWidth = SHAFT.right - x2;
    if (leftWidth > .03) drawBox((SHAFT.left + x1) / 2, y, 0, leftWidth, .82, SHAFT.top - SHAFT.bottom, blockColor);
    if (rightWidth > .03) drawBox((x2 + SHAFT.right) / 2, y, 0, rightWidth, .82, SHAFT.top - SHAFT.bottom, blockColor);
    if (z1 > SHAFT.bottom) drawBox((x1 + x2) / 2, y, (SHAFT.bottom + z1) / 2, x2 - x1, .82, z1 - SHAFT.bottom, blockColor);
    if (z2 < SHAFT.top) drawBox((x1 + x2) / 2, y, (z2 + SHAFT.top) / 2, x2 - x1, .82, SHAFT.top - z2, blockColor);
    const glow = [.28, .98, .82];
    drawBox((x1 + x2) / 2, y + .48, z1, x2 - x1, .08, .08, glow);
    drawBox((x1 + x2) / 2, y + .48, z2, x2 - x1, .08, .08, glow);
    drawBox(x1, y + .48, (z1 + z2) / 2, .08, .08, z2 - z1, glow);
    drawBox(x2, y + .48, (z1 + z2) / 2, .08, .08, z2 - z1, glow);
  }
  function drawPlayer() {
    const y = -distance;
    drawMesh(sphereMesh, playerX, y + .05, playerY, .38, .38, .38, [.62, .94, 1]);
    drawBox(playerX, y - .46, playerY, .62, .9, .45, [.18, .78, .94]);
    drawBox(playerX - .43, y - .43, playerY, .24, .62, .25, [.12, .53, .78]);
    drawBox(playerX + .43, y - .43, playerY, .24, .62, .25, [.12, .53, .78]);
    drawBox(playerX - .18, y - .96, playerY, .2, .4, .24, [.18, .35, .63]);
    drawBox(playerX + .18, y - .96, playerY, .2, .4, .24, [.18, .35, .63]);
  }
  function draw() {
    if (gamePanel.hidden || !resizeRenderer()) return;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    const lookDistance = 19, lateralLook = Math.sin(cameraPitch) * lookDistance;
    const target = [
      playerX + Math.sin(cameraYaw) * lateralLook,
      -distance - Math.cos(cameraPitch) * lookDistance,
      playerY - Math.cos(cameraYaw) * lateralLook
    ];
    const eye = [
      playerX - Math.sin(cameraYaw) * 1.8,
      -distance + 2.4,
      playerY + Math.cos(cameraYaw) * 1.8
    ];
    const viewProjection = multiplyMatrices(
      perspective(Math.PI / 3, canvas.width / canvas.height, .1, 240),
      lookAt(eye, target)
    );
    gl.uniformMatrix4fv(viewProjectionLocation, false, viewProjection);
    drawTunnel();
    for (const gate of stage.gates) {
      const relativeDepth = gate.distance - distance;
      if (relativeDepth > -3 && relativeDepth < 105) drawGate(gate);
    }
    const finishDepth = stage.finish - distance;
    if (finishDepth > 0 && finishDepth < 105) {
      const y = -stage.finish, landing = [.2, .94, .64];
      drawBox(0, y, SHAFT.bottom + .12, SHAFT.right - SHAFT.left, .12, .12, landing);
      drawBox(0, y, SHAFT.top - .12, SHAFT.right - SHAFT.left, .12, .12, landing);
      drawBox(SHAFT.left + .12, y, 0, .12, .12, SHAFT.top - SHAFT.bottom, landing);
      drawBox(SHAFT.right - .12, y, 0, .12, .12, SHAFT.top - SHAFT.bottom, landing);
    }
    drawPlayer();
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
  let dragPointer = null, dragX = 0, dragY = 0;
  canvas.addEventListener("pointerdown", event => {
    if (gamePanel.hidden || event.target !== canvas || state !== "playing") return;
    dragPointer = event.pointerId; dragX = event.clientX; dragY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (event.pointerId !== dragPointer) return;
    cameraYaw -= (event.clientX - dragX) * .008;
    cameraPitch = Math.max(-.4, Math.min(1.05, cameraPitch + (event.clientY - dragY) * .006));
    dragX = event.clientX; dragY = event.clientY;
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, event => { if (event.pointerId === dragPointer) dragPointer = null; });
  }
  async function initialize() {
    await loadSaved();
    renderLevels(); loadLevel(1); requestAnimationFrame(frame);
  }
  initialize().catch(error => console.error("Could not initialize Skyfall 3D:", error));
})();