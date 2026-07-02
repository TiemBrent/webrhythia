// Ported from scripts/map/objects/Note.cs and scripts/map/Map.cs (fields relevant to playback).

export class Note {
  constructor(index, millisecond, x, y) {
    this.index = index;
    this.millisecond = millisecond;
    this.x = x;
    this.y = y;
    this.hit = false;
    this.hittable = false;
  }
}

export class GameMap {
  constructor({
    id,
    title,
    artist,
    mappers = ["N/A"],
    difficulty = 0,
    difficultyName = null,
    notes = [],
    length = null,
    audioBuffer = null, // decoded AudioBuffer OR a function that returns one
    coverUrl = null,
    ephemeral = false,
  }) {
    this.id = id;
    this.title = title;
    this.artist = artist;
    this.mappers = mappers;
    this.prettyTitle = artist ? `${artist} - ${title}` : title;
    this.prettyMappers = mappers.join(", ");
    this.difficulty = difficulty;
    this.difficultyName = difficultyName;
    this.notes = notes;
    this.length = length ?? (notes.length ? notes[notes.length - 1].millisecond + 1500 : 0);
    this.audioBuffer = audioBuffer;
    this.coverUrl = coverUrl;
    this.ephemeral = ephemeral;
  }
}

// ---------------------------------------------------------------------------
// Procedural demo content. Real Rhythia maps require the user's own audio &
// map files (see phxmImport.js) since we can't ship copyrighted music. These
// generators produce fully original, royalty-free synthesized songs with a
// matching beatmap so the game is playable immediately after loading.
// ---------------------------------------------------------------------------

const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]; // major scale degrees
const ROOT = 220; // A3

function degreeToFreq(semitoneOffset) {
  return ROOT * Math.pow(2, semitoneOffset / 12);
}

function gridPos(i) {
  // Maps an integer to one of the 9 grid cells, -1/0/1 on each axis.
  const cell = ((i % 9) + 9) % 9;
  const x = (cell % 3) - 1;
  const y = Math.floor(cell / 3) - 1;
  return { x, y };
}

/**
 * Builds a short original synth track using OfflineAudioContext and a matching
 * note chart, both derived from the same seeded pattern so hits always line up
 * with the beat.
 */
export async function generateDemoMap({ bpm = 128, bars = 32, seed = 1, title = "Procedural Sketch", difficultyIndex = 2 } = {}) {
  const beatMs = 60000 / bpm;
  const stepMs = beatMs / 2; // 8th notes
  const totalSteps = bars * 8;
  const durationSec = (totalSteps * stepMs) / 1000 + 2;

  let rngState = seed;
  const rng = () => {
    rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
    return rngState / 0x7fffffff;
  };

  const ctx = new OfflineAudioContext(2, Math.ceil(durationSec * 44100), 44100);
  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  const notes = [];
  let noteIndex = 0;
  let patternCursor = 0;

  for (let step = 0; step < totalSteps; step++) {
    const t = (step * stepMs) / 1000;
    const barPos = step % 8;
    const isDownbeat = barPos === 0;
    const isBackbeat = barPos === 4;

    // Kick + bass on the pulse
    if (barPos % 2 === 0) {
      playKick(ctx, master, t);
    }
    if (isBackbeat) {
      playClap(ctx, master, t);
    }

    // Melody: not every step, driven by rng but deterministic per seed.
    const density = 0.55 + 0.25 * Math.sin(step / 16);
    if (rng() < density) {
      const degree = SCALE[Math.floor(rng() * SCALE.length)];
      const octave = rng() < 0.2 ? 12 : 0;
      const freq = degreeToFreq(degree + octave);
      playPluck(ctx, master, t, freq, isDownbeat ? 0.32 : 0.2);

      const ms = Math.round(step * stepMs) + 900; // lead-in offset, see below
      const { x, y } = gridPos(patternCursor + (rng() < 0.5 ? 0 : 3));
      notes.push(new Note(noteIndex++, ms, x, y));
      patternCursor++;
    }
  }

  const rendered = await ctx.startRendering();

  return new GameMap({
    id: `demo-${seed}`,
    title,
    artist: "Rhythia Web Port",
    mappers: ["Procedural Generator"],
    difficulty: difficultyIndex,
    notes,
    length: Math.round(durationSec * 1000) - 500,
    audioBuffer: rendered,
    ephemeral: true,
  });
}

function playKick(ctx, dest, t) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.09);
  gain.gain.setValueAtTime(0.9, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.25);
}

function playClap(ctx, dest, t) {
  const bufferSize = ctx.sampleRate * 0.2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 900;
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  src.connect(filter).connect(gain).connect(dest);
  src.start(t);
}

function playPluck(ctx, dest, t, freq, vel) {
  const osc = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc2.type = "sine";
  osc.frequency.value = freq;
  osc2.frequency.value = freq * 2;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vel, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.35);
  const g2 = ctx.createGain();
  g2.gain.value = 0.25;
  osc.connect(gain).connect(dest);
  osc2.connect(g2).connect(gain);
  osc.start(t);
  osc.stop(t + 0.4);
  osc2.start(t);
  osc2.stop(t + 0.4);
}
