(() => {
  const field = document.querySelector(".starfield");
  const directionSelect = document.getElementById("starDirection");
  const speedSelect = document.getElementById("starSpeed");
  if (!field || !directionSelect || !speedSelect) return;

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
  const speeds = {
    slow: [30, 48],
    normal: [16, 27],
    fast: [8, 14]
  };
  const storageKey = "superstar-starfield-settings";

  function applySettings() {
    const [xDirection, yDirection] = directions[directionSelect.value] || directions["down-right"];
    const [fastDuration, slowDuration] = speeds[speedSelect.value] || speeds.normal;

    field.style.setProperty("--drift-x-fast", `${xDirection * 180}px`);
    field.style.setProperty("--drift-y-fast", `${yDirection * 180}px`);
    field.style.setProperty("--drift-x-slow", `${xDirection * 240}px`);
    field.style.setProperty("--drift-y-slow", `${yDirection * 240}px`);
    field.style.setProperty("--fast-duration", `${fastDuration}s`);
    field.style.setProperty("--slow-duration", `${slowDuration}s`);

    try {
      localStorage.setItem(storageKey, JSON.stringify({
        direction: directionSelect.value,
        speed: speedSelect.value
      }));
    } catch {
      // The selected settings still apply for this page if storage is unavailable.
    }
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && directions[saved.direction]) directionSelect.value = saved.direction;
    if (saved && speeds[saved.speed]) speedSelect.value = saved.speed;
  } catch {
    // Keep the default diagonal direction and normal speed if saved settings are unavailable.
  }

  directionSelect.addEventListener("change", applySettings);
  speedSelect.addEventListener("change", applySettings);
  applySettings();
})();
