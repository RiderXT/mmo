// Cubic exp curve (replaces the original flat "level*100" placeholder). expForLevel(1) = 0 by
// design, so a brand-new character is always exactly level 1. Reference points: lvl10 ≈ 72.9k,
// lvl40 ≈ 5.93M, lvl70 ≈ 32.85M, lvl99 ≈ 94.1M cumulative exp.
const EXP_CURVE_COEFFICIENT = 100;
const EXP_CURVE_EXPONENT = 3;

/** Cumulative exp required to REACH this level (i.e. exp at which computeLevel first returns it). */
export function expForLevel(level: number): number {
  return Math.round(EXP_CURVE_COEFFICIENT * Math.pow(Math.max(0, level - 1), EXP_CURVE_EXPONENT));
}

/** Inverts expForLevel. cbrt gives a close starting guess; the two while-loops correct any
 * rounding drift from expForLevel's Math.round so the two functions stay exact inverses. */
export function computeLevel(totalExp: number): number {
  if (totalExp <= 0) return 1;
  let level = Math.max(1, Math.floor(Math.cbrt(totalExp / EXP_CURVE_COEFFICIENT)) + 1);
  while (expForLevel(level + 1) <= totalExp) level++;
  while (level > 1 && expForLevel(level) > totalExp) level--;
  return level;
}

// How many on-level monster kills a character is expected to need to clear one level. Shared by
// seed-zones.ts (monster expReward) and the expedition anti-cheat plausibility check, so both
// stay in lockstep with whatever EXP_CURVE_* above is tuned to — rebalancing the curve alone
// automatically rebalances both.
const KILLS_PER_LEVEL = 25;

/** Exp a single on-level monster kill should be worth at this level, derived directly from the
 * curve above instead of being a separately hand-tuned number. */
export function expRewardForLevel(level: number): number {
  const needed = expForLevel(level + 1) - expForLevel(level);
  return Math.max(1, Math.round(needed / KILLS_PER_LEVEL));
}
