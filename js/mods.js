// Ported from scripts/game/mods/GhostMod.cs and NoFailMod.cs.
// Only these two are implemented upstream (see Constants.MODS_MULTIPLIER_INCREMENT);
// Spin/Flashlight/Chaos/HardRock are commented out in the source and skipped here too.

export const MODS = {
  NoFail: {
    name: "No Fail",
    description: "You cannot fail, regardless of health.",
    rankable: true,
    scoreMultiplier: 1,
  },
  Ghost: {
    name: "Ghost",
    description: "Notes fade out as they approach, rewarding memorisation.",
    rankable: true,
    scoreMultiplier: 1.03,
  },
};

// Extra opacity subtracted from a note as it nears the hit plane, 0 (far) -> 1 (at hit time).
export function ghostOpacityFalloff(approachedFraction) {
  return Math.min(1, approachedFraction * 2);
}
