import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { resolveTravelArrival } from "../../lib/travelResolution.js";
import { clearStaleActiveExpeditionPointer } from "../expeditions/service.js";
import { addLootToInventory } from "../inventory/service.js";
import { getGatheringSettings } from "../settings/service.js";
import type { GatherKind, GatherPhase, GatherSessionDto, GatheringSettings, StartGatheringInput } from "@mmo/shared";

export class GatheringError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

type GatherSessionRow = NonNullable<Awaited<ReturnType<typeof prisma.gatherSession.findUnique>>>;
type DropRow = { itemId: string; dropChance: number; minQty: number; maxQty: number };

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function assertCharacterOwnership(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new GatheringError("Nie znaleziono postaci", 404);
  }
  return character;
}

function assertLevelAllowed(
  level: number,
  zone: { minLevel: number; maxLevel: number; allowRevisitAboveLevel: boolean },
) {
  const maxOk = zone.allowRevisitAboveLevel || level <= zone.maxLevel;
  if (level < zone.minLevel || !maxOk) {
    throw new GatheringError(
      `Ta kraina jest dla poziomów ${zone.minLevel}-${zone.maxLevel}, a postać ma poziom ${level}`,
      400,
    );
  }
}

/** Equipped rod/pickaxe's gather bonuses, interpolated at its current upgrade level (0 at +0,
 * item.gatherXBonusPctMax at +9, same lerp shape as combat.ts's interpolateUpgrade) — null if no
 * such tool is equipped. */
async function getEquippedToolBonuses(
  characterId: string,
  slot: "rod" | "pickaxe",
): Promise<{ speedBonusPct: number; chanceBonusPct: number } | null> {
  const inv = await prisma.inventoryItem.findFirst({
    where: { characterId, equippedSlot: slot },
    include: { item: true },
  });
  if (!inv) return null;
  const t = Math.min(9, Math.max(0, inv.upgradeLevel)) / 9;
  return {
    speedBonusPct: (inv.item.gatherSpeedBonusPctMax ?? 0) * t,
    chanceBonusPct: (inv.item.gatherChanceBonusPctMax ?? 0) * t,
  };
}

/** Sums baitChanceBonusPct across every bait item sitting in an active slot — bait is not
 * consumed (unlike potions), just a passive presence check, so no quantity/depletion logic. */
async function getBaitChanceBonusPct(characterId: string): Promise<number> {
  const baits = await prisma.inventoryItem.findMany({
    where: { characterId, activeSlotIndex: { not: null }, item: { type: "bait" } },
    include: { item: true },
  });
  return baits.reduce((sum, inv) => sum + (inv.item.baitChanceBonusPct ?? 0), 0);
}

function rollPhaseSeconds(range: { minSeconds: number; maxSeconds: number }, speedBonusPct: number): number {
  const rolled = randomInt(range.minSeconds, range.maxSeconds);
  return Math.max(1, Math.round(rolled * (1 - speedBonusPct)));
}

function rollDrops(drops: DropRow[], chanceBonusPct: number): { itemId: string; quantity: number }[] {
  const awarded: { itemId: string; quantity: number }[] = [];
  for (const drop of drops) {
    const chance = Math.min(1, drop.dropChance + chanceBonusPct);
    if (Math.random() < chance) {
      awarded.push({ itemId: drop.itemId, quantity: randomInt(drop.minQty, drop.maxQty) });
    }
  }
  return awarded;
}

function toDto(session: GatherSessionRow): GatherSessionDto {
  return {
    id: session.id,
    characterId: session.characterId,
    kind: session.kind as GatherKind,
    fishingSpotId: session.fishingSpotId,
    mineId: session.mineId,
    phase: session.phase as GatherPhase,
    phaseEndsAt: session.phaseEndsAt.toISOString(),
    totalGathered: session.totalGathered,
  };
}

export async function startGathering(input: StartGatheringInput, userId: string, requestId?: string) {
  await resolveTravelArrival(input.characterId);
  await clearStaleActiveExpeditionPointer(input.characterId);
  const character = await assertCharacterOwnership(input.characterId, userId);

  if (character.activeExpeditionId) {
    throw new GatheringError("Postać jest na ekspedycji", 409);
  }
  if (character.travelArrivesAt) {
    throw new GatheringError("Postać jest w drodze — poczekaj na przybycie", 409);
  }
  const existing = await prisma.gatherSession.findUnique({ where: { characterId: input.characterId } });
  if (existing) {
    throw new GatheringError("Postać już zbiera surowce", 409);
  }

  const settings = await getGatheringSettings();

  if (input.kind === "fishing") {
    const spot = await prisma.fishingSpot.findUnique({ where: { id: input.targetId }, include: { zone: true } });
    if (!spot) throw new GatheringError("Nie znaleziono łowiska", 404);
    if (character.currentZoneId !== spot.zoneId) {
      throw new GatheringError("Postać musi stać w krainie z tym łowiskiem", 409);
    }
    assertLevelAllowed(character.level, spot.zone);
    const tool = await getEquippedToolBonuses(character.id, "rod");
    if (!tool) throw new GatheringError("Załóż wędkę, żeby łowić", 400);

    const range = {
      minSeconds: spot.minCatchSeconds ?? settings.fishing.minSeconds,
      maxSeconds: spot.maxCatchSeconds ?? settings.fishing.maxSeconds,
    };
    const session = await prisma.gatherSession.create({
      data: {
        characterId: character.id,
        kind: "fishing",
        fishingSpotId: spot.id,
        phase: "catching",
        phaseEndsAt: new Date(Date.now() + rollPhaseSeconds(range, tool.speedBonusPct) * 1000),
      },
    });
    await logAction({
      module: "gathering",
      action: "start",
      actorUserId: userId,
      actorCharacterId: character.id,
      requestId,
      payload: { kind: "fishing", fishingSpotId: spot.id },
    });
    return toDto(session);
  }

  const mine = await prisma.mine.findUnique({ where: { id: input.targetId }, include: { zone: true } });
  if (!mine) throw new GatheringError("Nie znaleziono kopalni", 404);
  if (character.currentZoneId !== mine.zoneId) {
    throw new GatheringError("Postać musi stać w krainie z tą kopalnią", 409);
  }
  assertLevelAllowed(character.level, mine.zone);
  const tool = await getEquippedToolBonuses(character.id, "pickaxe");
  if (!tool) throw new GatheringError("Załóż kilof, żeby kopać", 400);

  const range = {
    minSeconds: mine.minExtractSeconds ?? settings.miningExtract.minSeconds,
    maxSeconds: mine.maxExtractSeconds ?? settings.miningExtract.maxSeconds,
  };
  const session = await prisma.gatherSession.create({
    data: {
      characterId: character.id,
      kind: "mining",
      mineId: mine.id,
      phase: "extracting",
      phaseEndsAt: new Date(Date.now() + rollPhaseSeconds(range, tool.speedBonusPct) * 1000),
    },
  });
  await logAction({
    module: "gathering",
    action: "start",
    actorUserId: userId,
    actorCharacterId: character.id,
    requestId,
    payload: { kind: "mining", mineId: mine.id },
  });
  return toDto(session);
}

/** Resolves one elapsed phase: grants the phase's reward (if any) and rolls the next phase's
 * duration, anchored off the just-elapsed phaseEndsAt (not Date.now()) so a run of catch-up
 * cycles advances the session's own timeline correctly instead of each cycle eating the whole
 * elapsed gap. */
async function resolveOnePhase(
  session: GatherSessionRow,
  settings: GatheringSettings,
  speedBonusPct: number,
  chanceBonusPct: number,
): Promise<GatherSessionRow> {
  if (session.kind === "fishing") {
    const spot = await prisma.fishingSpot.findUniqueOrThrow({
      where: { id: session.fishingSpotId! },
      include: { drops: true },
    });
    const awarded = rollDrops(spot.drops, chanceBonusPct);
    if (awarded.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const a of awarded) await addLootToInventory(tx, session.characterId, a.itemId, a.quantity);
      });
    }
    const range = {
      minSeconds: spot.minCatchSeconds ?? settings.fishing.minSeconds,
      maxSeconds: spot.maxCatchSeconds ?? settings.fishing.maxSeconds,
    };
    const seconds = rollPhaseSeconds(range, speedBonusPct);
    return prisma.gatherSession.update({
      where: { id: session.id },
      data: {
        phase: "catching",
        phaseEndsAt: new Date(session.phaseEndsAt.getTime() + seconds * 1000),
        totalGathered: awarded.length > 0 ? session.totalGathered + 1 : session.totalGathered,
      },
    });
  }

  const mine = await prisma.mine.findUniqueOrThrow({ where: { id: session.mineId! }, include: { drops: true } });

  if (session.phase === "extracting") {
    const awarded = rollDrops(mine.drops, chanceBonusPct);
    if (awarded.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const a of awarded) await addLootToInventory(tx, session.characterId, a.itemId, a.quantity);
      });
    }
    // Search phase is deliberately NOT sped up by the pickaxe — only extraction is "work",
    // searching is travel-like wandering to the next node (confirmed design decision).
    const range = {
      minSeconds: mine.minSearchSeconds ?? settings.miningSearch.minSeconds,
      maxSeconds: mine.maxSearchSeconds ?? settings.miningSearch.maxSeconds,
    };
    const seconds = rollPhaseSeconds(range, 0);
    return prisma.gatherSession.update({
      where: { id: session.id },
      data: {
        phase: "searching",
        phaseEndsAt: new Date(session.phaseEndsAt.getTime() + seconds * 1000),
        totalGathered: awarded.length > 0 ? session.totalGathered + 1 : session.totalGathered,
      },
    });
  }

  // phase === "searching" -> back to extracting, speed-boosted by the pickaxe again.
  const range = {
    minSeconds: mine.minExtractSeconds ?? settings.miningExtract.minSeconds,
    maxSeconds: mine.maxExtractSeconds ?? settings.miningExtract.maxSeconds,
  };
  const seconds = rollPhaseSeconds(range, speedBonusPct);
  return prisma.gatherSession.update({
    where: { id: session.id },
    data: { phase: "extracting", phaseEndsAt: new Date(session.phaseEndsAt.getTime() + seconds * 1000) },
  });
}

/** Lazily resolves every phase that has elapsed since the session was last read (mirrors
 * lib/travelResolution.ts's lazy-resolve idiom, but loops since a session auto-repeats until
 * stopped). Bonuses are read once up front — a player can't re-equip mid-request anyway. Caps
 * catch-up at settings.maxCyclesPerResolve: if a session was left unattended long enough that
 * resolving hits the cap before catching up to "now", the session is auto-stopped (deleted) —
 * every phase's reward up to that point was already granted, nothing is lost, the player just
 * has to start a new session to keep going. */
async function resolveGatherSession(session: GatherSessionRow): Promise<GatherSessionRow | null> {
  if (session.phaseEndsAt.getTime() > Date.now()) return session;

  const settings = await getGatheringSettings();
  const [tool, baitBonusPct] = await Promise.all([
    getEquippedToolBonuses(session.characterId, session.kind === "fishing" ? "rod" : "pickaxe"),
    getBaitChanceBonusPct(session.characterId),
  ]);
  const speedBonusPct = tool?.speedBonusPct ?? 0;
  const chanceBonusPct = (tool?.chanceBonusPct ?? 0) + baitBonusPct;

  let current = session;
  let cycles = 0;
  while (current.phaseEndsAt.getTime() <= Date.now()) {
    if (cycles >= settings.maxCyclesPerResolve) {
      await prisma.gatherSession.delete({ where: { id: current.id } }).catch(() => {});
      await logAction({
        module: "gathering",
        level: "warn",
        action: "auto_stopped_cap",
        actorCharacterId: current.characterId,
        payload: { kind: current.kind, cyclesResolved: cycles },
      });
      return null;
    }
    current = await resolveOnePhase(current, settings, speedBonusPct, chanceBonusPct);
    cycles++;
  }
  return current;
}

export async function getActiveGathering(characterId: string, userId: string) {
  await assertCharacterOwnership(characterId, userId);
  const session = await prisma.gatherSession.findUnique({ where: { characterId } });
  if (!session) return null;
  const resolved = await resolveGatherSession(session);
  return resolved ? toDto(resolved) : null;
}

export async function stopGathering(characterId: string, userId: string, requestId?: string) {
  await assertCharacterOwnership(characterId, userId);
  const session = await prisma.gatherSession.findUnique({ where: { characterId } });
  if (!session) return;
  await prisma.gatherSession.delete({ where: { id: session.id } });
  await logAction({
    module: "gathering",
    action: "stop",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: { kind: session.kind, totalGathered: session.totalGathered },
  });
}
