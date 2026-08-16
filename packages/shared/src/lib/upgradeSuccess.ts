// Items are meant to top out around +9 (see Item.maxUpgradeStats "stats at +9"). The default
// curve is anchored there: chance stays high for the first few levels then drops off faster
// as targetLevel approaches the cap, never going below MIN_UPGRADE_SUCCESS_CHANCE.
export const MAX_UPGRADE_LEVEL = 9;
export const MIN_UPGRADE_SUCCESS_CHANCE = 0.05;

/** Default success chance for upgrading TO targetLevel (e.g. targetLevel=1 is the +0→+1 attempt).
 * Used identically by the server (rolling the upgrade) and the client (showing the % beforehand)
 * whenever an item has no per-level override configured in the admin panel. */
export function defaultUpgradeSuccessChance(targetLevel: number): number {
  const ratio = Math.min(1, Math.max(0, (targetLevel - 1) / (MAX_UPGRADE_LEVEL - 1)));
  const chance = 1 - Math.pow(ratio, 1.5) * 0.9;
  return Math.max(MIN_UPGRADE_SUCCESS_CHANCE, Math.min(1, chance));
}
