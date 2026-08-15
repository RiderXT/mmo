import type { StatKey } from "@mmo/shared";

type StatBlock = Partial<Record<StatKey, number>>;

/** Mirrors interpolateUpgrade in apps/api/src/modules/expeditions/combat.ts — keep in sync.
 * Interpolates an item's stats between +0 (base) and +9 (maxUpgradeStats) by upgrade level, so
 * the UI shows the item's actual current stat instead of the raw +0 baseline.
 *
 * Rounded to 2 decimals (display-only concern) rather than to whole integers — StatKey mixes
 * large integer stats (attack/defense/hp) with small fractional ones (movementSpeed,
 * critChance, ...), and rounding to 0 decimals would floor e.g. 0.1 movementSpeed to 0. */
export function interpolateUpgrade(base: StatBlock, max: StatBlock, level: number): StatBlock {
  const t = Math.min(9, Math.max(0, level)) / 9;
  const keys = new Set([...Object.keys(base), ...Object.keys(max)]) as Set<StatKey>;
  const result: StatBlock = {};
  for (const key of keys) {
    const b = base[key] ?? 0;
    const m = max[key] ?? b;
    result[key] = Math.round((b + (m - b) * t) * 100) / 100;
  }
  return result;
}
