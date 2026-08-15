import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateGameEventInput, UpdateGameEventInput } from "@mmo/shared";

export class GameEventError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export function listGameEvents() {
  return prisma.gameEvent.findMany({ orderBy: { startsAt: "desc" } });
}

function eventData(input: CreateGameEventInput) {
  return {
    name: input.name,
    expMultiplier: input.expMultiplier,
    goldMultiplier: input.goldMultiplier,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
  };
}

export async function createGameEvent(input: CreateGameEventInput, actorUserId: string, requestId?: string) {
  const event = await prisma.gameEvent.create({ data: eventData(input) });
  await logAction({
    module: "admin:events",
    action: "create",
    actorUserId,
    requestId,
    payload: { eventId: event.id, name: event.name },
  });
  return event;
}

export async function updateGameEvent(
  id: string,
  input: UpdateGameEventInput,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.gameEvent.findUnique({ where: { id } });
  if (!existing) throw new GameEventError("Nie znaleziono eventu", 404);

  const event = await prisma.gameEvent.update({ where: { id }, data: eventData(input) });
  await logAction({
    module: "admin:events",
    action: "update",
    actorUserId,
    requestId,
    payload: { eventId: event.id, name: event.name },
  });
  return event;
}

export async function deleteGameEvent(id: string, actorUserId: string, requestId?: string) {
  const existing = await prisma.gameEvent.findUnique({ where: { id } });
  if (!existing) throw new GameEventError("Nie znaleziono eventu", 404);

  await prisma.gameEvent.delete({ where: { id } });
  await logAction({
    module: "admin:events",
    action: "delete",
    actorUserId,
    requestId,
    payload: { eventId: id, name: existing.name },
  });
}
