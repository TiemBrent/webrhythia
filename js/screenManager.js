const SCREENS = ["main-menu", "song-select", "settings", "gameplay", "results"];

class ScreenManager {
  constructor() {
    this.current = null;
  }

  show(name) {
    for (const s of SCREENS) {
      const el = document.getElementById(`screen-${s}`);
      if (!el) continue;
      el.classList.toggle("hidden", s !== name);
    }
    this.current = name;
  }
}

export const screens = new ScreenManager();

export function toast(message) {
  const layer = document.getElementById("toast-layer");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  layer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 2600);
}
