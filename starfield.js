(() => {
  const canvas = document.querySelector(".starfield");
  const directionSelect = document.getElementById("starDirection");
  const speedSelect = document.getElementById("starSpeed");
  const themeSelect = document.getElementById("themeMode");
  if (!canvas || !directionSelect || !speedSelect || !themeSelect) return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;
  const directions = {
    "down-right": [1, 1], "down-left": [-1, 1], "up-right": [1, -1],
    "up-left": [-1, -1], down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0]
  };
  const speeds = { slow: 0.45, normal: 1, fast: 1.8 };
  const storageKey = "superstar-starfield-settings-v2";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0, height = 0, lastFrameTime = 0, lastDrawTime = 0, frame = 0, stars = [];
  let pageVisible = document.visibilityState === "visible";

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const count = Math.min(90, Math.max(35, Math.ceil(width * height / 14500)));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      size: 0.7 + Math.random() * 1.25, speed: 10 + Math.random() * 24,
      trail: 8 + Math.random() * 18, opacity: 0.35 + Math.random() * 0.6
    }));
    renderStatic();
  }

  function renderStatic() {
    context.clearRect(0, 0, width, height);
    for (const star of stars) {
      context.globalAlpha = star.opacity;
      context.fillStyle = "#edf3ff";
      context.beginPath(); context.arc(star.x, star.y, star.size, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
  }

  function applySettings() {
    document.documentElement.dataset.theme = themeSelect.value;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        direction: directionSelect.value, speed: speedSelect.value, theme: themeSelect.value
      }));
    } catch { /* Keep the current page usable when storage is unavailable. */ }
    lastFrameTime = 0;
    if (pageVisible && !reducedMotion.matches) start();
    else renderStatic();
  }

  function draw(timestamp = 0) {
    frame = 0;
    if (!pageVisible || reducedMotion.matches) { renderStatic(); return; }
    // Cap animation at roughly 30 FPS to reduce unnecessary work on low-power devices.
    if (timestamp - lastDrawTime < 32) { frame = requestAnimationFrame(draw); return; }
    const delta = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 0;
    lastFrameTime = timestamp; lastDrawTime = timestamp;
    const [dx, dy] = directions[directionSelect.value] || directions.left;
    const multiplier = speeds[speedSelect.value] || speeds.normal;
    context.clearRect(0, 0, width, height);
    for (const star of stars) {
      star.x += dx * star.speed * multiplier * delta;
      star.y += dy * star.speed * multiplier * delta;
      if (dx < 0 && star.x < -star.trail) star.x = width + star.trail;
      else if (dx > 0 && star.x > width + star.trail) star.x = -star.trail;
      if (dy < 0 && star.y < -star.trail) star.y = height + star.trail;
      else if (dy > 0 && star.y > height + star.trail) star.y = -star.trail;
      context.globalAlpha = star.opacity;
      context.strokeStyle = "#dce8ff";
      context.lineWidth = star.size;
      context.beginPath(); context.moveTo(star.x - dx * star.trail, star.y - dy * star.trail);
      context.lineTo(star.x, star.y); context.stroke();
      context.fillStyle = "#fff"; context.beginPath();
      context.arc(star.x, star.y, star.size, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    frame = requestAnimationFrame(draw);
  }

  function start() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastFrameTime = 0; lastDrawTime = 0;
    if (pageVisible && !reducedMotion.matches) frame = requestAnimationFrame(draw);
    else renderStatic();
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && directions[saved.direction]) directionSelect.value = saved.direction;
    if (saved && speeds[saved.speed]) speedSelect.value = saved.speed;
    if (saved && ["dark", "light"].includes(saved.theme)) themeSelect.value = saved.theme;
  } catch { /* Use accessible defaults. */ }
  if (!directions[directionSelect.value]) directionSelect.value = "down-left";

  for (const select of [directionSelect, speedSelect, themeSelect]) {
    select.addEventListener("change", () => {
      applySettings();
      const details = select.closest(".star-settings");
      if (details) details.open = false;
    });
  }
  document.addEventListener("pointerdown", event => {
    const details = document.querySelector(".star-settings[open]");
    if (details && !details.contains(event.target)) details.open = false;
  });
  document.addEventListener("visibilitychange", () => {
    pageVisible = document.visibilityState === "visible";
    start();
  });
  window.addEventListener("resize", resize, { passive: true });
  reducedMotion.addEventListener("change", start);
  applySettings(); resize(); start();
})();