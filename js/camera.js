// Ported from scripts/game/camera/CameraLock.cs and CameraSpin.cs.
// Operates on a plain {x,y,z} position + {x,y,z} euler rotation (radians) that
// the Three.js renderer copies onto the real camera each frame.

import { BOUNDS, clampVec2 } from "./constants.js";

export function cameraLockStep(session, settingsValues, mouseDelta) {
  let sensitivity = settingsValues.Sensitivity;
  sensitivity *= settingsValues.FoV / 70;

  if (settingsValues.CursorDrift) {
    const next = {
      x: session.cursorPosition.x + mouseDelta.x / 120 * sensitivity,
      y: session.cursorPosition.y - mouseDelta.y / 120 * sensitivity,
    };
    session.cursorPosition = clampVec2(next, BOUNDS.x, BOUNDS.y);
  } else {
    session.rawCursorPosition = {
      x: session.rawCursorPosition.x + mouseDelta.x / 120 * sensitivity,
      y: session.rawCursorPosition.y - mouseDelta.y / 120 * sensitivity,
    };
    session.cursorPosition = clampVec2(session.rawCursorPosition, BOUNDS.x, BOUNDS.y);
  }

  const parallax = settingsValues.CameraParallax;
  return {
    position: {
      x: session.cursorPosition.x * parallax,
      y: session.cursorPosition.y * parallax,
      z: 3.75,
    },
    rotation: { x: 0, y: 0, z: 0 },
  };
}

export function cameraSpinStep(session, settingsValues, mouseDelta, prevRotation) {
  let sensitivity = settingsValues.Sensitivity;
  sensitivity *= settingsValues.FoV / 70;

  const rotation = {
    x: clampRad(prevRotation.x - (mouseDelta.y / 120) * sensitivity * (1 / Math.PI), -Math.PI / 2, Math.PI / 2),
    y: prevRotation.y - (mouseDelta.x / 120) * sensitivity * (1 / Math.PI),
    z: 0,
  };

  const position = {
    x: session.cursorPosition.x * 0.25,
    y: session.cursorPosition.y * 0.25,
    z: 3.5,
  };

  // Derive the on-grid cursor position from where the camera is looking, so
  // hit detection still happens in the same 2D grid space as CameraLock.
  const basisZ = eulerToForward(rotation);
  const wtf = 0.95;
  const hypotenuse = (wtf + position.z) / basisZ.z;
  const distance = Math.sqrt(Math.max(0, hypotenuse * hypotenuse - (wtf + position.z) * (wtf + position.z)));
  const len = Math.hypot(basisZ.x, basisZ.y) || 1;
  session.rawCursorPosition = {
    x: (basisZ.x / len) * -distance,
    y: (basisZ.y / len) * -distance,
  };
  session.cursorPosition = clampVec2(session.rawCursorPosition, BOUNDS.x, BOUNDS.y);

  return { position, rotation };
}

function clampRad(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function eulerToForward(rotation) {
  // Approximates Godot's Basis.Z (the camera's local +Z axis in world space)
  // for a simple XY-order euler rotation.
  const cx = Math.cos(rotation.x), sx = Math.sin(rotation.x);
  const cy = Math.cos(rotation.y), sy = Math.sin(rotation.y);
  return { x: sy * cx, y: -sx, z: cy * cx };
}
