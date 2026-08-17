import { prisma } from "./prismaClient.js";

/**
 * Whether a character currently has an active gathering session (fishing/mining) — used by
 * expeditions/service.ts and travel/service.ts to block starting an expedition/travel while
 * gathering, mirroring the existing activeExpeditionId/travelArrivesAt mutual-exclusion checks.
 * Kept in lib/ (not modules/gathering/) specifically to avoid a circular import, same reasoning
 * as travelResolution.ts.
 */
export async function hasActiveGatherSession(characterId: string): Promise<boolean> {
  const session = await prisma.gatherSession.findUnique({ where: { characterId } });
  return session !== null;
}
