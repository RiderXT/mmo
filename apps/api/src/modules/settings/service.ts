import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { GatheringSettingsSchema, type GatheringSettings } from "@mmo/shared";

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

export const GATHERING_SETTINGS_KEY = "gathering.settings";
const GATHERING_SETTINGS_DEFAULT: GatheringSettings = {
  fishing: { minSeconds: 8, maxSeconds: 20 },
  miningExtract: { minSeconds: 10, maxSeconds: 25 },
  miningSearch: { minSeconds: 5, maxSeconds: 15 },
  maxCyclesPerResolve: 100,
  successesPerToolUpgrade: 100,
};

export async function getGatheringSettings(): Promise<GatheringSettings> {
  const row = await prisma.settings.findUnique({ where: { key: GATHERING_SETTINGS_KEY } });
  if (!row) return GATHERING_SETTINGS_DEFAULT;
  const parsed = GatheringSettingsSchema.safeParse(JSON.parse(row.value));
  return parsed.success ? parsed.data : GATHERING_SETTINGS_DEFAULT;
}

export async function setGatheringSettings(
  input: GatheringSettings,
  actorUserId: string,
  requestId?: string,
): Promise<GatheringSettings> {
  const validated = GatheringSettingsSchema.parse(input);

  await prisma.settings.upsert({
    where: { key: GATHERING_SETTINGS_KEY },
    create: { key: GATHERING_SETTINGS_KEY, value: JSON.stringify(validated) },
    update: { value: JSON.stringify(validated) },
  });

  await logAction({
    module: "admin:settings",
    action: "update",
    actorUserId,
    requestId,
    payload: { key: GATHERING_SETTINGS_KEY, ...validated },
  });

  return validated;
}
