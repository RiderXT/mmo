import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { resolveTravelArrival } from "../../lib/travelResolution.js";
import { getCharacterMovementSpeedPct } from "../expeditions/service.js";
import type { StartTravelInput } from "@mmo/shared";

export class TravelError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

async function assertCharacterOwnership(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new TravelError("Nie znaleziono postaci", 404);
  }
  return character;
}

/** Starts a journey to a zone (or, when destinationZoneId is null, back to the village) from
 * wherever the character currently stands — village or another zone (Etap 9: direct zone-to-
 * zone travel, no forced stop at the village). currentZoneId is left untouched until arrival is
 * resolved (lib/travelResolution.ts) — only travelDestinationZoneId/travelArrivesAt change here. */
export async function startTravel(
  input: StartTravelInput,
  userId: string,
  requestId?: string,
) {
  await resolveTravelArrival(input.characterId);
  const owner = await assertCharacterOwnership(input.characterId, userId);

  if (owner.activeExpeditionId) {
    throw new TravelError("Postać walczy — najpierw zakończ lub opuść ekspedycję", 409);
  }
  if (owner.travelArrivesAt) {
    throw new TravelError("Postać jest już w drodze", 409);
  }
  if (owner.currentZoneId === input.destinationZoneId) {
    throw new TravelError("Postać już tam jest", 409);
  }

  const [fromZone, toZone] = await Promise.all([
    owner.currentZoneId ? prisma.zone.findUnique({ where: { id: owner.currentZoneId } }) : null,
    input.destinationZoneId ? prisma.zone.findUnique({ where: { id: input.destinationZoneId } }) : null,
  ]);
  if (input.destinationZoneId && !toZone) {
    throw new TravelError("Nie znaleziono krainy docelowej", 404);
  }

  // Zone-to-zone travel time is approximated as the sum of both zones' own one-way travel
  // times (village<->zone stays exactly today's behavior, since the village side contributes
  // 0) — a deliberately simple proxy for "farther zones take longer" without needing an NxN
  // admin-authored travel matrix.
  const baseSeconds = (fromZone?.travelTimeSeconds ?? 0) + (toZone?.travelTimeSeconds ?? 0);
  const movementSpeedPct = await getCharacterMovementSpeedPct(input.characterId);
  const travelSeconds = Math.max(1, Math.round(baseSeconds * (1 - movementSpeedPct)));
  const travelArrivesAt = new Date(Date.now() + travelSeconds * 1000);

  // Atomic guard against a race with a second concurrent travel/expedition-start request.
  const guarded = await prisma.character.updateMany({
    where: { id: owner.id, activeExpeditionId: null, travelArrivesAt: null },
    data: { travelDestinationZoneId: input.destinationZoneId, travelArrivesAt },
  });
  if (guarded.count !== 1) {
    throw new TravelError("Nie udało się rozpocząć podróży — spróbuj ponownie", 409);
  }

  await logAction({
    module: "travel",
    action: "start",
    actorUserId: userId,
    actorCharacterId: owner.id,
    requestId,
    payload: { fromZoneId: owner.currentZoneId, toZoneId: input.destinationZoneId, travelSeconds },
  });

  return {
    travelDestinationZoneId: input.destinationZoneId,
    travelArrivesAt: travelArrivesAt.toISOString(),
  };
}
