import { prisma } from "./prismaClient.js";

export interface EventBonusDrop {
  itemId: string;
  dropChance: number;
}

/**
 * Reads the exp/gold multiplier — and any global bonus item drop — from whatever GameEvent(s)
 * are active right now. Overlapping active events combine by taking the max of each multiplier
 * independently — not multiplying them together — so two admins accidentally scheduling
 * overlapping x2 events doesn't silently become x4. If multiple active events each configure a
 * bonus drop, only the one with the highest chance applies (same "take the best" philosophy,
 * not one roll per event).
 */
export async function getActiveEventMultipliers(): Promise<{
  expMultiplier: number;
  goldMultiplier: number;
  bonusDrop: EventBonusDrop | null;
}> {
  const now = new Date();
  const active = await prisma.gameEvent.findMany({ where: { startsAt: { lte: now }, endsAt: { gte: now } } });
  if (active.length === 0) return { expMultiplier: 1, goldMultiplier: 1, bonusDrop: null };

  const bonusCandidates = active.filter(
    (e): e is typeof e & { bonusDropItemId: string } => !!e.bonusDropItemId && (e.bonusDropChance ?? 0) > 0,
  );
  const bestBonus = bonusCandidates.sort((a, b) => (b.bonusDropChance ?? 0) - (a.bonusDropChance ?? 0))[0];

  return {
    expMultiplier: Math.max(...active.map((e) => e.expMultiplier)),
    goldMultiplier: Math.max(...active.map((e) => e.goldMultiplier)),
    bonusDrop: bestBonus ? { itemId: bestBonus.bonusDropItemId, dropChance: bestBonus.bonusDropChance ?? 0 } : null,
  };
}
