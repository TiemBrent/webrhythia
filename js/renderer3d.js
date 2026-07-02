// Replaces the 3D side of scripts/scenes/LegacyRunner.cs (grid/cursor/notes/trail
// nodes) using Three.js InstancedMesh in place of Godot's MultiMeshInstance3D.
// Background "Spaces" approximate scripts/spaces/*.cs (Void/Galaxy/Grid/Waves/
// Tunnel/Squircles) — original shader code wasn't portable 1:1, so each space is
// re-implemented from scratch to *look and feel* like its namesake.

import * as THREE from "three";
import { GRID_SIZE } from "./constants.js";
import { ghostOpacityFalloff } from "./mods.js";

const MAX_NOTE_INSTANCES = 512;
const MAX_TRAIL_INSTANCES = 256;
const NOTE_COLORS = ["#ff2d55", "#ff8a00", "#ffd400", "#5cff5c", "#31c9ff", "#7a5cff", "#ff5cf0"];

function loadTexture(loader, path) {
  const tex = loader.load(path);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0c);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
    this.camera.position.set(0, 0, 3.75);

    this.clock = new THREE.Clock();
    this.loader = new THREE.TextureLoader();

    this._buildLighting();
    this._buildGrid();
    this._buildCursor();
    this._buildNotes();
    this._buildTrail();
    this._buildPopupLayer();

    this.space = null;
    this.setSpace("Void");

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  _buildLighting() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  }

  _buildGrid() {
    const tex = loadTexture(this.loader, "assets/textures/grid_tile.png");
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(GRID_SIZE, GRID_SIZE);
    tex.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9 });
    const geo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
    this.grid = new THREE.Mesh(geo, mat);
    this.scene.add(this.grid);

    // Soft border so the play area reads clearly against any background space.
    const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE));
    const borderMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
    this.gridBorder = new THREE.LineSegments(borderGeo, borderMat);
    this.gridBorder.position.z = 0.001;
    this.scene.add(this.gridBorder);
  }

  _buildCursor() {
    const tex = loadTexture(this.loader, "assets/textures/squircle_blank.png");
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(1, 1);
    this.cursor = new THREE.Mesh(geo, mat);
    this.cursor.renderOrder = 10;
    this.scene.add(this.cursor);

    const glowTex = loadTexture(this.loader, "assets/textures/squircle_bloom.png");
    const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
    this.cursorGlow = new THREE.Mesh(geo.clone(), glowMat);
    this.cursorGlow.scale.setScalar(1.9);
    this.cursorGlow.renderOrder = 9;
    this.scene.add(this.cursorGlow);
  }

  _buildNotes() {
    const tex = loadTexture(this.loader, "assets/textures/squircle_blank.png");
    const geo = new THREE.PlaneGeometry(1, 1);
    // Per-instance alpha isn't natively supported by MeshBasicMaterial, so we add
    // a custom instanced attribute and fold it into the fragment shader below.
    this._noteAlphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_NOTE_INSTANCES).fill(1), 1);
    geo.setAttribute("instanceAlpha", this._noteAlphaAttr);

    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, vertexColors: true });
    this._applyPerInstanceAlpha(mat);

    this.noteMesh = new THREE.InstancedMesh(geo, mat, MAX_NOTE_INSTANCES);
    this.noteMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_NOTE_INSTANCES * 3).fill(1), 3);
    this.noteMesh.count = 0;
    this.noteMesh.renderOrder = 5;
    this.scene.add(this.noteMesh);
  }

  _applyPerInstanceAlpha(mat) {
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvInstanceAlpha = instanceAlpha;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vInstanceAlpha;")
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse, opacity * vInstanceAlpha );");
    };
    mat.needsUpdate = true;
  }

  _buildTrail() {
    const tex = loadTexture(this.loader, "assets/textures/squircle_blank.png");
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.trailMesh = new THREE.InstancedMesh(geo, mat, MAX_TRAIL_INSTANCES);
    this.trailMesh.count = 0;
    this.trailMesh.renderOrder = 4;
    this.scene.add(this.trailMesh);
  }

  _buildPopupLayer() {
    // Score/miss popups are simpler & crisper as DOM elements positioned via
    // camera projection than as billboarded 3D sprites with text textures.
    this.popupLayer = document.getElementById("popup-layer");
  }

  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
    };
  }

  setNoteMesh(instancesGeometry) {
    // Hook for future skin support (custom note shapes); no-op for the default skin.
  }

  updateCamera(position, rotation, fov) {
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.rotation.set(rotation.x, rotation.y, rotation.z);
    if (fov && this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  updateCursor(pos, rotationRad, scale) {
    const size = 0.2625 * scale;
    this.cursor.position.set(pos.x, pos.y, 0);
    this.cursor.scale.setScalar(size);
    this.cursor.rotation.z = rotationRad;
    this.cursorGlow.position.copy(this.cursor.position);
    this.cursorGlow.rotation.z = rotationRad;
    this.cursorGlow.scale.setScalar(size * 1.9);
  }

  /**
   * notes: array of {x,y,millisecond,hit} currently in the approach window.
   * progress: current song position (ms). settingsValues: full settings object.
   */
  updateNotes(notes, progress, settingsValues, approachTimeSec, ghostMode = false) {
    const approachDistance = settingsValues.ApproachDistance / 4; // scaled to world units (see README notes on tuning)
    const noteSize = settingsValues.NoteSize;
    const fadeIn = settingsValues.FadeIn / 100;
    const fadeOut = settingsValues.FadeOut / 100;
    const pushback = settingsValues.Pushback;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(noteSize, noteSize, noteSize);
    let count = 0;

    for (let i = 0; i < notes.length && count < MAX_NOTE_INSTANCES; i++) {
      const note = notes[i];
      if (note.hit) continue;

      const msToHit = note.millisecond - progress;
      const fraction = Math.max(0, Math.min(1, msToHit / (approachTimeSec * 1000)));
      let z = -approachDistance * fraction;
      let opacity = fadeIn > 0 ? Math.min(1, (1 - fraction) / fadeIn) : 1;
      if (ghostMode) opacity *= 1 - ghostOpacityFalloff(1 - fraction);

      if (msToHit < 0) {
        // Past the hit line: either pushback through the camera briefly, or vanish.
        if (!pushback) continue;
        const overshoot = Math.min(1, -msToHit / (approachTimeSec * 1000 * 0.2));
        z = overshoot * 0.6;
        opacity = fadeOut > 0 ? Math.max(0, 1 - overshoot / fadeOut) : 1 - overshoot;
        if (opacity <= 0) continue;
      }

      m.compose(new THREE.Vector3(note.x, note.y, z), q, s);
      this.noteMesh.setMatrixAt(count, m);
      const color = new THREE.Color(NOTE_COLORS[Math.abs(note.index ?? i) % NOTE_COLORS.length]);
      this.noteMesh.setColorAt(count, color);
      this._noteAlphaAttr.setX(count, Math.max(0, Math.min(1, opacity)));
      count++;
    }

    this.noteMesh.count = count;
    this.noteMesh.instanceMatrix.needsUpdate = true;
    this._noteAlphaAttr.needsUpdate = true;
    if (this.noteMesh.instanceColor) this.noteMesh.instanceColor.needsUpdate = true;
  }

  updateTrail(points) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const count = Math.min(points.length, MAX_TRAIL_INSTANCES);
    for (let i = 0; i < count; i++) {
      const p = points[i];
      const s = new THREE.Vector3(p.size, p.size, p.size);
      m.compose(new THREE.Vector3(p.x, p.y, 0), q, s);
      this.trailMesh.setMatrixAt(i, m);
    }
    this.trailMesh.count = count;
    this.trailMesh.instanceMatrix.needsUpdate = true;
  }

  spawnHitPopup(worldX, worldY, text) {
    this._spawnPopup(worldX, worldY, text, "hit-popup");
  }

  spawnMissIcon(worldX, worldY) {
    this._spawnPopup(worldX, worldY, "✕", "miss-popup");
  }

  _spawnPopup(worldX, worldY, text, className) {
    if (!this.popupLayer) return;
    const el = document.createElement("div");
    el.className = className;
    el.textContent = text;
    const { x, y } = this.worldToScreen(worldX, worldY, 0);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.popupLayer.appendChild(el);
    requestAnimationFrame(() => el.classList.add("rise"));
    setTimeout(() => el.remove(), 300);
  }

  setSpace(name) {
    if (this.space) {
      this.scene.remove(this.space.group);
      this.space.dispose?.();
    }
    this.space = buildSpace(name, this.loader);
    this.scene.add(this.space.group);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth, h = parent.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    const dt = this.clock.getDelta();
    this.space?.update?.(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

// ---------------------------------------------------------------------------
// Background "Spaces" — original re-implementations inspired by the names of
// scripts/spaces/{Void,Galaxy,Grid,Waves,Tunnel,Squircles}.cs. Not a 1:1 shader
// port (that code isn't portable across engines), but built to fit the theme.
// ---------------------------------------------------------------------------

function buildSpace(name, loader) {
  switch (name) {
    case "Galaxy": return spaceGalaxy(loader);
    case "Grid": return spaceGrid(loader);
    case "Waves": return spaceWaves();
    case "Tunnel": return spaceTunnel(loader);
    case "Squircles": return spaceSquircles(loader);
    case "Void":
    default: return spaceVoid();
  }
}

function spaceVoid() {
  const group = new THREE.Group();
  return { group, update() {} };
}

function spaceGalaxy(loader) {
  const group = new THREE.Group();
  const tex = loadTexture(loader, "assets/textures/galaxy_skybox.jpg");
  const geo = new THREE.SphereGeometry(80, 32, 32);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
  const sphere = new THREE.Mesh(geo, mat);
  group.add(sphere);

  const starGeo = new THREE.BufferGeometry();
  const starCount = 800;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 20 + Math.random() * 50;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = -Math.abs(r * Math.cos(phi)) - 5;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.8 });
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

  return {
    group,
    update(dt) {
      sphere.rotation.y += dt * 0.01;
      stars.rotation.y += dt * 0.02;
    },
  };
}

function spaceGrid(loader) {
  const group = new THREE.Group();
  const tex = loadTexture(loader, "assets/textures/grid_tile.png");
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  const geo = new THREE.PlaneGeometry(120, 120);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35 });
  const floor = new THREE.Mesh(geo, mat);
  floor.position.z = -12;
  group.add(floor);
  return {
    group,
    update(dt) {
      tex.offset.y -= dt * 0.05;
    },
  };
}

function spaceWaves() {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(60, 40, 80, 40);
  const mat = new THREE.MeshBasicMaterial({ color: 0x39204a, wireframe: true, transparent: true, opacity: 0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.z = -10;
  group.add(mesh);
  const base = geo.attributes.position.array.slice();
  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        pos.setZ(i, Math.sin(x * 0.3 + t) * 0.5 + Math.cos(y * 0.3 + t * 0.8) * 0.5);
      }
      pos.needsUpdate = true;
    },
  };
}

function spaceTunnel(loader) {
  const group = new THREE.Group();
  const ringTex = loadTexture(loader, "assets/textures/tunnel_ring_b.png");
  ringTex.wrapS = ringTex.wrapT = THREE.RepeatWrapping;
  const rings = [];
  for (let i = 0; i < 14; i++) {
    const geo = new THREE.RingGeometry(2.4, 3, 24);
    const mat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.z = -i * 4 - 4;
    rings.push(ring);
    group.add(ring);
  }
  return {
    group,
    update(dt) {
      for (const ring of rings) {
        ring.position.z += dt * 3;
        ring.rotation.z += dt * 0.1;
        if (ring.position.z > 4) ring.position.z -= 14 * 4;
      }
    },
  };
}

function spaceSquircles(loader) {
  const group = new THREE.Group();
  const tex = loadTexture(loader, "assets/textures/RhythiaSquircle.png");
  const geo = new THREE.PlaneGeometry(1, 1);
  const shapes = [];
  for (let i = 0; i < 24; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.12 + Math.random() * 0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    const scale = 0.6 + Math.random() * 2.2;
    mesh.scale.setScalar(scale);
    mesh.position.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 16, -Math.random() * 30 - 4);
    mesh.rotation.z = Math.random() * Math.PI;
    mesh.userData.speed = 0.2 + Math.random() * 0.4;
    shapes.push(mesh);
    group.add(mesh);
  }
  return {
    group,
    update(dt) {
      for (const mesh of shapes) {
        mesh.rotation.z += dt * 0.05 * mesh.userData.speed;
        mesh.position.z += dt * mesh.userData.speed;
        if (mesh.position.z > 4) mesh.position.z = -30;
      }
    },
  };
}
