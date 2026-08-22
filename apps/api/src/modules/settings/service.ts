import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { GatheringSettingsSchema, type GatheringSettings, ReferralSettingsSchema, type ReferralSettings } from "@mmo/shared";

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

// Admin-adjustable ceiling for apps/api/scripts/bot/ launches (see modules/admin/bots/service.ts)
// — was a hardcoded MAX_CONCURRENT=20 constant. The 500 hard cap here is a safety backstop
// against a fat-fingered value that could genuinely overload the VPS (see docs/architecture.md,
// the 2026-08-20 bot-crash incident), not a value anyone should actually approach casually.
export const BOTS_MAX_CONCURRENT_KEY = "bots.maxConcurrent";
const BOTS_MAX_CONCURRENT_DEFAULT = 20;
const BOTS_MAX_CONCURRENT_HARD_CAP = 500;

export async function getBotsMaxConcurrent(): Promise<number> {
  const row = await prisma.settings.findUnique({ where: { key: BOTS_MAX_CONCURRENT_KEY } });
  if (!row) return BOTS_MAX_CONCURRENT_DEFAULT;
  const value = JSON.parse(row.value) as unknown;
  return typeof value === "number" ? value : BOTS_MAX_CONCURRENT_DEFAULT;
}

export async function setBotsMaxConcurrent(count: number, actorUserId: string, requestId?: string): Promise<number> {
  if (!Number.isInteger(count) || count < 1 || count > BOTS_MAX_CONCURRENT_HARD_CAP) {
    throw new SettingsError(`Limit botów musi być liczbą całkowitą 1-${BOTS_MAX_CONCURRENT_HARD_CAP}`, 400);
  }

  await prisma.settings.upsert({
    where: { key: BOTS_MAX_CONCURRENT_KEY },
    create: { key: BOTS_MAX_CONCURRENT_KEY, value: JSON.stringify(count) },
    update: { value: JSON.stringify(count) },
  });

  await logAction({
    module: "admin:settings",
    action: "update",
    actorUserId,
    requestId,
    payload: { key: BOTS_MAX_CONCURRENT_KEY, count },
  });

  return count;
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

export const REFERRAL_SETTINGS_KEY = "referral.settings";
// Rewards disabled until an admin explicitly configures them — see lib/referralRewards.ts.
const REFERRAL_SETTINGS_DEFAULT: ReferralSettings = {
  rewardKind: "none",
  goldAmount: 0,
  itemId: null,
  itemQuantity: 1,
  target: "both",
  requiredLevel: 1,
};

export async function getReferralSettings(): Promise<ReferralSettings> {
  const row = await prisma.settings.findUnique({ where: { key: REFERRAL_SETTINGS_KEY } });
  if (!row) return REFERRAL_SETTINGS_DEFAULT;
  const parsed = ReferralSettingsSchema.safeParse(JSON.parse(row.value));
  return parsed.success ? parsed.data : REFERRAL_SETTINGS_DEFAULT;
}

export async function setReferralSettings(
  input: ReferralSettings,
  actorUserId: string,
  requestId?: string,
): Promise<ReferralSettings> {
  const validated = ReferralSettingsSchema.parse(input);

  await prisma.settings.upsert({
    where: { key: REFERRAL_SETTINGS_KEY },
    create: { key: REFERRAL_SETTINGS_KEY, value: JSON.stringify(validated) },
    update: { value: JSON.stringify(validated) },
  });

  await logAction({
    module: "admin:settings",
    action: "update",
    actorUserId,
    requestId,
    payload: { key: REFERRAL_SETTINGS_KEY, ...validated },
  });

  return validated;
}
