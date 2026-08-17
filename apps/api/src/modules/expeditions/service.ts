import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { resolveTravelArrival } from "../../lib/travelResolution.js";
import { hasActiveGatherSession } from "../../lib/gatherGuard.js";
import { getActiveEventMultipliers } from "../../lib/gameEvents.js";
import { getExpeditionDurationMinutes } from "../settings/service.js";
import { addLootToInventory } from "../inventory/service.js";
import {
  computeDerivedStats,
  computeDerivedStatsBreakdown,
  interpolateUpgrade,
  simulateExpedition,
  type CharacterCoreStats,
  type PassiveSkillBonus,
  type ActiveSkillDef,
  type PotionSlot,
  type SimZone,
  type DerivedStats,
  type DerivedStatsBreakdown,
} from "./combat.js";
import { computeLevel, expRewardForLevel } from "@mmo/shared";
import type { ExpeditionResult, StatBlock, CoreStatKey, StatKey, CombatEvent, BattleTacticsInput } from "@mmo/shared";

export class ExpeditionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export { computeLevel };

const ACTIVE_SKILL_MANA_COST = (level: number) => 10 + 5 * level;

export async function assertCharacterOwnership(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new ExpeditionError("Nie znaleziono postaci", 404);
  }
  return character;
}

/** Gathers the character's full combat build (base stats, equipped item stats, passive/active skills, active-slot potions) — shared by the expedition simulation, the standalone combat-stats readout, and the public profile page (modules/profile). */
export async function gatherCombatBuild(characterId: string) {
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
    ...interpolateUpgrade(
      JSON.parse(inv.item.baseStats) as StatBlock,
      JSON.parse(inv.item.maxUpgradeStats) as StatBlock,
      inv.upgradeLevel,
    ),
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

/** Same as getCharacterCombatStats but keeps base/equipment/passive contributions separate per
 * stat — powers the "Postać" tab's stat breakdown table (see docs/architecture.md "Etap 20"). */
export async function getCharacterCombatStatsBreakdown(
  characterId: string,
  userId: string,
): Promise<DerivedStatsBreakdown> {
  await assertCharacterOwnership(characterId, userId);
  const { core, equipmentStats, passiveSkills } = await gatherCombatBuild(characterId);
  return computeDerivedStatsBreakdown(core, equipmentStats, passiveSkills);
}

/** Movement-speed-only readout of a character's build, reused by modules/travel/service.ts to
 * price a journey — avoids duplicating the equipment/passive-skill gathering logic there. */
export async function getCharacterMovementSpeedPct(characterId: string): Promise<number> {
  const { core, equipmentStats, passiveSkills } = await gatherCombatBuild(characterId);
  return computeDerivedStats(core, equipmentStats, passiveSkills).movementSpeedPct;
}

/** Gathers the character's full combat build and runs the deterministic expedition simulation.
 * selectedMonsterIds narrows the zone's monster pool to the player's chosen subset — empty
 * array (the default) preserves the pre-Etap-9 behavior of drawing from the whole zone. */
async function buildAndSimulate(
  characterId: string,
  zoneId: string,
  durationMinutes: number,
  selectedMonsterIds: string[] = [],
  tactics?: BattleTacticsInput,
) {
  const [{ character, core, equipmentStats, passiveSkills, activeSkills: allActiveSkills, potions: basePotions }, zone] =
    await Promise.all([
      gatherCombatBuild(characterId),
      prisma.zone.findUnique({
        where: { id: zoneId },
        include: { monsters: { include: { monster: { include: { drops: true } } } }, drops: true },
      }),
    ]);

  if (!zone) throw new ExpeditionError("Nie znaleziono krainy", 404);

  // Etap 24: per-fight tactics layer on top of the admin's base potion config — the player can
  // only raise the hp_below threshold and/or sit out specific active skills for this one fight,
  // nothing else about the underlying config changes. Applied locally here so simulateExpedition
  // itself stays unaware of "tactics" and just receives already-filtered arrays.
  const activeSkills = tactics?.disabledSkillIds?.length
    ? allActiveSkills.filter((s) => !tactics.disabledSkillIds.includes(s.id))
    : allActiveSkills;
  const potions =
    tactics?.hpThresholdOverridePct != null
      ? basePotions.map((p) =>
          p.trigger === "hp_below" ? { ...p, thresholdPct: tactics.hpThresholdOverridePct! } : p,
        )
      : basePotions;

  const stats = computeDerivedStats(core, equipmentStats, passiveSkills);

  const simZone: SimZone = {
    monsters: zone.monsters
      .map((zm) => {
        const monsterStats = JSON.parse(zm.monster.stats) as StatBlock;
        return {
          monsterId: zm.monster.id,
          name: zm.monster.name,
          level: zm.monster.level,
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
      })
      .filter((m) => selectedMonsterIds.length === 0 || selectedMonsterIds.includes(m.monsterId)),
    drops: zone.drops.map((d) => ({ itemId: d.itemId, dropChance: d.dropChance })),
  };

  if (simZone.monsters.length === 0) {
    throw new ExpeditionError(
      selectedMonsterIds.length === 0
        ? "Ta kraina nie ma jeszcze przypisanych potworów"
        : "Wybierz co najmniej jednego potwora z tej krainy",
      400,
    );
  }
  const maxLevelOk = zone.allowRevisitAboveLevel || character.level <= zone.maxLevel;
  if (character.level < zone.minLevel || !maxLevelOk) {
    throw new ExpeditionError(
      `Ta kraina jest dla poziomów ${zone.minLevel}-${zone.maxLevel}, a postać ma poziom ${character.level}`,
      400,
    );
  }

  const { expMultiplier, goldMultiplier, bonusDrop } = await getActiveEventMultipliers();
  const outcome = simulateExpedition(
    simZone,
    stats,
    activeSkills,
    potions,
    durationMinutes,
    expMultiplier,
    goldMultiplier,
    bonusDrop,
  );
  return { character, zone, stats, outcome, expMultiplier, goldMultiplier };
}

export async function startExpedition(
  input: { characterId: string; zoneId: string; selectedMonsterIds: string[]; tactics?: BattleTacticsInput },
  userId: string,
  requestId?: string,
) {
  await resolveTravelArrival(input.characterId);
  await clearStaleActiveExpeditionPointer(input.characterId);
  const owner = await assertCharacterOwnership(input.characterId, userId);
  if (owner.activeExpeditionId) {
    throw new ExpeditionError("Postać jest już na ekspedycji", 409);
  }
  if (owner.travelArrivesAt) {
    throw new ExpeditionError("Postać jest w drodze — poczekaj na przybycie", 409);
  }
  if (await hasActiveGatherSession(input.characterId)) {
    throw new ExpeditionError("Postać zbiera surowce — najpierw zatrzymaj zbieractwo", 409);
  }
  if (owner.currentZoneId !== input.zoneId) {
    throw new ExpeditionError("Postać musi najpierw dotrzeć do tej krainy", 409);
  }

  const durationMinutes = await getExpeditionDurationMinutes();
  const { character, zone, outcome, expMultiplier, goldMultiplier } = await buildAndSimulate(
    input.characterId,
    input.zoneId,
    durationMinutes,
    input.selectedMonsterIds,
    input.tactics,
  );

  // Etap 9: travel is a fully separate step (modules/travel) that already happened before the
  // player could even see this zone's "walcz" action — the expedition itself no longer spans
  // any travel, so arrivedAt/fightEndsAt collapse onto startedAt/endsAt (columns kept, not
  // removed, so expeditions already in flight at deploy time keep working unmodified).
  // Etap 10: combat now ends at death (or the duration-minutes safety cap), not at a fixed
  // duration — endsAt reflects the actual last simulated event, so "Odbierz nagrody" appears
  // exactly when the fight is over instead of only after the full safety-cap duration elapses.
  const startedAt = new Date();
  const actualEndSeconds = outcome.events.at(-1)?.t ?? 0;
  const endsAt = new Date(startedAt.getTime() + actualEndSeconds * 1000);

  const expedition = await prisma.$transaction(async (tx) => {
    const created = await tx.expedition.create({
      data: {
        characterId: character.id,
        zoneId: zone.id,
        status: "in_progress",
        startedAt,
        arrivedAt: startedAt,
        fightEndsAt: endsAt,
        endsAt,
        result: JSON.stringify(outcome.result),
        eventLog: JSON.stringify(outcome.events),
        selectedMonsterIds: JSON.stringify(input.selectedMonsterIds),
        appliedExpMultiplier: expMultiplier,
        appliedGoldMultiplier: goldMultiplier,
      },
    });

    // Atomic guard against a double-start race (e.g. a double-click on "rozpocznij walkę"):
    // only succeeds if the character is still exactly where/how we checked above.
    const guarded = await tx.character.updateMany({
      where: { id: character.id, activeExpeditionId: null, currentZoneId: zone.id, travelArrivesAt: null },
      data: { activeExpeditionId: created.id },
    });
    if (guarded.count !== 1) {
      throw new ExpeditionError("Postać jest już na ekspedycji albo nie stoi już w tej krainie", 409);
    }

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
      selectedMonsterIds: input.selectedMonsterIds,
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

/** Character.activeExpeditionId should always point at an "in_progress" expedition — a flagged
 * expedition frees the slot immediately (see flagSuspiciousExpedition) rather than holding it
 * until an admin reacts, so a reward under anti-cheat review never stops the character from
 * playing on. This is a defensive backstop for any other, unforeseen way the pointer could go
 * stale (already-claimed/discarded expedition it wasn't cleared for) — without it, the character
 * would wrongly block travel/new expeditions forever ("Postać walczy") while every UI that reads
 * the expedition itself (which correctly stops matching) shows the character as idle. Self-heals
 * by clearing the pointer whenever it doesn't resolve to a still-open expedition. */
export async function clearStaleActiveExpeditionPointer(characterId: string): Promise<void> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character?.activeExpeditionId) return;

  const expedition = await prisma.expedition.findUnique({ where: { id: character.activeExpeditionId } });
  if (expedition && expedition.status === "in_progress") return;

  await prisma.character.updateMany({
    where: { id: characterId, activeExpeditionId: character.activeExpeditionId },
    data: { activeExpeditionId: null },
  });
}

/** Flagged expeditions awaiting admin review for a character — surfaced as a non-blocking notice
 * (the character can otherwise play normally, see flagSuspiciousExpedition). */
export async function listFlaggedExpeditionsForCharacter(characterId: string) {
  return prisma.expedition.findMany({ where: { characterId, status: "flagged" } });
}

export async function getActiveExpedition(characterId: string, userId: string) {
  await assertCharacterOwnership(characterId, userId);
  await clearStaleActiveExpeditionPointer(characterId);

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
      // Etap 10: an encounter_result is only ever emitted for a won encounter now — a loss ends
      // the whole expedition via character_died instead of a per-encounter loss marker.
      monstersDefeated += 1;
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

// Hard safety net, independent of any admin setting (same philosophy as combat.ts's MAX_ROUNDS).
// Originally compared "levels gained in one expedition" against a flat cap, which worked under
// the old flat exp curve (every level cost the same 100 exp) but stopped meaning anything once
// computeLevel became a steep cubic curve: near level 1 a normal expedition can legitimately
// jump several levels from very little exp, while near level 90 even a wildly inflated reward
// might not clear a single level. The check now looks at exp PER MONSTER KILLED instead, which
// stays meaningful at any point on the curve — it's flagged only when the average kill paid out
// far more than the toughest monster a character at this level could plausibly have fought.
//
// LEVEL_HEADROOM covers legitimately fighting at the top of a zone tier (tiers are 10 levels
// wide, see seed-zones.ts) while sitting near the bottom of it; SAFETY_MARGIN adds slack on top
// for general variance. appliedExpMultiplier scales the ceiling too, so a legitimate x3 exp
// event doesn't get flagged for paying out ~3x per kill.
const LEVEL_HEADROOM = 15;
const SAFETY_MARGIN = 1.5;

function checkRewardPlausibility(
  character: { exp: number; level: number },
  result: ExpeditionResult,
  appliedExpMultiplier: number,
): { ok: true } | { ok: false; code: string } {
  if (result.monstersDefeated <= 0) return { ok: true };
  const avgExpPerMonster = result.expGained / result.monstersDefeated;
  const maxPlausibleExpPerMonster =
    expRewardForLevel(character.level + LEVEL_HEADROOM) * Math.max(1, appliedExpMultiplier) * SAFETY_MARGIN;
  if (avgExpPerMonster > maxPlausibleExpPerMonster) {
    return { ok: false, code: "SUSPICIOUS_LEVEL_JUMP" };
  }
  return { ok: true };
}

/** Flips the expedition to "flagged" (instead of "claimed") so neither claim nor leave can be
 * retried, and records why — an admin resolves it via modules/admin/expeditions (grant anyway or
 * discard). Uses the same atomic updateMany guard as the claim/leave idempotency check.
 *
 * Immediately frees the character's expedition slot too — a flagged reward is withheld, but the
 * character isn't: they keep playing normally (travel, new expeditions) while the flagged
 * expedition sits queued for admin review in the background, resolved whenever an admin gets to
 * it (see docs/architecture.md). */
async function flagSuspiciousExpedition(
  expeditionId: string,
  characterId: string,
  result: ExpeditionResult,
  userId: string,
  code: string,
  requestId?: string,
) {
  const flagged = await prisma.expedition.updateMany({
    where: { id: expeditionId, status: "in_progress" },
    data: { status: "flagged" },
  });
  if (flagged.count !== 1) return; // already resolved/flagged by a concurrent request

  await prisma.character.updateMany({
    where: { id: characterId, activeExpeditionId: expeditionId },
    data: { activeExpeditionId: null },
  });

  await logAction({
    module: "expeditions",
    level: "error",
    action: "reward_blocked",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: { expeditionId, code, ...result },
  });
}

export async function applyExpeditionReward(
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
        monstersKilled: { increment: result.monstersDefeated },
        // currentZoneId intentionally left untouched (Etap 9) — the character stays in the
        // zone after combat ends/is left early, until they explicitly travel elsewhere.
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
  if (expedition.status === "flagged") {
    throw new ExpeditionError(
      "Nagroda z tej ekspedycji została wstrzymana do sprawdzenia przez administrację (kod: SUSPICIOUS_REWARD).",
      409,
    );
  }
  if (expedition.status !== "in_progress") {
    throw new ExpeditionError("Nagrody z tej ekspedycji zostały już odebrane", 409);
  }
  if (new Date() < expedition.endsAt) {
    throw new ExpeditionError("Ekspedycja jeszcze trwa", 409);
  }

  const result = JSON.parse(expedition.result!) as ExpeditionResult;
  const plausibility = checkRewardPlausibility(expedition.character, result, expedition.appliedExpMultiplier);
  if (!plausibility.ok) {
    await flagSuspiciousExpedition(expeditionId, expedition.characterId, result, userId, plausibility.code, requestId);
    throw new ExpeditionError(
      `Nagroda z tej ekspedycji wygląda na błąd balansu i została wstrzymana do sprawdzenia przez administrację (kod: ${plausibility.code}).`,
      422,
    );
  }

  // Idempotency/anti-double-claim guard: only one caller can win this status flip.
  const claimed = await prisma.expedition.updateMany({
    where: { id: expeditionId, status: "in_progress" },
    data: { status: "claimed" },
  });
  if (claimed.count !== 1) {
    throw new ExpeditionError("Nagrody z tej ekspedycji zostały już odebrane", 409);
  }

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
  if (expedition.status === "flagged") {
    throw new ExpeditionError(
      "Nagroda z tej ekspedycji została wstrzymana do sprawdzenia przez administrację (kod: SUSPICIOUS_REWARD).",
      409,
    );
  }
  if (expedition.status !== "in_progress") {
    throw new ExpeditionError("Ta ekspedycja jest już zakończona", 409);
  }

  const elapsedSeconds = Math.floor((Date.now() - expedition.arrivedAt.getTime()) / 1000);
  const allEvents = expedition.eventLog ? (JSON.parse(expedition.eventLog) as CombatEvent[]) : [];
  const result = deriveResultFromEvents(allEvents.filter((e) => e.t <= elapsedSeconds));

  const plausibility = checkRewardPlausibility(expedition.character, result, expedition.appliedExpMultiplier);
  if (!plausibility.ok) {
    await flagSuspiciousExpedition(expeditionId, expedition.characterId, result, userId, plausibility.code, requestId);
    throw new ExpeditionError(
      `Nagroda z tej ekspedycji wygląda na błąd balansu i została wstrzymana do sprawdzenia przez administrację (kod: ${plausibility.code}).`,
      422,
    );
  }

  // Idempotency guard, same pattern as claim — also protects against a race with claimExpedition.
  const claimed = await prisma.expedition.updateMany({
    where: { id: expeditionId, status: "in_progress" },
    data: { status: "claimed" },
  });
  if (claimed.count !== 1) {
    throw new ExpeditionError("Ta ekspedycja jest już zakończona", 409);
  }

  return applyExpeditionReward(expeditionId, expedition.character, result, userId, "leave_early", requestId);
}
