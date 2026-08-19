import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { resolveTravelArrival } from "../../lib/travelResolution.js";
import { addLootToInventory } from "../inventory/service.js";
import { tryPayReferralReward } from "../../lib/referralRewards.js";
import type { CreateCharacterInput, CoreStatKey } from "@mmo/shared";

export class CharacterError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

const MAX_CHARACTERS_PER_USER = 5;

export async function listCharacters(userId: string) {
  const characters = await prisma.character.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  await Promise.all(characters.map((c) => resolveTravelArrival(c.id)));
  if (characters.length === 0) return characters;
  return prisma.character.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export async function getCharacter(id: string, userId: string) {
  await resolveTravelArrival(id);
  const character = await prisma.character.findUnique({ where: { id } });
  if (!character || character.userId !== userId) return null;
  return character;
}

export async function getCharacterSkills(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new CharacterError("Nie znaleziono postaci", 404);
  }
  return prisma.characterSkill.findMany({ where: { characterId } });
}

export async function getCharacterSkillNodes(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new CharacterError("Nie znaleziono postaci", 404);
  }
  return prisma.characterSkillNode.findMany({ where: { characterId } });
}

async function assertOwnership(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new CharacterError("Nie znaleziono postaci", 404);
  }
  return character;
}

export async function createCharacter(
  input: CreateCharacterInput,
  userId: string,
  requestId?: string,
) {
  const count = await prisma.character.count({ where: { userId } });
  if (count >= MAX_CHARACTERS_PER_USER) {
    throw new CharacterError(`Limit postaci to ${MAX_CHARACTERS_PER_USER}`, 409);
  }

  const nameTaken = await prisma.character.findUnique({ where: { name: input.name } });
  if (nameTaken) {
    throw new CharacterError("Ta nazwa postaci jest już zajęta", 409);
  }

  const characterClass = await prisma.characterClass.findUnique({
    where: { id: input.classId },
    include: { starterItems: true },
  });
  if (!characterClass) {
    throw new CharacterError("Nie znaleziono wybranej klasy postaci", 400);
  }

  const character = await prisma.$transaction(async (tx) => {
    const created = await tx.character.create({
      data: {
        userId,
        name: input.name,
        classId: characterClass.id,
        gold: characterClass.startingGold,
      },
    });
    for (const starter of characterClass.starterItems) {
      await addLootToInventory(tx, created.id, starter.itemId, starter.quantity);
    }
    return created;
  });

  await logAction({
    module: "characters",
    action: "create",
    actorUserId: userId,
    actorCharacterId: character.id,
    requestId,
    payload: {
      name: character.name,
      classId: characterClass.id,
      startingGold: characterClass.startingGold,
      starterItems: characterClass.starterItems.map((s) => ({ itemId: s.itemId, quantity: s.quantity })),
    },
  });

  // First character reaching level 1 is when a requiredLevel<=1 referral reward becomes payable
  // (a fresh account has no character at registration time — see lib/referralRewards.ts).
  if (count === 0) {
    await tryPayReferralReward(character.id);
  }

  return character;
}

export async function allocateStat(
  characterId: string,
  userId: string,
  stat: CoreStatKey,
  requestId?: string,
) {
  const character = await assertOwnership(characterId, userId);
  if (character.unspentStatPoints < 1) {
    throw new CharacterError("Brak niewydanych punktów statystyk", 400);
  }

  const updated = await prisma.character.update({
    where: { id: characterId },
    data: {
      unspentStatPoints: character.unspentStatPoints - 1,
      [stat]: { increment: 1 },
    },
  });

  await logAction({
    module: "characters",
    action: "allocate_stat",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: { stat },
  });

  return updated;
}

export async function unlockSkill(
  characterId: string,
  userId: string,
  classSkillId: string,
  requestId?: string,
) {
  const character = await assertOwnership(characterId, userId);

  const classSkill = await prisma.classSkill.findUnique({ where: { id: classSkillId } });
  if (!classSkill || classSkill.classId !== character.classId) {
    throw new CharacterError("Ta umiejętność nie należy do klasy tej postaci", 400);
  }

  const existing = await prisma.characterSkill.findUnique({
    where: { characterId_classSkillId: { characterId, classSkillId } },
  });
  if (existing?.unlocked) {
    throw new CharacterError("Umiejętność jest już odblokowana", 400);
  }
  if (character.unspentSkillPoints < classSkill.unlockCost) {
    throw new CharacterError("Brak niewydanych punktów umiejętności", 400);
  }

  const [, characterSkill] = await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { unspentSkillPoints: character.unspentSkillPoints - classSkill.unlockCost },
    }),
    prisma.characterSkill.upsert({
      where: { characterId_classSkillId: { characterId, classSkillId } },
      create: { characterId, classSkillId, unlocked: true },
      update: { unlocked: true },
    }),
  ]);

  await logAction({
    module: "characters",
    action: "unlock_skill",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: { classSkillId, cost: classSkill.unlockCost },
  });

  return characterSkill;
}

export async function unlockNode(
  characterId: string,
  userId: string,
  nodeId: string,
  requestId?: string,
) {
  const character = await assertOwnership(characterId, userId);

  const node = await prisma.skillTreeNode.findUnique({ where: { id: nodeId }, include: { classSkill: true } });
  if (!node || node.classSkill.classId !== character.classId) {
    throw new CharacterError("Ten węzeł nie należy do klasy tej postaci", 400);
  }

  const parentSkill = await prisma.characterSkill.findUnique({
    where: { characterId_classSkillId: { characterId, classSkillId: node.classSkillId } },
  });
  if (!parentSkill?.unlocked) {
    throw new CharacterError("Najpierw odblokuj umiejętność, do której należy ten węzeł", 400);
  }

  const existingNode = await prisma.characterSkillNode.findUnique({
    where: { characterId_nodeId: { characterId, nodeId } },
  });
  if (existingNode) {
    throw new CharacterError("Ten węzeł jest już odblokowany", 400);
  }
  if (character.unspentSkillPoints < node.pointCost) {
    throw new CharacterError("Brak niewydanych punktów umiejętności", 400);
  }

  const [, characterSkillNode] = await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { unspentSkillPoints: character.unspentSkillPoints - node.pointCost },
    }),
    prisma.characterSkillNode.create({ data: { characterId, nodeId } }),
  ]);

  await logAction({
    module: "characters",
    action: "unlock_node",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: { nodeId, classSkillId: node.classSkillId, cost: node.pointCost },
  });

  return characterSkillNode;
}
