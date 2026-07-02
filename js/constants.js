// Ported from Client-master/scripts/Constants.cs
// Core numeric constants that define grid space, hit detection and difficulty presentation.

export const CURSOR_SIZE = 0.2625;
export const GRID_SIZE = 3.0;
export const BOUNDS = {
  x: GRID_SIZE / 2 - CURSOR_SIZE / 2,
  y: GRID_SIZE / 2 - CURSOR_SIZE / 2,
};
export const HIT_BOX_SIZE = 0.07;
export const HIT_WINDOW = 55; // ms

export const BREAK_TIME = 4000;

export const DIFFICULTIES = ["N/A", "Easy", "Medium", "Hard", "Insane", "Illogical"];
export const DIFFICULTY_COLORS = [
  "#ffffff",
  "#77f379",
  "#fff832",
  "#e24479",
  "#9d6eff",
  "#0094fc",
];

export const MODS_MULTIPLIER_INCREMENT = {
  NoFail: 0,
  Ghost: 0.0675,
};

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function clampVec2(v, bx, by) {
  return { x: clamp(v.x, -bx, bx), y: clamp(v.y, -by, by) };
}
