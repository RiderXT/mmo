import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import { computeLevel, applyExpeditionReward } from "../../expeditions/service.js";
import { skillPointsForLevelRange } from "@mmo/shared";
import type { ExpeditionResult } from "@mmo/shared";

/** Expeditions currently withheld by the automatic plausibility check (checkRewardPlausibility
 * in expeditions/service.ts), awaiting an admin's "grant anyway"/"discard" decision via
 * resolveFlaggedExpedition. Includes the character's name and the precomputed (potential) result
 * so the admin can judge each one without leaving this list to dig through Logs. */
export async function listFlaggedExpeditions() {
  const flagged = await prisma.expedition.findMany({
    where: { status: "flagged" },
    include: { character: { select: { id: true, name: true } }, zone: { select: { id: true, name: true } } },
    orderBy: { startedAt: "desc" },
  });
  return flagged.map((e) => ({
    id: e.id,
    characterId: e.characterId,
    characterName: e.character.name,
    zoneId: e.zoneId,
    zoneName: e.zone.name,
    startedAt: e.startedAt.toISOString(),
    result: JSON.parse(e.result!) as ExpeditionResult,
  }));
}

export class AdminExpeditionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

interface GrantedRewardPayload {
  expeditionId: string;
  expGained: number;
  goldGained: number;
  monstersDefeated: number;
  loot: { itemId: string; quantity: number }[];
  leveledUp: boolean;
  newLevel: number;
  levelsGained: number;
}

/**
 * Reverses the exp/gold/level/loot granted by a single claimed (or left-early) expedition,
 * without touching anything else on the character or resetting the database — the corrective
 * tool for a balance exploit/bug that already paid out (see docs/architecture.md).
 *
 * The source of truth for "what was actually granted" is the GameLog entry written by
 * applyExpeditionReward at claim/leave-early time — NOT Expedition.result, which holds the full
 * precomputed (potential) outcome and, for a leave_early, is larger than what was actually paid
 * out. Loot removal is best-effort: it can only remove items the character still has (most
 * recently created stacks first, unequipped before equipped) and reports any shortfall instead
 * of ever going negative or touching unrelated items.
 */
export async function revertExpedition(expeditionId: string, adminUserId: string, requestId?: string) {
  const expedition = await prisma.expedition.findUnique({ where: { id: expeditionId } });
  if (!expedition) throw new AdminExpeditionError("Nie znaleziono ekspedycji", 404);
  if (expedition.status === "in_progress") {
    throw new AdminExpeditionError("Ekspedycja jeszcze trwa — nie można cofnąć", 400);
  }
  if (expedition.revertedAt) {
    throw new AdminExpeditionError("Ta ekspedycja została już cofnięta", 409);
  }

  const logs = await prisma.gameLog.findMany({
    where: { module: "expeditions", action: { in: ["claim", "leave_early"] }, actorCharacterId: expedition.characterId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const entry = logs.find((l) => {
    try {
      return (JSON.parse(l.payload) as { expeditionId?: string }).expeditionId === expeditionId;
    } catch {
      return false;
    }
  });
  if (!entry) {
    throw new AdminExpeditionError(
      "Nie znaleziono wpisu logu z nagrodami tej ekspedycji — brak danych do bezpiecznego cofnięcia",
      404,
    );
  }
  const payload = JSON.parse(entry.payload) as GrantedRewardPayload;

  const shortfalls: { itemId: string; requested: number; removed: number }[] = [];

  const summary = await prisma.$transaction(async (tx) => {
    const character = await tx.character.findUniqueOrThrow({ where: { id: expedition.characterId } });

    const newExp = Math.max(0, character.exp - payload.expGained);
    const newLevel = computeLevel(newExp);
    const levelsLost = Math.max(0, character.level - newLevel);
    const newGold = Math.max(0, character.gold - payload.goldGained);
    const newUnspentStatPoints = Math.max(0, character.unspentStatPoints - levelsLost * 4);
    const newUnspentSkillPoints = Math.max(
      0,
      character.unspentSkillPoints - skillPointsForLevelRange(newLevel, character.level),
    );

    for (const loot of payload.loot) {
      let remaining = loot.quantity;
      const rows = await tx.inventoryItem.findMany({
        where: { characterId: expedition.characterId, itemId: loot.itemId },
        orderBy: { createdAt: "desc" },
      });
      // Prefer removing unequipped stacks before anything the player has equipped.
      rows.sort((a, b) => (a.equippedSlot ? 1 : 0) - (b.equippedSlot ? 1 : 0));

      for (const row of rows) {
        if (remaining <= 0) break;
        const take = Math.min(row.quantity, remaining);
        remaining -= take;
        if (take >= row.quantity) {
          await tx.inventoryItem.delete({ where: { id: row.id } });
        } else {
          await tx.inventoryItem.update({ where: { id: row.id }, data: { quantity: row.quantity - take } });
        }
      }
      if (remaining > 0) {
        shortfalls.push({ itemId: loot.itemId, requested: loot.quantity, removed: loot.quantity - remaining });
      }
    }

    await tx.character.update({
      where: { id: expedition.characterId },
      data: {
        exp: newExp,
        level: newLevel,
        gold: newGold,
        unspentStatPoints: newUnspentStatPoints,
        unspentSkillPoints: newUnspentSkillPoints,
      },
    });

    await tx.expedition.update({ where: { id: expeditionId }, data: { revertedAt: new Date() } });

    return { levelBefore: character.level, levelAfter: newLevel, expBefore: character.exp, expAfter: newExp };
  });

  await logAction({
    module: "admin:expeditions",
    action: "revert",
    actorUserId: adminUserId,
    actorCharacterId: expedition.characterId,
    requestId,
    payload: { expeditionId, reverted: payload, shortfalls, ...summary },
  });

  return { characterId: expedition.characterId, reverted: payload, shortfalls, ...summary };
}

/**
 * Resolves an expedition that the automatic plausibility check (expeditions/service.ts,
 * checkRewardPlausibility) blocked and flagged instead of paying out. `grant: true` overrides
 * the block and pays the original precomputed result anyway (admin judged it legitimate);
 * `grant: false` discards the reward and just frees the character's expedition slot.
 */
export async function resolveFlaggedExpedition(
  expeditionId: string,
  grant: boolean,
  adminUserId: string,
  requestId?: string,
) {
  const expedition = await prisma.expedition.findUnique({ where: { id: expeditionId }, include: { character: true } });
  if (!expedition) throw new AdminExpeditionError("Nie znaleziono ekspedycji", 404);
  if (expedition.status !== "flagged") {
    throw new AdminExpeditionError("Ta ekspedycja nie jest wstrzymana do sprawdzenia", 400);
  }

  if (grant) {
    const result = JSON.parse(expedition.result!) as ExpeditionResult;
    await prisma.expedition.update({ where: { id: expeditionId }, data: { status: "claimed" } });
    const applied = await applyExpeditionReward(expeditionId, expedition.character, result, adminUserId, "claim", requestId);
    await logAction({
      module: "admin:expeditions",
      action: "resolve_flagged",
      actorUserId: adminUserId,
      actorCharacterId: expedition.characterId,
      requestId,
      payload: { expeditionId, decision: "grant" },
    });
    return { granted: true, ...applied };
  }

  await prisma.$transaction([
    prisma.expedition.update({ where: { id: expeditionId }, data: { status: "claimed" } }),
    prisma.character.update({ where: { id: expedition.characterId }, data: { activeExpeditionId: null } }),
  ]);
  await logAction({
    module: "admin:expeditions",
    action: "resolve_flagged",
    actorUserId: adminUserId,
    actorCharacterId: expedition.characterId,
    requestId,
    payload: { expeditionId, decision: "discard" },
  });
  return { granted: false };
}
