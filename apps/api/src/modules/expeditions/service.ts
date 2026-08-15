import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { getExpeditionDurationMinutes } from "../settings/service.js";
import { addLootToInventory } from "../inventory/service.js";
import {
  computeDerivedStats,
  simulateExpedition,
  type CharacterCoreStats,
  type PassiveSkillBonus,
  type ActiveSkillDef,
  type PotionSlot,
  type SimZone,
  type DerivedStats,
} from "./combat.js";
import type { ExpeditionResult, StatBlock, CoreStatKey, StatKey, CombatEvent } from "@mmo/shared";

export class ExpeditionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

/** Exp needed cumulatively is level*100 to reach the next level — a flat placeholder curve, easy to rebalance later without touching the claim flow. */
export function computeLevel(totalExp: number): number {
  return Math.max(1, Math.floor(totalExp / 100) + 1);
}

const ACTIVE_SKILL_MANA_COST = (level: number) => 10 + 5 * level;

async function assertCharacterOwnership(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new ExpeditionError("Nie znaleziono postaci", 404);
  }
  return character;
}

/** Gathers the character's full combat build (base stats, equipped item stats, passive/active skills, active-slot potions) — shared by the expedition simulation and the standalone combat-stats readout. */
async function gatherCombatBuild(characterId: string) {
  const [character, equipped, characterSkills, activePotionItems] = await Promise.all([
    prisma.character.findUniqueOrThrow({ where: { id: characterId } }),
    prisma.inventoryItem.findMany({
      where: { characterId, equippedSlot: { not: null } },
      include: { item: true },
    }),
    prisma.characterSkill.findMany({ where: { characterId }, include: { classSkill: true } }),
    prisma.inventoryItem.findMany({
      where: { characterId, activeSlotIndex: { not: null } },
      include: { item: true },
    }),
  ]);

  const core: CharacterCoreStats = {
    strength: character.strength,
    vitality: character.vitality,
    dexterity: character.dexterity,
    intelligence: character.intelligence,
  };

  const equipmentStats: StatBlock[] = equipped.map((inv) => ({
    ...(JSON.parse(inv.item.baseStats) as StatBlock),
    ...(JSON.parse(inv.rolledStats) as StatBlock),
  }));

  const passiveSkills: PassiveSkillBonus[] = characterSkills
    .filter((cs) => cs.classSkill.kind === "passive" && cs.level > 0 && cs.classSkill.targetStat)
    .map((cs) => ({
      scalingStat: cs.classSkill.scalingStat as CoreStatKey,
      scalingFactor: cs.classSkill.scalingFactor,
      targetStat: cs.classSkill.targetStat as StatKey,
      level: cs.level,
    }));

  const activeSkills: ActiveSkillDef[] = characterSkills
    .filter((cs) => cs.classSkill.kind === "active" && cs.level > 0 && cs.classSkill.effectType && cs.classSkill.cooldownSeconds)
    .map((cs) => ({
      id: cs.classSkillId,
      name: cs.classSkill.name,
      power: cs.classSkill.scalingFactor * core[cs.classSkill.scalingStat as CoreStatKey] * cs.level,
      manaCost: ACTIVE_SKILL_MANA_COST(cs.level),
      effectType: cs.classSkill.effectType as "damage" | "heal",
      cooldownSeconds: cs.classSkill.cooldownSeconds!,
    }));

  const potions: PotionSlot[] = activePotionItems
    .filter((inv) => inv.item.type === "consumable" && inv.item.potionTrigger)
    .map((inv) => ({
      inventoryItemId: inv.id,
      itemName: inv.item.name,
      quantity: inv.quantity,
      trigger: inv.item.potionTrigger as PotionSlot["trigger"],
      thresholdPct: inv.item.potionThresholdPct,
      intervalSeconds: inv.item.potionIntervalSec,
      effect: inv.item.potionEffect as PotionSlot["effect"],
      magnitudePct: inv.item.potionMagnitudePct ?? 0.3,
      durationSeconds: inv.item.potionDurationSec,
    }));

  return { character, core, equipmentStats, passiveSkills, activeSkills, potions };
}

/** Computes a character's current derived combat stats (HP/MP/attack/defense/...) from their build — independent of any zone, used for the character sheet readout outside of an expedition. */
export async function getCharacterCombatStats(characterId: string, userId: string): Promise<DerivedStats> {
  await assertCharacterOwnership(characterId, userId);
  const { core, equipmentStats, passiveSkills } = await gatherCombatBuild(characterId);
  return computeDerivedStats(core, equipmentStats, passiveSkills);
}

/** Gathers the character's full combat build and runs the deterministic expedition simulation. */
async function buildAndSimulate(characterId: string, zoneId: string, durationMinutes: number) {
  const [{ character, core, equipmentStats, passiveSkills, activeSkills, potions }, zone] = await Promise.all([
    gatherCombatBuild(characterId),
    prisma.zone.findUnique({
      where: { id: zoneId },
      include: { monsters: { include: { monster: { include: { drops: true } } } }, drops: true },
    }),
  ]);

  if (!zone) throw new ExpeditionError("Nie znaleziono krainy", 404);

  const stats = computeDerivedStats(core, equipmentStats, passiveSkills);

  const simZone: SimZone = {
    monsters: zone.monsters.map((zm) => {
      const monsterStats = JSON.parse(zm.monster.stats) as StatBlock;
      return {
        monsterId: zm.monster.id,
        name: zm.monster.name,
        hp: zm.monster.hp,
        attack: monsterStats.attack ?? 0,
        defense: monsterStats.defense ?? 0,
        expReward: zm.monster.expReward,
        goldReward: zm.monster.goldReward,
        spawnWeight: zm.spawnWeight,
        drops: zm.monster.drops.map((d) => ({
          itemId: d.itemId,
          dropChance: d.dropChance,
          minQty: d.minQty,
          maxQty: d.maxQty,
        })),
      };
    }),
    drops: zone.drops.map((d) => ({ itemId: d.itemId, dropChance: d.dropChance })),
  };

  if (simZone.monsters.length === 0) {
    throw new ExpeditionError("Ta kraina nie ma jeszcze przypisanych potworów", 400);
  }
  if (character.level < zone.minLevel || character.level > zone.maxLevel) {
    throw new ExpeditionError(
      `Ta kraina jest dla poziomów ${zone.minLevel}-${zone.maxLevel}, a postać ma poziom ${character.level}`,
      400,
    );
  }

  const outcome = simulateExpedition(simZone, stats, activeSkills, potions, durationMinutes);
  return { character, zone, stats, outcome };
}

export async function startExpedition(
  input: { characterId: string; zoneId: string },
  userId: string,
  requestId?: string,
) {
  const owner = await assertCharacterOwnership(input.characterId, userId);
  if (owner.activeExpeditionId) {
    throw new ExpeditionError("Postać jest już na ekspedycji", 409);
  }

  const durationMinutes = await getExpeditionDurationMinutes();
  const { character, zone, stats, outcome } = await buildAndSimulate(
    input.characterId,
    input.zoneId,
    durationMinutes,
  );

  // Travel time (village <-> zone) is computed once here, same as combat — reduced by the
  // character's current movementSpeedPct, identical for both legs of the round trip.
  const travelSeconds = Math.max(1, Math.round(zone.travelTimeSeconds * (1 - stats.movementSpeedPct)));
  const startedAt = new Date();
  const arrivedAt = new Date(startedAt.getTime() + travelSeconds * 1000);
  const fightEndsAt = new Date(arrivedAt.getTime() + durationMinutes * 60_000);
  const endsAt = new Date(fightEndsAt.getTime() + travelSeconds * 1000);

  const expedition = await prisma.$transaction(async (tx) => {
    const created = await tx.expedition.create({
      data: {
        characterId: character.id,
        zoneId: zone.id,
        status: "in_progress",
        startedAt,
        arrivedAt,
        fightEndsAt,
        endsAt,
        result: JSON.stringify(outcome.result),
        eventLog: JSON.stringify(outcome.events),
      },
    });
    await tx.character.update({
      where: { id: character.id },
      data: { currentZoneId: zone.id, activeExpeditionId: created.id },
    });

    for (const [inventoryItemId, qtyConsumed] of outcome.potionsConsumed) {
      const stack = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
      if (!stack) continue;
      if (stack.quantity <= qtyConsumed) {
        await tx.inventoryItem.delete({ where: { id: inventoryItemId } });
      } else {
        await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: { quantity: stack.quantity - qtyConsumed },
        });
      }
    }

    return created;
  });

  await logAction({
    module: "expeditions",
    action: "start",
    actorUserId: userId,
    actorCharacterId: character.id,
    requestId,
    payload: {
      expeditionId: expedition.id,
      zoneId: zone.id,
      durationMinutes,
      potionsConsumed: Object.fromEntries(outcome.potionsConsumed),
    },
  });

  return {
    id: expedition.id,
    characterId: expedition.characterId,
    zoneId: expedition.zoneId,
    status: expedition.status,
    startedAt: expedition.startedAt.toISOString(),
    arrivedAt: expedition.arrivedAt.toISOString(),
    fightEndsAt: expedition.fightEndsAt.toISOString(),
    endsAt: expedition.endsAt.toISOString(),
    result: null,
    events: outcome.events,
  };
}

export async function getActiveExpedition(characterId: string, userId: string) {
  await assertCharacterOwnership(characterId, userId);

  const expedition = await prisma.expedition.findFirst({
    where: { characterId, status: "in_progress" },
  });
  if (!expedition) return null;

  return {
    id: expedition.id,
    characterId: expedition.characterId,
    zoneId: expedition.zoneId,
    status: expedition.status,
    startedAt: expedition.startedAt.toISOString(),
    arrivedAt: expedition.arrivedAt.toISOString(),
    fightEndsAt: expedition.fightEndsAt.toISOString(),
    endsAt: expedition.endsAt.toISOString(),
    result: null,
    events: expedition.eventLog ? (JSON.parse(expedition.eventLog) as CombatEvent[]) : [],
  };
}

/** Recomputes an ExpeditionResult from a (possibly partial) slice of the pre-computed event
 * timeline — used to grant only the rewards from encounters that had actually happened by the
 * moment the player chose to leave early. */
function deriveResultFromEvents(events: CombatEvent[]): ExpeditionResult {
  let expGained = 0;
  let goldGained = 0;
  let monstersDefeated = 0;
  const lootMap = new Map<string, number>();

  for (const event of events) {
    if (event.type === "encounter_result") {
      if (event.won) monstersDefeated += 1;
      expGained += event.expGained;
      goldGained += event.goldGained;
    } else if (event.type === "loot") {
      lootMap.set(event.itemId, (lootMap.get(event.itemId) ?? 0) + event.quantity);
    }
  }

  return {
    expGained,
    goldGained,
    monstersDefeated,
    loot: Array.from(lootMap.entries()).map(([itemId, quantity]) => ({ itemId, quantity })),
  };
}

async function applyExpeditionReward(
  expeditionId: string,
  character: { id: string; exp: number; level: number; gold: number; unspentStatPoints: number; unspentSkillPoints: number },
  result: ExpeditionResult,
  userId: string,
  action: "claim" | "leave_early",
  requestId?: string,
) {
  const newExp = character.exp + result.expGained;
  const newLevel = computeLevel(newExp);
  const leveledUp = newLevel > character.level;
  const levelsGained = Math.max(0, newLevel - character.level);

  await prisma.$transaction(async (tx) => {
    for (const loot of result.loot) {
      await addLootToInventory(tx, character.id, loot.itemId, loot.quantity);
    }
    await tx.character.update({
      where: { id: character.id },
      data: {
        exp: newExp,
        level: newLevel,
        gold: character.gold + result.goldGained,
        unspentStatPoints: character.unspentStatPoints + levelsGained * 4,
        unspentSkillPoints: character.unspentSkillPoints + levelsGained * 1,
        currentZoneId: null,
        activeExpeditionId: null,
      },
    });
  });

  await logAction({
    module: "expeditions",
    action,
    actorUserId: userId,
    actorCharacterId: character.id,
    requestId,
    payload: { expeditionId, ...result, leveledUp, newLevel, levelsGained },
  });

  return { result, leveledUp, newLevel };
}

export async function claimExpedition(expeditionId: string, userId: string, requestId?: string) {
  const expedition = await prisma.expedition.findUnique({
    where: { id: expeditionId },
    include: { character: true },
  });
  if (!expedition || expedition.character.userId !== userId) {
    throw new ExpeditionError("Nie znaleziono ekspedycji", 404);
  }
  if (expedition.status !== "in_progress") {
    throw new ExpeditionError("Nagrody z tej ekspedycji zostały już odebrane", 409);
  }
  if (new Date() < expedition.endsAt) {
    throw new ExpeditionError("Ekspedycja jeszcze trwa", 409);
  }

  // Idempotency/anti-double-claim guard: only one caller can win this status flip.
  const claimed = await prisma.expedition.updateMany({
    where: { id: expeditionId, status: "in_progress" },
    data: { status: "claimed" },
  });
  if (claimed.count !== 1) {
    throw new ExpeditionError("Nagrody z tej ekspedycji zostały już odebrane", 409);
  }

  const result = JSON.parse(expedition.result!) as ExpeditionResult;
  return applyExpeditionReward(expeditionId, expedition.character, result, userId, "claim", requestId);
}

/** Ends an expedition before its scheduled endsAt, granting rewards only for the encounters
 * that had already happened by now (derived from the same pre-computed event timeline the
 * player sees in the combat log — nothing is recomputed, just summed over a shorter slice).
 * Elapsed time is measured from arrivedAt (combat start), not startedAt (village departure) —
 * leaving mid-travel-there naturally yields zero events/reward, leaving mid-travel-back
 * naturally yields the full combat result, and either way the character is home instantly
 * instead of waiting out the remaining travel. */
export async function leaveExpedition(expeditionId: string, userId: string, requestId?: string) {
  const expedition = await prisma.expedition.findUnique({
    where: { id: expeditionId },
    include: { character: true },
  });
  if (!expedition || expedition.character.userId !== userId) {
    throw new ExpeditionError("Nie znaleziono ekspedycji", 404);
  }
  if (expedition.status !== "in_progress") {
    throw new ExpeditionError("Ta ekspedycja jest już zakończona", 409);
  }

  // Idempotency guard, same pattern as claim — also protects against a race with claimExpedition.
  const claimed = await prisma.expedition.updateMany({
    where: { id: expeditionId, status: "in_progress" },
    data: { status: "claimed" },
  });
  if (claimed.count !== 1) {
    throw new ExpeditionError("Ta ekspedycja jest już zakończona", 409);
  }

  const elapsedSeconds = Math.floor((Date.now() - expedition.arrivedAt.getTime()) / 1000);
  const allEvents = expedition.eventLog ? (JSON.parse(expedition.eventLog) as CombatEvent[]) : [];
  const result = deriveResultFromEvents(allEvents.filter((e) => e.t <= elapsedSeconds));

  return applyExpeditionReward(expeditionId, expedition.character, result, userId, "leave_early", requestId);
}
