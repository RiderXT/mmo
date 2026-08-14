import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";

export const EXPEDITION_DURATION_KEY = "expedition.defaultDurationMinutes";
const EXPEDITION_DURATION_DEFAULT = 30;
const MIN_MINUTES = 1;
const MAX_MINUTES = 720;

export async function getExpeditionDurationMinutes(): Promise<number> {
  const row = await prisma.settings.findUnique({ where: { key: EXPEDITION_DURATION_KEY } });
  if (!row) return EXPEDITION_DURATION_DEFAULT;
  const value = JSON.parse(row.value) as unknown;
  return typeof value === "number" ? value : EXPEDITION_DURATION_DEFAULT;
}

export class SettingsError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export async function setExpeditionDurationMinutes(
  minutes: number,
  actorUserId: string,
  requestId?: string,
): Promise<number> {
  if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
    throw new SettingsError(`Czas ekspedycji musi być liczbą całkowitą ${MIN_MINUTES}-${MAX_MINUTES} minut`, 400);
  }

  await prisma.settings.upsert({
    where: { key: EXPEDITION_DURATION_KEY },
    create: { key: EXPEDITION_DURATION_KEY, value: JSON.stringify(minutes) },
    update: { value: JSON.stringify(minutes) },
  });

  await logAction({
    module: "admin:settings",
    action: "update",
    actorUserId,
    requestId,
    payload: { key: EXPEDITION_DURATION_KEY, minutes },
  });

  return minutes;
}
