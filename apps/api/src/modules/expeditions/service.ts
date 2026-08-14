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

/** Gathers the character's full combat build (base stats, equipped item stats, passive/active skills, active-slot potions) and runs the deterministic simulation. */
async function buildAndSimulate(characterId: string, zoneId: string, durationMinutes: number) {
  const [character, equipped, characterSkills, activePotionItems, zone] = await Promise.all([
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
    prisma.zone.findUnique({
      where: { id: zoneId },
      include: { monsters: { include: { monster: { include: { drops: true } } } }, drops: true },
    }),
  ]);

  if (!zone) throw new ExpeditionError("Nie znaleziono krainy", 404);

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
  return { character, zone, outcome };
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
  const { character, zone, outcome } = await buildAndSimulate(input.characterId, input.zoneId, durationMinutes);

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + durationMinutes * 60_000);

  const expedition = await prisma.$transaction(async (tx) => {
    const created = await tx.expedition.create({
      data: {
        characterId: character.id,
        zoneId: zone.id,
        status: "in_progress",
        startedAt,
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
    endsAt: expedition.endsAt.toISOString(),
    result: null,
    events: expedition.eventLog ? (JSON.parse(expedition.eventLog) as CombatEvent[]) : [],
  };
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
  const character = expedition.character;
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
    action: "claim",
    actorUserId: userId,
    actorCharacterId: character.id,
    requestId,
    payload: { expeditionId, ...result, leveledUp, newLevel, levelsGained },
  });

  return { result, leveledUp, newLevel };
}
