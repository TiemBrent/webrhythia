// Replaces scripts/SoundManager.cs + scripts/util/Audio.cs. The Web Audio API's
// AudioContext.currentTime is our authoritative clock, mirroring how the upstream
// client derives gameplay progress from the song's own playback position rather
// than wall-clock deltas (see startGameplayMediaAtExpected in LegacyRunner.cs).

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.songSource = null;
    this.songBuffer = null;
    this.songStartCtxTime = 0; // ctx.currentTime when progress=0
    this.songStartOffset = 0; // seconds into the buffer at that moment
    this.playing = false;
    this.sfxBuffers = {};
    this._ready = false;
  }

  async init() {
    if (this._ready) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this._ready = true;
  }

  async resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  applyVolumes({ MasterVolume, MusicVolume, HitsoundVolume }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(MasterVolume, now, 0.01);
    this.musicGain.gain.setTargetAtTime(MusicVolume, now, 0.01);
    this.sfxGain.gain.setTargetAtTime(HitsoundVolume, now, 0.01);
  }

  async loadSfx(name, url) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    this.sfxBuffers[name] = await this.ctx.decodeAudioData(arr);
  }

  playSfx(name, { rate = 1, gain = 1 } = {}) {
    const buf = this.sfxBuffers[name];
    if (!buf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  /** Loads a song from a decoded AudioBuffer (already decoded by the caller). */
  setSong(buffer) {
    this.songBuffer = buffer;
  }

  /**
   * Starts (or restarts) song playback so that `progressMs` (can be negative,
   * for lead-in) lines up with ctx time "now". `speed` maps to playbackRate.
   */
  playSongFrom(progressMs, speed = 1) {
    this.stopSong();
    const offsetSec = Math.max(0, progressMs / 1000);
    const now = this.ctx.currentTime;
    const leadIn = Math.max(0, -progressMs / 1000 / speed);

    // The audio-context clock is our authoritative timer even for maps that
    // have no bundled audio (e.g. imported .txt charts) - only actually start
    // a buffer source when one exists.
    if (this.songBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.songBuffer;
      src.playbackRate.value = speed;
      src.connect(this.musicGain);
      src.start(now + leadIn, offsetSec);
      this.songSource = src;
    }

    this.songStartCtxTime = now + leadIn;
    this.songStartOffset = offsetSec;
    this.songSpeed = speed;
    this.playing = true;
  }

  pauseSong() {
    if (this.songSource) {
      try { this.songSource.stop(); } catch (e) {}
      this.songSource = null;
    }
    this.playing = false;
  }

  stopSong() {
    this.pauseSong();
  }

  setSongVolumeDb(db) {
    if (!this.musicGain || !this.ctx) return;
    const linear = Math.pow(10, db / 20);
    this.musicGain.gain.setTargetAtTime(linear, this.ctx.currentTime, 0.05);
  }

  /** Current song progress in milliseconds, following the audio clock. */
  getProgressMs() {
    if (!this.playing || !this.ctx) return null;
    const elapsed = (this.ctx.currentTime - this.songStartCtxTime) * (this.songSpeed || 1);
    return (this.songStartOffset + elapsed) * 1000;
  }
}

export const audioEngine = new AudioEngine();
