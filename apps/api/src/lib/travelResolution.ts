import { prisma } from "./prismaClient.js";

/**
 * Lazily resolves a completed journey: if the character's travelArrivesAt has passed, moves
 * currentZoneId to travelDestinationZoneId (or null for the village) and clears both travel
 * fields. Called at the top of any action that reads or depends on a character's location
 * (characters/service.ts, expeditions/service.ts, modules/travel/service.ts) — kept in lib/
 * rather than modules/travel/ specifically to avoid a circular import between those modules.
 *
 * Compare-and-swap on the exact travelArrivesAt value just read, rather than an
 * updateMany({where:{lte: now}}) — Prisma can't set one column to another column's value
 * (currentZoneId = travelDestinationZoneId) without raw SQL, so the destination has to be read
 * first; the exact-value WHERE clause is what makes the subsequent update race-safe (same idiom
 * as claimExpedition/leaveExpedition's status-flip guard).
 */
export async function resolveTravelArrival(characterId: string): Promise<void> {
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  if (!character.travelArrivesAt || character.travelArrivesAt.getTime() > Date.now()) return;

  await prisma.character.updateMany({
    where: { id: characterId, travelArrivesAt: character.travelArrivesAt },
    data: {
      currentZoneId: character.travelDestinationZoneId,
      travelDestinationZoneId: null,
      travelArrivesAt: null,
    },
  });
}
