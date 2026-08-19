import type { Character } from "@prisma/client";

/**
 * Reads the personal exp/gold/drop multipliers granted by a "buff_exp"/"buff_gold"/"buff_drop"
 * item (consumed via inventory/service.ts useBuffItem) directly off an already-loaded Character
 * row — no extra query. These MULTIPLY with the global GameEvent multiplier (getActiveEventMultipliers
 * in lib/gameEvents.ts), they don't replace it. Expired/never-set = 1 (no effect).
 */
export function getActivePersonalBuffMultipliers(character: Character): {
  expMultiplier: number;
  goldMultiplier: number;
  dropMultiplier: number;
} {
  const now = Date.now();
  const active = (multiplier: number | null, until: Date | null) =>
    multiplier != null && until != null && until.getTime() > now ? multiplier : 1;

  return {
    expMultiplier: active(character.expBuffMultiplier, character.expBuffUntil),
    goldMultiplier: active(character.goldBuffMultiplier, character.goldBuffUntil),
    dropMultiplier: active(character.dropBuffMultiplier, character.dropBuffUntil),
  };
}
