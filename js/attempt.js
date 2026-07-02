// Ties together map/audio/renderer/camera/judgments into a running attempt.
// Mirrors the per-frame flow in scripts/scenes/LegacyRunner.cs's _Process, minus
// VR/Discord/multiplayer (explicitly out of scope for this port).

import { HIT_WINDOW } from "./constants.js";
import { createSession, applyHit, applyMiss, isPastHitWindow } from "./judgments.js";
import { cameraLockStep, cameraSpinStep } from "./camera.js";
import { audioEngine } from "./audioEngine.js";
import { settings } from "./settingsStore.js";

export class Attempt extends EventTarget {
  constructor(map, canvas, renderer, { speed = 1, mods = {} } = {}) {
    super();
    this.map = map;
    this.canvas = canvas;
    this.renderer = renderer;
    this.session = createSession(map, { speed, mods });
    this.notesSorted = [...map.notes].sort((a, b) => a.millisecond - b.millisecond);
    this.nextSpawnIndex = 0;
    this.activeNotes = [];
    this.trail = [];
    this.spinRotation = { x: 0, y: 0, z: 0 };
    this.mouseDelta = { x: 0, y: 0 };
    this.paused = true;
    this.finished = false;
    this.raf = null;
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
  }

  async start() {
    await audioEngine.init();
    await audioEngine.resume();
    audioEngine.applyVolumes(settings.values);
    audioEngine.setSong(this.map.audioBuffer);

    const approachTimeSec = settings.approachTime;
    const leadInMs = this.session.speed * -1000 - approachTimeSec * 1000;
    this.session.progress = leadInMs;
    this.renderer.setSpace(settings.get("GameSpace"));

    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
    await this._requestPointerLock();

    audioEngine.playSongFrom(leadInMs, this.session.speed);
    this.paused = false;
    this._loop();
  }

  async _requestPointerLock() {
    try {
      await this.canvas.requestPointerLock();
    } catch (e) {
      // Pointer lock can fail if not triggered directly from a user gesture;
      // the caller is expected to invoke start() from a click handler.
    }
  }

  _onPointerLockChange() {
    const locked = document.pointerLockElement === this.canvas;
    if (locked) {
      document.addEventListener("mousemove", this._onMouseMove);
    } else {
      document.removeEventListener("mousemove", this._onMouseMove);
      if (!this.paused && !this.finished) this.pause();
    }
  }

  _onMouseMove(e) {
    this.mouseDelta.x += e.movementX;
    this.mouseDelta.y += e.movementY;
  }

  _onKeyDown(e) {
    // Escape is intentionally not handled here: browsers already exit pointer
    // lock on Escape, which triggers _onPointerLockChange -> pause(). Handling
    // it a second time here would race with that and immediately re-lock.
    if (e.code === "Space" && settings.get("SpaceToPause")) {
      e.preventDefault();
      if (this.paused) this.resume();
      else this.pause();
    }
  }

  pause() {
    if (this.paused || this.finished) return;
    this.paused = true;
    audioEngine.pauseSong();
    cancelAnimationFrame(this.raf);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.dispatchEvent(new CustomEvent("pause"));
  }

  async resume() {
    if (!this.paused || this.finished) return;
    await this._requestPointerLock();
    this.mouseDelta = { x: 0, y: 0 };
    audioEngine.playSongFrom(this.session.progress, this.session.speed);
    this.paused = false;
    this.dispatchEvent(new CustomEvent("resume"));
    this._loop();
  }

  retry() {
    this.stop();
    return new Attempt(this.map, this.canvas, this.renderer, { speed: this.session.speed, mods: this.session.mods });
  }

  stop() {
    this.finished = true;
    cancelAnimationFrame(this.raf);
    audioEngine.stopSong();
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  _loop() {
    this.raf = requestAnimationFrame(() => this._loop());
    if (this.paused || this.finished) return;
    this._tick();
  }

  _tick() {
    const s = this.session;
    const sv = settings.values;
    const audioProgress = audioEngine.getProgressMs();
    if (audioProgress != null) s.progress = audioProgress;

    // --- camera & cursor -------------------------------------------------
    let step;
    if (sv.CameraMode === "Spin") {
      step = cameraSpinStep(s, sv, this.mouseDelta, this.spinRotation);
      this.spinRotation = step.rotation;
    } else {
      step = cameraLockStep(s, sv, this.mouseDelta);
    }
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    this.renderer.updateCamera(step.position, step.rotation, sv.FoV);

    const cursorRotation = sv.CursorRotation ? (s.progress / 1000) * (sv.CursorRotation * Math.PI / 180) : 0;
    this.renderer.updateCursor(s.cursorPosition, cursorRotation, sv.CursorScale);

    if (sv.CursorTrail) {
      this.trail.push({ x: s.cursorPosition.x, y: s.cursorPosition.y, born: s.progress });
      const maxAge = sv.TrailTime * 1000;
      this.trail = this.trail.filter((p) => s.progress - p.born < maxAge);
      const pts = this.trail.map((p) => ({ x: p.x, y: p.y, size: 0.12 * (1 - (s.progress - p.born) / maxAge) }));
      this.renderer.updateTrail(pts);
    } else if (this.trail.length) {
      this.trail = [];
      this.renderer.updateTrail([]);
    }

    // --- note spawning -----------------------------------------------------
    const approachTimeSec = settings.approachTime;
    const spawnWindowMs = approachTimeSec * 1000 * s.speed;
    while (
      this.nextSpawnIndex < this.notesSorted.length &&
      this.notesSorted[this.nextSpawnIndex].millisecond - spawnWindowMs <= s.progress
    ) {
      this.activeNotes.push(this.notesSorted[this.nextSpawnIndex]);
      this.nextSpawnIndex++;
    }

    // --- hit / miss resolution ---------------------------------------------
    for (let i = this.activeNotes.length - 1; i >= 0; i--) {
      const note = this.activeNotes[i];
      const withinBox =
        s.cursorPosition.x + 0.07 >= note.x - 0.5 &&
        s.cursorPosition.x - 0.07 <= note.x + 0.5 &&
        s.cursorPosition.y + 0.07 >= note.y - 0.5 &&
        s.cursorPosition.y - 0.07 <= note.y + 0.5;
      const withinTime = Math.abs(s.progress - note.millisecond) <= HIT_WINDOW * s.speed;

      if (withinBox && withinTime) {
        const { scoreGain } = applyHit(s, note, s.progress);
        this._playHitFeedback(note, scoreGain);
        this.activeNotes.splice(i, 1);
      } else if (isPastHitWindow(note, s.progress, s.speed)) {
        applyMiss(s, note, s.mods);
        this._playMissFeedback(note);
        this.activeNotes.splice(i, 1);
        if (s.stopped) {
          this._fail();
          return;
        }
      }
    }

    this.renderer.updateNotes(this.activeNotes, s.progress, sv, approachTimeSec, !!s.mods.Ghost);

    this.dispatchEvent(
      new CustomEvent("hud", {
        detail: {
          score: s.score,
          combo: s.combo,
          comboMultiplier: s.comboMultiplier,
          accuracy: s.accuracy,
          health: s.health,
          misses: s.misses,
          progress: Math.max(0, s.progress) / this.map.length,
        },
      })
    );

    if (s.progress >= this.map.length) {
      this._finish();
    }
  }

  _playHitFeedback(note, scoreGain) {
    if (settings.get("HitPopups")) this.renderer.spawnHitPopup(note.x, note.y, `+${scoreGain}`);
    audioEngine.playSfx("hit");
  }

  _playMissFeedback(note) {
    if (settings.get("MissPopups")) this.renderer.spawnMissIcon(note.x, note.y);
    if (settings.get("AlwaysPlayHitSound")) audioEngine.playSfx("hit");
    else audioEngine.playSfx("miss");
  }

  _fail() {
    this.finished = true;
    cancelAnimationFrame(this.raf);
    audioEngine.stopSong();
    audioEngine.playSfx("fail");
    this.dispatchEvent(new CustomEvent("fail", { detail: { session: this.session } }));
  }

  _finish() {
    this.finished = true;
    cancelAnimationFrame(this.raf);
    audioEngine.stopSong();
    this.dispatchEvent(new CustomEvent("finish", { detail: { session: this.session } }));
  }
}
