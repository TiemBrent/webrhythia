// Ported from the Hit()/Miss() logic inside scripts/scenes/LegacyRunner.cs's
// nested Attempt struct. Kept as pure functions operating on a plain session
// object so they're easy to unit-test and reuse from the renderer/UI layer.

import { HIT_WINDOW, MODS_MULTIPLIER_INCREMENT } from "./constants.js";

export function createSession(map, { speed = 1, mods = {}, startFrom = 0 } = {}) {
  let modsMultiplier = 1;
  for (const [key, enabled] of Object.entries(mods)) {
    if (enabled && MODS_MULTIPLIER_INCREMENT[key] != null) {
      modsMultiplier += MODS_MULTIPLIER_INCREMENT[key];
    }
  }

  return {
    map,
    speed,
    mods,
    modsMultiplier,
    startFrom,
    progress: speed * -1000 - 0, // approach lead-in is added by the caller once approachTime is known
    passedNotes: 0,
    hits: 0,
    misses: 0,
    sum: 0,
    combo: 0,
    comboMultiplier: 1,
    comboMultiplierProgress: 0,
    comboMultiplierIncrement: Math.max(2, Math.floor(map.notes.length / 200)),
    score: 0,
    accuracy: 100,
    health: 100,
    healthStep: 15,
    alive: true,
    qualifies: true,
    stopped: false,
    deathTime: -1,
    cursorPosition: { x: 0, y: 0 },
    rawCursorPosition: { x: 0, y: 0 },
    lastHitColorIndex: 0,
  };
}

/** @returns {{scoreGain:number, lateness:number}} */
export function applyHit(session, note, nowProgress) {
  session.hits++;
  session.sum++;
  session.accuracy = Math.floor((session.hits / session.sum) * 10000) / 100;
  session.combo++;
  session.comboMultiplierProgress++;

  const lateness = (nowProgress - note.millisecond) / session.speed;
  const factor = 1 - Math.max(0, lateness - 25) / 150;

  if (session.comboMultiplierProgress === session.comboMultiplierIncrement) {
    if (session.comboMultiplier < 8) {
      session.comboMultiplierProgress = session.comboMultiplier === 7 ? session.comboMultiplierIncrement : 0;
      session.comboMultiplier++;
    }
  }

  const speedFactor = (session.speed - 1) / 2.5 + 1;
  const hitScore = Math.round(100 * session.comboMultiplier * session.modsMultiplier * factor * speedFactor);

  session.score += hitScore;
  session.healthStep = Math.max(session.healthStep / 1.45, 15);
  session.health = Math.min(100, session.health + session.healthStep / 1.75);
  note.hit = true;

  return { scoreGain: hitScore, lateness };
}

export function applyMiss(session, note, mods) {
  session.misses++;
  session.sum++;
  session.accuracy = Math.floor((session.hits / session.sum) * 10000) / 100;
  session.combo = 0;
  session.comboMultiplierProgress = 0;
  session.comboMultiplier = Math.max(1, session.comboMultiplier - 1);
  session.health = Math.max(0, session.health - session.healthStep);
  session.healthStep = Math.min(session.healthStep * 1.2, 100);

  if (session.health <= 0) {
    if (session.alive) {
      session.alive = false;
      session.qualifies = false;
      session.deathTime = session.progress;
    }
    if (!mods.NoFail) {
      session.stopped = true;
    }
  }
}

export function isWithinHitWindow(note, progress, speed) {
  return Math.abs(progress - note.millisecond) <= HIT_WINDOW * speed;
}

export function isPastHitWindow(note, progress, speed) {
  return note.millisecond + HIT_WINDOW * speed < progress;
}
