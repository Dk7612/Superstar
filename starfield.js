(() => {
  const canvas = document.querySelector(".starfield");
  const directionSelect = document.getElementById("starDirection");
  const speedSelect = document.getElementById("starSpeed");
  const themeSelect = document.getElementById("themeMode");
  if (!canvas || !directionSelect || !speedSelect || !themeSelect) return;

  const context = canvas.getContext("2d");
  const directions = {
    "down-right": [1, 1],
    "down-left": [-1, 1],
    "up-right": [1, -1],
    "up-left": [-1, -1],
    down: [0, 1],
    up: [0, -1],
    right: [1, 0],
    left: [-1, 0]
  };
  const speeds = { slow: 0.45, normal: 1, fast: 1.8 };
  const storageKey = "superstar-starfield-settings-v2";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let lastFrameTime = 0;
  let stars = [];

  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.lineCap = "round";
    stars = Array.from({ length: Math.min(150, Math.ceil(width * height / 8500)) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 0.7 + Math.random() * 1.5,
      speed: 10 + Math.random() * 24,
      trail: 10 + Math.random() * 24,
      opacity: 0.35 + Math.random() * 0.6
    }));
    draw();
  }

  function applySettings() {
    document.documentElement.dataset.theme = themeSelect.value;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        direction: directionSelect.value,
        speed: speedSelect.value,
        theme: themeSelect.value
      }));
    } catch {
      // The selected settings still apply for this page if storage is unavailable.
    }
    lastFrameTime = 0;
  }

  let animationActive = false;

  function draw(timestamp = 0) {
    const [directionX, directionY] = directions[directionSelect.value] || directions.left;
    const speedMultiplier = speeds[speedSelect.value] || speeds.normal;
    const delta = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 0;
    lastFrameTime = timestamp;

    context.clearRect(0, 0, width, height);
    for (const star of stars) {
      star.x += directionX * star.speed * speedMultiplier * delta;
      star.y += directionY * star.speed * speedMultiplier * delta;

      if (directionX < 0 && star.x < -star.trail) star.x = width + star.trail;
      else if (directionX > 0 && star.x > width + star.trail) star.x = -star.trail;
      if (directionY < 0 && star.y < -star.trail) star.y = height + star.trail;
      else if (directionY > 0 && star.y > height + star.trail) star.y = -star.trail;

      const tailX = star.x - directionX * star.trail;
      const tailY = star.y - directionY * star.trail;
      context.strokeStyle = `rgba(235, 242, 255, ${star.opacity * 0.72})`;
      context.lineWidth = star.size;
      context.beginPath();
      context.moveTo(tailX, tailY);
      context.lineTo(star.x, star.y);
      context.stroke();
      context.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      context.beginPath();
      context.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      context.fill();
    }

  }

  function animate(timestamp) {
    if (reducedMotion.matches || document.visibilityState !== "visible") {
      animationActive = false;
      return;
    }
    draw(timestamp);
    window.requestAnimationFrame(animate);
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && directions[saved.direction]) directionSelect.value = saved.direction;
    if (saved && speeds[saved.speed]) speedSelect.value = saved.speed;
    if (saved && ["dark", "light"].includes(saved.theme)) themeSelect.value = saved.theme;
  } catch {
    // Keep the default down-left motion, fast speed, and dark theme.
  }
  if (!directions[directionSelect.value]) directionSelect.value = "down-left";

  directionSelect.addEventListener("change", applySettings);
  speedSelect.addEventListener("change", applySettings);
  themeSelect.addEventListener("change", applySettings);
  for (const select of [directionSelect, speedSelect, themeSelect]) {
    select.addEventListener("change", () => {
      select.closest(".star-settings").open = false;
    });
  }
  document.addEventListener("pointerdown", event => {
    const settings = document.querySelector(".star-settings[open]");
    if (settings && !settings.contains(event.target)) settings.open = false;
  });
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !reducedMotion.matches && !animationActive) {
      animationActive = true;
      lastFrameTime = 0;
      window.requestAnimationFrame(animate);
    }
  });
  reducedMotion.addEventListener("change", () => {
    lastFrameTime = 0;
    draw();
    if (!reducedMotion.matches && document.visibilityState === "visible" && !animationActive) {
      animationActive = true;
      window.requestAnimationFrame(animate);
    }
  });
  applySettings();
  resize();
  if (!reducedMotion.matches && document.visibilityState === "visible") {
    animationActive = true;
    window.requestAnimationFrame(animate);
  }
})();
