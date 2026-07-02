// Ported from scripts/map/MapParser.cs (PHXM branch) and scripts/util/FileParser.cs.
// PHXM files are zip archives containing metadata.json + objects.phxmo (+ optional
// audio/cover/video). objects.phxmo layout:
//   uint32 typeCount
//   uint32 noteCount
//   for each note:
//     uint32 millisecond
//     bool   quantum (1 byte)
//     if quantum: float32 x, float32 y
//     else:       byte lane (grid column 0-2, stored value = lane+1), byte lane duplicated for y
//
// We also support the legacy plain-text format (ms,x,y per line) since the
// upstream client accepts ".txt" maps too.

import { Note, GameMap } from "./mapModel.js";

class ByteReader {
  constructor(buffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
    this.pointer = 0;
  }
  getUint32() {
    const v = this.view.getUint32(this.pointer, true);
    this.pointer += 4;
    return v;
  }
  getUint16() {
    const v = this.view.getUint16(this.pointer, true);
    this.pointer += 2;
    return v;
  }
  getFloat32() {
    const v = this.view.getFloat32(this.pointer, true);
    this.pointer += 4;
    return v;
  }
  getBool() {
    const v = this.bytes[this.pointer];
    this.pointer += 1;
    return v !== 0;
  }
  getUint8() {
    const v = this.bytes[this.pointer];
    this.pointer += 1;
    return v;
  }
}

function decodePHXMO(buffer) {
  const r = new ByteReader(buffer);
  r.getUint32(); // typeCount (unused here - only note objects are supported for playback)
  const noteCount = r.getUint32();
  const notes = [];
  for (let i = 0; i < noteCount; i++) {
    const ms = r.getUint32();
    const quantum = r.getBool();
    let x, y;
    if (quantum) {
      x = r.getFloat32();
      y = r.getFloat32();
    } else {
      x = r.getUint8() - 1;
      y = r.getUint8() - 1;
    }
    notes.push(new Note(i, ms, x, y));
  }
  return notes;
}

async function fetchJsZip() {
  if (window.JSZip) return window.JSZip;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.JSZip;
}

export async function importPHXM(file, audioCtx) {
  const JSZip = await fetchJsZip();
  const zip = await JSZip.loadAsync(file);

  const metaEntry = zip.file("metadata.json");
  const objectsEntry = zip.file("objects.phxmo");
  if (!metaEntry || !objectsEntry) {
    throw new Error("Not a valid .phxm file (missing metadata.json or objects.phxmo)");
  }

  const metadata = JSON.parse(await metaEntry.async("string"));
  const objectsBuffer = await objectsEntry.async("arraybuffer");
  const notes = decodePHXMO(objectsBuffer);

  let audioBuffer = null;
  if (metadata.HasAudio) {
    const ext = metadata.AudioExt || "mp3";
    const audioEntry = zip.file(`audio.${ext}`);
    if (audioEntry) {
      const raw = await audioEntry.async("arraybuffer");
      audioBuffer = await audioCtx.decodeAudioData(raw.slice(0));
    }
  }

  let coverUrl = null;
  const coverEntry = zip.file("cover.png");
  if (coverEntry) {
    const coverBlob = await coverEntry.async("blob");
    coverUrl = URL.createObjectURL(coverBlob);
  }

  return new GameMap({
    id: metadata.ID || file.name,
    title: metadata.Title || file.name,
    artist: metadata.Artist || "",
    mappers: metadata.Mappers && metadata.Mappers.length ? metadata.Mappers : ["N/A"],
    difficulty: metadata.Difficulty || 0,
    difficultyName: metadata.DifficultyName || null,
    notes,
    length: metadata.Length || null,
    audioBuffer,
    coverUrl,
  });
}

export async function importTxt(file, audioFile, audioCtx) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const notes = lines.map((line, i) => {
    const [ms, x, y] = line.split(",").map((v) => parseFloat(v.trim()));
    return new Note(i, Math.round(ms), x - 1, y - 1);
  });

  let audioBuffer = null;
  if (audioFile) {
    const raw = await audioFile.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(raw.slice(0));
  }

  return new GameMap({
    id: file.name,
    title: file.name.replace(/\.[^.]+$/, ""),
    artist: "",
    mappers: ["N/A"],
    notes,
    audioBuffer,
  });
}

export function isSupportedMapFile(name) {
  return /\.(phxm|txt)$/i.test(name);
}
