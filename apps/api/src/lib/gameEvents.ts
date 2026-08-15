import { prisma } from "./prismaClient.js";

/**
 * Reads the exp/gold multiplier from whatever GameEvent(s) are active right now. Overlapping
 * active events combine by taking the max of each multiplier independently — not multiplying
 * them together — so two admins accidentally scheduling overlapping x2 events doesn't silently
 * become x4.
 */
export async function getActiveEventMultipliers(): Promise<{ expMultiplier: number; goldMultiplier: number }> {
  const now = new Date();
  const active = await prisma.gameEvent.findMany({ where: { startsAt: { lte: now }, endsAt: { gte: now } } });
  if (active.length === 0) return { expMultiplier: 1, goldMultiplier: 1 };
  return {
    expMultiplier: Math.max(...active.map((e) => e.expMultiplier)),
    goldMultiplier: Math.max(...active.map((e) => e.goldMultiplier)),
  };
}
