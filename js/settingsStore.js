// Ported from scripts/database/settings/SettingsProfile.cs
// Each entry: id -> { value, title, description, section, slider?: {min,max,step}, type }

const STORAGE_KEY = "rhythia-web:settings:v1";

export const SETTINGS_SCHEMA = [
  // Gameplay
  { id: "Sensitivity", title: "Sensitivity", description: "Adjusts cursor sensitivity", section: "Gameplay", type: "number", value: 0.5, slider: { min: 0.01, max: 2.5, step: 0.01 } },
  { id: "AbsoluteInput", title: "Absolute Input", description: "Toggles absolute inputs (uses raw pointer position instead of relative movement)", section: "Gameplay", type: "bool", value: false },
  { id: "CursorDrift", title: "Cursor Drift", description: "Toggles cursor drift", section: "Gameplay", type: "bool", value: true },
  { id: "ApproachRate", title: "Approach Rate", description: "Approach rate of hit objects", section: "Gameplay", type: "number", value: 32, slider: { min: 0.5, max: 100, step: 0.5 } },
  { id: "ApproachDistance", title: "Approach Distance", description: "Approach distance of hit objects", section: "Gameplay", type: "number", value: 20, slider: { min: 0.5, max: 100, step: 0.5 } },
  { id: "FadeIn", title: "Fade In", description: "Distance for the hit objects to become fully opaque", section: "Gameplay", type: "number", value: 15, slider: { min: 0, max: 100, step: 1 } },
  { id: "FadeOut", title: "Fade Out", description: "Toggles fade out for the hit objects", section: "Gameplay", type: "number", value: 100, slider: { min: 0, max: 100, step: 1 } },
  { id: "Pushback", title: "Pushback", description: "Toggles hit object pushback", section: "Gameplay", type: "bool", value: true },
  { id: "CameraParallax", title: "Camera Parallax", description: "Adjusts the camera parallax", section: "Gameplay", type: "number", value: 0.1, slider: { min: 0, max: 1, step: 0.05 } },
  { id: "SpaceToPause", title: "Space to Pause", description: "Toggles space to pause during gameplay", section: "Gameplay", type: "bool", value: false },
  { id: "FoV", title: "Field of View", description: "Adjusts the field of view", section: "Gameplay", type: "number", value: 70, slider: { min: 40, max: 110, step: 1 } },
  { id: "CameraMode", title: "Camera Mode", description: "Lock keeps the camera fixed; Spin allows free look", section: "Gameplay", type: "choice", value: "Lock", choices: ["Lock", "Spin"] },

  // Visual
  { id: "NoteSize", title: "Note Size", description: "Adjusts the size of notes", section: "Visual", type: "number", value: 0.875, slider: { min: 0.3, max: 1.5, step: 0.025 } },
  { id: "CursorScale", title: "Cursor Scale", description: "Adjusts the size of the cursor", section: "Visual", type: "number", value: 1, slider: { min: 0.3, max: 2, step: 0.05 } },
  { id: "CursorRotation", title: "Cursor Rotation", description: "Adjusts the cursor's rotation speed", section: "Visual", type: "number", value: 0, slider: { min: 0, max: 360, step: 5 } },
  { id: "CursorTrail", title: "Cursor Trail", description: "Toggles the cursor trail", section: "Visual", type: "bool", value: true },
  { id: "TrailTime", title: "Trail Time", description: "Adjusts how long the cursor trail lingers (seconds)", section: "Visual", type: "number", value: 0.3, slider: { min: 0.05, max: 1, step: 0.05 } },
  { id: "HitPopups", title: "Hit Popups", description: "Shows score popups on hit", section: "Visual", type: "bool", value: true },
  { id: "MissPopups", title: "Miss Popups", description: "Shows miss icons on miss", section: "Visual", type: "bool", value: true },
  { id: "GameSpace", title: "Game Background", description: "Background space shown during gameplay", section: "Visual", type: "choice", value: "Galaxy", choices: ["Void", "Galaxy", "Grid", "Waves", "Tunnel", "Squircles"] },
  { id: "MenuSpace", title: "Menu Background", description: "Background space shown in menus", section: "Visual", type: "choice", value: "Galaxy", choices: ["Void", "Galaxy", "Grid", "Waves", "Tunnel", "Squircles"] },

  // Audio
  { id: "MasterVolume", title: "Master Volume", description: "Overall volume", section: "Audio", type: "number", value: 0.8, slider: { min: 0, max: 1, step: 0.01 } },
  { id: "MusicVolume", title: "Music Volume", description: "Song playback volume", section: "Audio", type: "number", value: 1, slider: { min: 0, max: 1, step: 0.01 } },
  { id: "HitsoundVolume", title: "Hitsound Volume", description: "Hit/miss sound volume", section: "Audio", type: "number", value: 1, slider: { min: 0, max: 1, step: 0.01 } },
  { id: "AlwaysPlayHitSound", title: "Always Play Hit Sound", description: "Plays hit sound for every note regardless of accuracy", section: "Audio", type: "bool", value: false },

  // Gameplay defaults for a run
  { id: "RecordReplays", title: "Record Replays", description: "Saves a replay of each attempt", section: "Gameplay", type: "bool", value: true },
];

function defaultsObject() {
  const obj = {};
  for (const s of SETTINGS_SCHEMA) obj[s.id] = s.value;
  return obj;
}

class SettingsStore extends EventTarget {
  constructor() {
    super();
    this.values = defaultsObject();
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        Object.assign(this.values, saved);
      }
    } catch (e) {
      console.warn("Failed to load settings", e);
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch (e) {
      console.warn("Failed to save settings", e);
    }
  }

  get(id) {
    return this.values[id];
  }

  set(id, value) {
    this.values[id] = value;
    this.save();
    this.dispatchEvent(new CustomEvent("change", { detail: { id, value } }));
  }

  reset(id) {
    const def = SETTINGS_SCHEMA.find((s) => s.id === id);
    if (def) this.set(id, def.value);
  }

  // Derived: ApproachTime (seconds) from ApproachRate & ApproachDistance.
  // The upstream client marks ApproachTime as a hidden, derived value updated
  // whenever ApproachRate/ApproachDistance change. We reconstruct it the same way:
  // higher rate = faster/shorter warning; more distance = longer warning.
  get approachTime() {
    const rate = this.values.ApproachRate;
    const dist = this.values.ApproachDistance;
    return dist / rate;
  }
}

export const settings = new SettingsStore();
export function sectionsOf(section) {
  return SETTINGS_SCHEMA.filter((s) => s.section === section);
}
