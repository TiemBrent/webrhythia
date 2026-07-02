import { GameRenderer } from "./renderer3d.js";
import { screens, toast } from "./screenManager.js";
import { SongSelectScreen } from "./songSelect.js";
import { SettingsScreen } from "./settingsMenu.js";
import { Attempt } from "./attempt.js";
import { audioEngine } from "./audioEngine.js";
import { settings } from "./settingsStore.js";
import { generateDemoMap } from "./mapModel.js";
import { importPHXM, importTxt, isSupportedMapFile } from "./phxmImport.js";

const canvas = document.getElementById("scene-canvas");
const renderer = new GameRenderer(canvas);
(function renderLoop() {
  requestAnimationFrame(renderLoop);
  renderer.render();
})();

let currentAttempt = null;
let lastPlayed = null; // { map, opts } - kept alive after the attempt ends so Retry works from Results too

const songSelect = new SongSelectScreen({ onPlay: (map, opts) => beginAttempt(map, opts) });
const settingsScreen = new SettingsScreen();

// ----------------------------------------------------------------------------
// Boot: pre-load a small library of original, procedurally generated demo maps
// (no copyrighted music is bundled — see js/mapModel.js) and warm up SFX.
// ----------------------------------------------------------------------------
async function boot() {
  await audioEngine.init();
  loadSfx();

  const demoDefs = [
    { seed: 1, bpm: 120, bars: 24, title: "Warmup Sketch", difficultyIndex: 1 },
    { seed: 2, bpm: 140, bars: 32, title: "Neon Corridor", difficultyIndex: 2 },
    { seed: 3, bpm: 160, bars: 40, title: "Overdrive", difficultyIndex: 3 },
    { seed: 4, bpm: 175, bars: 48, title: "Singularity", difficultyIndex: 4 },
  ];
  toast("Generating demo tracks...");
  const maps = await Promise.all(demoDefs.map((d) => generateDemoMap(d)));
  songSelect.setMaps(maps);
  settingsScreen.render();
}

function loadSfx() {
  audioEngine.loadSfx("hit", "assets/audio/hit.mp3").catch(() => {});
  audioEngine.loadSfx("miss", "assets/audio/miss.mp3").catch(() => {});
  audioEngine.loadSfx("fail", "assets/audio/fail.mp3").catch(() => {});
  audioEngine.loadSfx("menu", "assets/audio/menu.mp3").catch(() => {});
}

// ---------------------------------- Navigation ----------------------------------
document.body.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "play") {
    screens.show("song-select");
  } else if (action === "settings") {
    settingsScreen.render();
    screens.show("settings");
  } else if (action === "close-settings" || action === "back-to-menu") {
    screens.show("main-menu");
  } else if (action === "import") {
    document.getElementById("import-input").click();
  } else if (action === "resume") {
    document.getElementById("pause-overlay").classList.add("hidden");
    currentAttempt?.resume();
  } else if (action === "retry") {
    retryCurrent();
  } else if (action === "quit-to-menu") {
    quitToMenu();
  }
});

document.getElementById("import-input").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []).filter((f) => isSupportedMapFile(f.name));
  for (const file of files) {
    try {
      await audioEngine.init();
      const map = file.name.toLowerCase().endsWith(".phxm")
        ? await importPHXM(file, audioEngine.ctx)
        : await importTxt(file, null, audioEngine.ctx);
      songSelect.addMap(map);
      toast(`Imported "${map.title}"`);
      screens.show("song-select");
    } catch (err) {
      console.error(err);
      toast(`Couldn't import ${file.name}: ${err.message}`);
    }
  }
  e.target.value = "";
});

// ---------------------------------- Gameplay lifecycle ----------------------------------
async function beginAttempt(map, opts) {
  lastPlayed = { map, opts };
  screens.show("gameplay");
  document.getElementById("pause-overlay").classList.add("hidden");
  document.getElementById("fail-overlay").classList.add("hidden");
  const countdown = document.getElementById("countdown-overlay");
  countdown.classList.remove("hidden");
  document.getElementById("countdown-text").textContent = "Click to start";

  currentAttempt = new Attempt(map, canvas, renderer, opts);
  wireAttemptEvents(currentAttempt, map);

  const startHandler = async () => {
    countdown.classList.add("hidden");
    canvas.removeEventListener("click", startHandler);
    await currentAttempt.start();
  };
  canvas.addEventListener("click", startHandler);
}

function wireAttemptEvents(attempt, map) {
  attempt.addEventListener("hud", (e) => {
    const d = e.detail;
    document.getElementById("hud-score").textContent = Math.round(d.score).toLocaleString();
    document.getElementById("hud-accuracy").textContent = `${d.accuracy.toFixed(2)}%`;
    document.getElementById("hud-combo").textContent = d.combo;
    document.getElementById("hud-combo-mult").textContent = `x${d.comboMultiplier}`;
    document.getElementById("hud-health").style.width = `${d.health}%`;
    document.getElementById("hud-progress").style.width = `${Math.min(100, d.progress * 100)}%`;
    document.getElementById("hud-misses").textContent = `${d.misses} misses`;
  });

  attempt.addEventListener("pause", () => {
    document.getElementById("pause-overlay").classList.remove("hidden");
  });

  attempt.addEventListener("fail", (e) => {
    document.getElementById("fail-overlay").classList.remove("hidden");
  });

  attempt.addEventListener("finish", (e) => {
    showResults(map, e.detail.session);
  });
}

function retryCurrent() {
  if (!lastPlayed) return;
  currentAttempt?.stop();
  beginAttempt(lastPlayed.map, lastPlayed.opts);
}

function quitToMenu() {
  currentAttempt?.stop();
  currentAttempt = null;
  screens.show("song-select");
}

function showResults(map, session) {
  currentAttempt = null;
  document.getElementById("results-title").textContent = map.title;
  document.getElementById("results-artist").textContent = map.prettyMappers;
  document.getElementById("results-score").textContent = Math.round(session.score).toLocaleString();
  document.getElementById("results-accuracy").textContent = `${session.accuracy.toFixed(2)}%`;
  document.getElementById("results-combo").textContent = `${session.combo}x`;
  document.getElementById("results-misses").textContent = session.misses;
  document.getElementById("results-grade").textContent = gradeFor(session.accuracy, session.misses);
  screens.show("results");
}

function gradeFor(accuracy, misses) {
  if (misses === 0 && accuracy >= 99.9) return "SS";
  if (accuracy >= 95) return "S";
  if (accuracy >= 90) return "A";
  if (accuracy >= 80) return "B";
  if (accuracy >= 70) return "C";
  return "D";
}

settings.addEventListener("change", ({ detail }) => {
  if (["MasterVolume", "MusicVolume", "HitsoundVolume"].includes(detail.id)) {
    audioEngine.applyVolumes(settings.values);
  }
});

boot();
