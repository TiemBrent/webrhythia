// General helpers ported/inspired by scripts/util/String.cs and scripts/util/Misc.cs

export function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Adds thousands separators, e.g. 1234567 -> "1,234,567"
export function padMagnitude(numberString) {
  return numberString.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

export function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
