import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { resolveTravelArrival } from "../../lib/travelResolution.js";
import { hasActiveGatherSession } from "../../lib/gatherGuard.js";
import { getActiveEventMultipliers } from "../../lib/gameEvents.js";
import { getActivePersonalBuffMultipliers } from "../../lib/personalBuffs.js";
import { tryPayReferralReward } from "../../lib/referralRewards.js";
import { addLootToInventory } from "../inventory/service.js";
import { getExpeditionDurationMinutes, getLobbySettings } from "../settings/service.js";
import {
  gatherCombatBuild,
  clearStaleActiveExpeditionPointer,
  checkRewardPlausibility,
} from "../expeditions/service.js";
import { computeDerivedStats, type SimZone } from "../expeditions/combat.js";
import { simulateLobbyExpedition, type LobbyMemberBuild } from "../expeditions/lobbyCombat.js";
import { computeLevel, skillPointsForLevelRange } from "@mmo/shared";
import type { StatBlock, ExpeditionResult, LobbyCombatEvent, LobbyDto, LobbyMemberDto, CombatRole } from "@mmo/shared";

export class LobbyError extends Error {
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
    throw new LobbyError("Nie znaleziono postaci", 404);
  }
  return character;
}

/** Character.activeLobbyId should always point at a still-open (forming/in_progress) Lobby —
 * self-heals the same way clearStaleActiveExpeditionPointer does, for the same reason (an
 * unforeseen path leaving the pointer stale would otherwise wrongly block the character forever). */
async function clearStaleActiveLobbyPointer(characterId: string): Promise<void> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character?.activeLobbyId) return;

  const lobby = await prisma.lobby.findUnique({ where: { id: character.activeLobbyId } });
  if (lobby && (lobby.status === "forming" || lobby.status === "in_progress")) return;

  await prisma.character.updateMany({
    where: { id: characterId, activeLobbyId: character.activeLobbyId },
    data: { activeLobbyId: null },
  });
}

const lobbyInclude = { members: { include: { character: { include: { class: true } } } } } as const;
type LobbyWithMembers = NonNullable<Awaited<ReturnType<typeof getLobbyOrThrow>>>;

async function getLobbyOrThrow(lobbyId: string) {
  const lobby = await prisma.lobby.findUnique({ where: { id: lobbyId }, include: lobbyInclude });
  if (!lobby) throw new LobbyError("Nie znaleziono lobby", 404);
  return lobby;
}

function toLobbyDto(lobby: LobbyWithMembers): LobbyDto {
  const members: LobbyMemberDto[] = lobby.members.map((m) => ({
    characterId: m.characterId,
    name: m.character.name,
    level: m.character.level,
    classId: m.character.classId,
    className: m.character.class?.name ?? null,
    combatRole: (m.character.class?.combatRole ?? "dps") as CombatRole,
    ready: m.ready,
    isLeader: m.characterId === lobby.leaderCharacterId,
  }));
  return {
    id: lobby.id,
    zoneId: lobby.zoneId,
    status: lobby.status as LobbyDto["status"],
    maxMembers: lobby.maxMembers,
    leaderCharacterId: lobby.leaderCharacterId,
    members,
    activeLobbyExpeditionId: null,
  };
}

async function assertJoinable(characterId: string, userId: string, zoneId: string) {
  await resolveTravelArrival(characterId);
  await clearStaleActiveExpeditionPointer(characterId);
  await clearStaleActiveLobbyPointer(characterId);
  const owner = await assertCharacterOwnership(characterId, userId);

  if (owner.activeLobbyId) throw new LobbyError("Postać jest już w lobby", 409);
  if (owner.activeExpeditionId) throw new LobbyError("Postać jest na ekspedycji", 409);
  if (owner.travelArrivesAt) throw new LobbyError("Postać jest w drodze — poczekaj na przybycie", 409);
  if (await hasActiveGatherSession(characterId)) {
    throw new LobbyError("Postać zbiera surowce — najpierw zatrzymaj zbieractwo", 409);
  }
  if (owner.currentZoneId !== zoneId) {
    throw new LobbyError("Postać musi najpierw dotrzeć do tej krainy", 409);
  }
  return owner;
}

export async function listOpenLobbiesInZone(zoneId: string, characterId: string, userId: string) {
  await assertCharacterOwnership(characterId, userId);
  const lobbies = await prisma.lobby.findMany({
    where: { zoneId, status: "forming" },
    include: lobbyInclude,
    orderBy: { createdAt: "asc" },
  });
  return lobbies.map(toLobbyDto);
}

export async function createLobby(characterId: string, zoneId: string, userId: string, requestId?: string) {
  const owner = await assertJoinable(characterId, userId, zoneId);
  const settings = await getLobbySettings();

  const lobby = await prisma.$transaction(async (tx) => {
    const created = await tx.lobby.create({
      data: { zoneId, leaderCharacterId: characterId, maxMembers: settings.maxMembers },
    });
    await tx.lobbyMember.create({ data: { lobbyId: created.id, characterId } });
    const guarded = await tx.character.updateMany({
      where: { id: characterId, activeLobbyId: null },
      data: { activeLobbyId: created.id },
    });
    if (guarded.count !== 1) throw new LobbyError("Nie udało się stworzyć lobby — spróbuj ponownie", 409);
    return tx.lobby.findUniqueOrThrow({ where: { id: created.id }, include: lobbyInclude });
  });

  await logAction({ module: "lobbies", action: "create", actorUserId: userId, actorCharacterId: owner.id, requestId, payload: { lobbyId: lobby.id, zoneId } });
  return toLobbyDto(lobby);
}

export async function joinLobby(lobbyId: string, characterId: string, userId: string, requestId?: string) {
  const lobby = await getLobbyOrThrow(lobbyId);
  if (lobby.status !== "forming") throw new LobbyError("To lobby już nie przyjmuje nowych postaci", 409);
  if (lobby.members.length >= lobby.maxMembers) throw new LobbyError("Lobby jest już pełne", 409);

  const owner = await assertJoinable(characterId, userId, lobby.zoneId);

  const updated = await prisma.$transaction(async (tx) => {
    const freshLobby = await tx.lobby.findUniqueOrThrow({ where: { id: lobbyId }, include: { members: true } });
    if (freshLobby.status !== "forming" || freshLobby.members.length >= freshLobby.maxMembers) {
      throw new LobbyError("Lobby jest już pełne albo nie przyjmuje nowych postaci", 409);
    }
    await tx.lobbyMember.create({ data: { lobbyId, characterId } });
    const guarded = await tx.character.updateMany({
      where: { id: characterId, activeLobbyId: null },
      data: { activeLobbyId: lobbyId },
    });
    if (guarded.count !== 1) throw new LobbyError("Nie udało się dołączyć do lobby — spróbuj ponownie", 409);
    return tx.lobby.findUniqueOrThrow({ where: { id: lobbyId }, include: lobbyInclude });
  });

  await logAction({ module: "lobbies", action: "join", actorUserId: userId, actorCharacterId: owner.id, requestId, payload: { lobbyId } });
  return toLobbyDto(updated);
}

export async function leaveLobby(lobbyId: string, characterId: string, userId: string, requestId?: string) {
  await assertCharacterOwnership(characterId, userId);
  const lobby = await getLobbyOrThrow(lobbyId);
  if (lobby.status !== "forming") {
    throw new LobbyError("Nie można opuścić lobby w trakcie walki — poczekaj na jej zakończenie", 409);
  }
  const isMember = lobby.members.some((m) => m.characterId === characterId);
  if (!isMember) throw new LobbyError("Ta postać nie jest w tym lobby", 404);

  await prisma.$transaction(async (tx) => {
    await tx.lobbyMember.deleteMany({ where: { lobbyId, characterId } });
    await tx.character.updateMany({ where: { id: characterId, activeLobbyId: lobbyId }, data: { activeLobbyId: null } });

    const remaining = await tx.lobbyMember.findMany({ where: { lobbyId }, orderBy: { joinedAt: "asc" } });
    if (remaining.length === 0) {
      await tx.lobby.update({ where: { id: lobbyId }, data: { status: "disbanded" } });
    } else if (lobby.leaderCharacterId === characterId) {
      // Leadership passes to whoever joined earliest, rather than disbanding a lobby others are
      // still waiting in — mirrors the self-healing spirit of clearStaleActiveExpeditionPointer.
      await tx.lobby.update({ where: { id: lobbyId }, data: { leaderCharacterId: remaining[0].characterId } });
    }
  });

  await logAction({ module: "lobbies", action: "leave", actorUserId: userId, actorCharacterId: characterId, requestId, payload: { lobbyId } });
}

export async function kickMember(
  lobbyId: string,
  characterId: string,
  targetCharacterId: string,
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(characterId, userId);
  const lobby = await getLobbyOrThrow(lobbyId);
  if (lobby.leaderCharacterId !== characterId) throw new LobbyError("Tylko lider lobby może wyrzucać członków", 403);
  if (lobby.status !== "forming") throw new LobbyError("Nie można wyrzucać członków w trakcie walki", 409);
  if (targetCharacterId === characterId) throw new LobbyError("Nie możesz wyrzucić samego siebie — użyj Wyjdź", 400);
  const isMember = lobby.members.some((m) => m.characterId === targetCharacterId);
  if (!isMember) throw new LobbyError("Ta postać nie jest w tym lobby", 404);

  await prisma.$transaction(async (tx) => {
    await tx.lobbyMember.deleteMany({ where: { lobbyId, characterId: targetCharacterId } });
    await tx.character.updateMany({ where: { id: targetCharacterId, activeLobbyId: lobbyId }, data: { activeLobbyId: null } });
  });

  await logAction({ module: "lobbies", action: "kick", actorUserId: userId, actorCharacterId: characterId, requestId, payload: { lobbyId, targetCharacterId } });
}

export async function setReady(lobbyId: string, characterId: string, ready: boolean, userId: string, requestId?: string) {
  await assertCharacterOwnership(characterId, userId);
  const lobby = await getLobbyOrThrow(lobbyId);
  if (lobby.status !== "forming") throw new LobbyError("To lobby już nie jest w fazie formowania", 409);
  const isMember = lobby.members.some((m) => m.characterId === characterId);
  if (!isMember) throw new LobbyError("Ta postać nie jest w tym lobby", 404);

  await prisma.lobbyMember.update({ where: { characterId }, data: { ready } });
  await logAction({ module: "lobbies", action: "set_ready", actorUserId: userId, actorCharacterId: characterId, requestId, payload: { lobbyId, ready } });
  return toLobbyDto(await getLobbyOrThrow(lobbyId));
}

export async function getActiveLobby(characterId: string, userId: string) {
  await assertCharacterOwnership(characterId, userId);
  await clearStaleActiveLobbyPointer(characterId);

  const membership = await prisma.lobbyMember.findUnique({ where: { characterId } });
  if (!membership) return null;
  const lobby = await getLobbyOrThrow(membership.lobbyId);

  if (lobby.status === "in_progress") {
    const expedition = await prisma.lobbyExpedition.findFirst({ where: { lobbyId: lobby.id, status: "in_progress" } });
    return { ...toLobbyDto(lobby), activeLobbyExpeditionId: expedition?.id ?? null };
  }
  return toLobbyDto(lobby);
}

function buildSimZone(
  zone: { monsters: { monster: { id: string; name: string; level: number; hp: number; stats: string; expReward: number; goldReward: number; drops: { itemId: string; dropChance: number; minQty: number; maxQty: number }[] }; spawnWeight: number }[]; drops: { itemId: string; dropChance: number }[] },
  selectedMonsterIds: string[],
): SimZone {
  return {
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
          drops: zm.monster.drops,
        };
      })
      .filter((m) => selectedMonsterIds.length === 0 || selectedMonsterIds.includes(m.monsterId)),
    drops: zone.drops,
  };
}

export async function startLobbyExpedition(
  lobbyId: string,
  characterId: string,
  selectedMonsterIds: string[],
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(characterId, userId);
  const lobby = await getLobbyOrThrow(lobbyId);
  if (lobby.leaderCharacterId !== characterId) throw new LobbyError("Tylko lider lobby może rozpocząć walkę", 403);
  if (lobby.status !== "forming") throw new LobbyError("To lobby już walczy albo zakończyło działanie", 409);
  if (lobby.members.length < 2) throw new LobbyError("Potrzeba co najmniej 2 postaci, żeby rozpocząć walkę lobby", 409);
  if (!lobby.members.every((m) => m.ready)) throw new LobbyError("Nie wszyscy członkowie są gotowi", 409);

  const zone = await prisma.zone.findUnique({
    where: { id: lobby.zoneId },
    include: { monsters: { include: { monster: { include: { drops: true } } } }, drops: true },
  });
  if (!zone) throw new LobbyError("Nie znaleziono krainy", 404);
  const simZone = buildSimZone(zone, selectedMonsterIds);
  if (simZone.monsters.length === 0) {
    throw new LobbyError(
      selectedMonsterIds.length === 0 ? "Ta kraina nie ma jeszcze przypisanych potworów" : "Wybierz co najmniej jednego potwora z tej krainy",
      400,
    );
  }

  const settings = await getLobbySettings();
  const eventMultipliers = await getActiveEventMultipliers();
  const durationMinutes = await getExpeditionDurationMinutes();

  const memberBuilds: LobbyMemberBuild[] = [];
  const memberCharacters: { characterId: string; classId: string | null; combatRole: CombatRole }[] = [];
  for (const m of lobby.members) {
    const character = m.character;
    const maxLevelOk = zone.allowRevisitAboveLevel || character.level <= zone.maxLevel;
    if (character.level < zone.minLevel || !maxLevelOk) {
      throw new LobbyError(
        `Ta kraina jest dla poziomów ${zone.minLevel}-${zone.maxLevel}, a postać ${character.name} ma poziom ${character.level}`,
        400,
      );
    }
    const build = await gatherCombatBuild(m.characterId, { includeGroupCombatBonus: true });
    const stats = computeDerivedStats(build.core, build.equipmentStats, build.passiveSkills);
    const personalBuffs = getActivePersonalBuffMultipliers(character);
    memberBuilds.push({
      characterId: m.characterId,
      combatRole: (character.class?.combatRole ?? "dps") as CombatRole,
      stats,
      activeSkills: build.activeSkills,
      potions: build.potions,
      expMultiplier: eventMultipliers.expMultiplier * personalBuffs.expMultiplier,
      goldMultiplier: eventMultipliers.goldMultiplier * personalBuffs.goldMultiplier,
      dropChanceMultiplier: personalBuffs.dropMultiplier,
    });
    memberCharacters.push({ characterId: m.characterId, classId: character.classId, combatRole: (character.class?.combatRole ?? "dps") as CombatRole });
  }

  const uniqueClassCount = new Set(memberCharacters.map((m) => m.classId).filter((id): id is string => !!id)).size;
  const tier = settings.bonusTiers.find((b) => b.memberCount === lobby.members.length && b.uniqueClassCount === uniqueClassCount);
  const classCompositionBonusPct = tier?.expBonusPct ?? 0;

  const outcome = simulateLobbyExpedition(
    simZone,
    memberBuilds,
    durationMinutes,
    settings.monsterConcurrency,
    settings.lureExtraMonsterSlotsPerLureMember,
    classCompositionBonusPct,
    eventMultipliers.bonusDrop,
  );

  const startedAt = new Date();
  const actualEndSeconds = outcome.eventLog.at(-1)?.t ?? 0;
  const endsAt = new Date(startedAt.getTime() + actualEndSeconds * 1000);

  const lobbyExpedition = await prisma.$transaction(async (tx) => {
    const created = await tx.lobbyExpedition.create({
      data: {
        lobbyId,
        zoneId: lobby.zoneId,
        status: "in_progress",
        startedAt,
        endsAt,
        eventLog: JSON.stringify(outcome.eventLog),
        selectedMonsterIds: JSON.stringify(selectedMonsterIds),
        classCompositionBonusPct,
        monsterConcurrency: settings.monsterConcurrency,
        appliedExpMultiplier: eventMultipliers.expMultiplier,
        appliedGoldMultiplier: eventMultipliers.goldMultiplier,
        memberSnapshot: JSON.stringify(memberCharacters),
      },
    });

    for (const m of lobby.members) {
      await tx.lobbyExpeditionMemberResult.create({
        data: {
          lobbyExpeditionId: created.id,
          characterId: m.characterId,
          status: "in_progress",
          result: JSON.stringify(outcome.results.get(m.characterId)),
        },
      });
    }

    const guarded = await tx.lobby.updateMany({ where: { id: lobbyId, status: "forming" }, data: { status: "in_progress" } });
    if (guarded.count !== 1) throw new LobbyError("Nie udało się rozpocząć walki — spróbuj ponownie", 409);

    for (const potionsConsumed of outcome.potionsConsumedByMember.values()) {
      for (const [inventoryItemId, qtyConsumed] of potionsConsumed) {
        const stack = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
        if (!stack) continue;
        if (stack.quantity <= qtyConsumed) {
          await tx.inventoryItem.delete({ where: { id: inventoryItemId } });
        } else {
          await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { quantity: stack.quantity - qtyConsumed } });
        }
      }
    }

    return created;
  });

  await logAction({
    module: "lobbies",
    action: "start_expedition",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: { lobbyId, lobbyExpeditionId: lobbyExpedition.id, zoneId: lobby.zoneId, classCompositionBonusPct, memberCount: lobby.members.length },
  });

  return {
    id: lobbyExpedition.id,
    lobbyId,
    zoneId: lobby.zoneId,
    status: lobbyExpedition.status,
    startedAt: lobbyExpedition.startedAt.toISOString(),
    endsAt: lobbyExpedition.endsAt.toISOString(),
    classCompositionBonusPct,
    events: outcome.eventLog,
  };
}

export async function getLobbyExpedition(lobbyExpeditionId: string, characterId: string, userId: string) {
  await assertCharacterOwnership(characterId, userId);
  const expedition = await prisma.lobbyExpedition.findUnique({
    where: { id: lobbyExpeditionId },
    include: { results: true },
  });
  if (!expedition) throw new LobbyError("Nie znaleziono walki lobby", 404);
  const myResult = expedition.results.find((r) => r.characterId === characterId);
  if (!myResult) throw new LobbyError("Ta postać nie brała udziału w tej walce", 404);

  return {
    id: expedition.id,
    lobbyId: expedition.lobbyId,
    zoneId: expedition.zoneId,
    status: expedition.status,
    startedAt: expedition.startedAt.toISOString(),
    endsAt: expedition.endsAt.toISOString(),
    classCompositionBonusPct: expedition.classCompositionBonusPct,
    myResultStatus: myResult.status,
    events: JSON.parse(expedition.eventLog) as LobbyCombatEvent[],
  };
}

async function applyLobbyMemberReward(
  lobbyExpeditionId: string,
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
      const { overflow } = await addLootToInventory(tx, character.id, loot.itemId, loot.quantity, { allowPartial: true });
      if (overflow > 0) {
        throw new LobbyError(
          "Ekwipunek jest pełny — zrób miejsce w EQ, żeby odebrać całą nagrodę z tej walki, i spróbuj ponownie.",
          409,
        );
      }
    }
    await tx.character.update({
      where: { id: character.id },
      data: {
        exp: newExp,
        level: newLevel,
        gold: character.gold + result.goldGained,
        unspentStatPoints: character.unspentStatPoints + levelsGained * 4,
        unspentSkillPoints: character.unspentSkillPoints + skillPointsForLevelRange(character.level, newLevel),
        monstersKilled: { increment: result.monstersDefeated },
        activeLobbyId: null,
      },
    });
    // Frees this character to create/join a new lobby right away — doesn't wait for the rest of
    // the group to also claim (LobbyMember.characterId is @unique, so a stale row here would
    // otherwise block their very next lobby the same way a stale activeLobbyId would).
    await tx.lobbyMember.deleteMany({ where: { characterId: character.id } });
  });

  if (leveledUp) {
    await tryPayReferralReward(character.id);
  }

  await logAction({
    module: "lobbies",
    action,
    actorUserId: userId,
    actorCharacterId: character.id,
    requestId,
    payload: { lobbyExpeditionId, ...result, leveledUp, newLevel, levelsGained },
  });

  return { result, leveledUp, newLevel };
}

async function finalizeLobbyIfComplete(lobbyExpeditionId: string) {
  const expedition = await prisma.lobbyExpedition.findUnique({ where: { id: lobbyExpeditionId }, include: { results: true } });
  if (!expedition) return;
  const allClaimed = expedition.results.every((r) => r.status !== "in_progress");
  if (!allClaimed) return;
  await prisma.lobbyExpedition.updateMany({ where: { id: lobbyExpeditionId, status: "in_progress" }, data: { status: "completed" } });
  await prisma.lobby.updateMany({ where: { id: expedition.lobbyId, status: "in_progress" }, data: { status: "completed" } });
}

export async function claimLobbyExpeditionReward(lobbyExpeditionId: string, characterId: string, userId: string, requestId?: string) {
  const character = await assertCharacterOwnership(characterId, userId);
  const expedition = await prisma.lobbyExpedition.findUnique({ where: { id: lobbyExpeditionId } });
  if (!expedition) throw new LobbyError("Nie znaleziono walki lobby", 404);
  if (new Date() < expedition.endsAt) throw new LobbyError("Walka jeszcze trwa", 409);

  const memberResult = await prisma.lobbyExpeditionMemberResult.findUnique({
    where: { lobbyExpeditionId_characterId: { lobbyExpeditionId, characterId } },
  });
  if (!memberResult) throw new LobbyError("Ta postać nie brała udziału w tej walce", 404);
  if (memberResult.status === "flagged") {
    throw new LobbyError("Nagroda z tej walki została wstrzymana do sprawdzenia przez administrację (kod: SUSPICIOUS_REWARD).", 409);
  }
  if (memberResult.status !== "in_progress") throw new LobbyError("Nagroda z tej walki została już odebrana", 409);

  const result = JSON.parse(memberResult.result!) as ExpeditionResult;
  const effectiveMultiplier = expedition.appliedExpMultiplier * (1 + expedition.classCompositionBonusPct);
  const plausibility = checkRewardPlausibility(character, result, effectiveMultiplier);
  if (!plausibility.ok) {
    await prisma.lobbyExpeditionMemberResult.updateMany({
      where: { id: memberResult.id, status: "in_progress" },
      data: { status: "flagged" },
    });
    await prisma.character.updateMany({ where: { id: characterId, activeLobbyId: expedition.lobbyId }, data: { activeLobbyId: null } });
    await logAction({
      module: "lobbies",
      level: "error",
      action: "reward_blocked",
      actorUserId: userId,
      actorCharacterId: characterId,
      requestId,
      payload: { lobbyExpeditionId, code: plausibility.code, ...result },
    });
    throw new LobbyError(
      `Nagroda z tej walki wygląda na błąd balansu i została wstrzymana do sprawdzenia przez administrację (kod: ${plausibility.code}).`,
      422,
    );
  }

  const claimed = await prisma.lobbyExpeditionMemberResult.updateMany({
    where: { id: memberResult.id, status: "in_progress" },
    data: { status: "claimed" },
  });
  if (claimed.count !== 1) throw new LobbyError("Nagroda z tej walki została już odebrana", 409);

  const reward = await applyLobbyMemberReward(lobbyExpeditionId, character, result, userId, "claim", requestId);
  await finalizeLobbyIfComplete(lobbyExpeditionId);
  return reward;
}
