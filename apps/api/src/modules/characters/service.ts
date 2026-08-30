import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { resolveTravelArrival } from "../../lib/travelResolution.js";
import { addLootToInventory } from "../inventory/service.js";
import { tryPayReferralReward } from "../../lib/referralRewards.js";
import { checkBookCooldown } from "../../lib/bookCooldown.js";
import type { CreateCharacterInput, CoreStatKey, ReadSkillBookInput } from "@mmo/shared";

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
      const { overflow } = await addLootToInventory(tx, created.id, starter.itemId, starter.quantity);
      if (overflow > 0) {
        throw new CharacterError("Nie udało się przyznać przedmiotu startowego", 500);
      }
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

/** Invests one more level into a ClassSkill's own base effect — callable repeatedly up to
 * classSkill.maxLevel, same pattern as unlockNode below. The first call (no existing
 * CharacterSkill row) creates it at level 1 — for a classSkill with the default maxLevel=1 this
 * is the only call that will ever succeed, preserving the original one-shot "unlock" behavior
 * exactly; every later call on a higher-maxLevel skill increments level by one, each costing the
 * same flat unlockCost. */
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
  if (existing && existing.level >= classSkill.maxLevel) {
    throw new CharacterError("Umiejętność jest już na maksymalnym poziomie", 400);
  }
  if (classSkill.bookGateFromLevel != null && (existing?.level ?? 0) >= classSkill.bookGateFromLevel - 1) {
    throw new CharacterError(
      `Umiejętność "${classSkill.name}" od poziomu ${classSkill.bookGateFromLevel} rośnie już tylko przez czytanie książek`,
      400,
    );
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
      create: { characterId, classSkillId, level: 1 },
      update: { level: { increment: 1 } },
    }),
  ]);

  await logAction({
    module: "characters",
    action: "unlock_skill",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: { classSkillId, cost: classSkill.unlockCost, newLevel: characterSkill.level },
  });

  return characterSkill;
}

/** Invests one more level into a node — callable repeatedly on the same node up to its
 * maxLevel. The first call (no existing CharacterSkillNode row) creates it at level 1; every
 * later call increments level by one, each costing the same flat pointCost. */
export async function unlockNode(
  characterId: string,
  userId: string,
  nodeId: string,
  requestId?: string,
) {
  const character = await assertOwnership(characterId, userId);

  const node = await prisma.skillTreeNode.findUnique({
    where: { id: nodeId },
    include: { classSkill: true, requires: true },
  });
  if (!node || node.classSkill.classId !== character.classId) {
    throw new CharacterError("Ten węzeł nie należy do klasy tej postaci", 400);
  }

  const parentSkill = await prisma.characterSkill.findUnique({
    where: { characterId_classSkillId: { characterId, classSkillId: node.classSkillId } },
  });
  if (!parentSkill || parentSkill.level < 1) {
    throw new CharacterError("Najpierw odblokuj umiejętność, do której należy ten węzeł", 400);
  }

  if (node.requiresNodeId) {
    const requiredProgress = await prisma.characterSkillNode.findUnique({
      where: { characterId_nodeId: { characterId, nodeId: node.requiresNodeId } },
    });
    if (!requiredProgress || requiredProgress.level < 1) {
      throw new CharacterError(`Najpierw odblokuj węzeł: ${node.requires!.name}`, 400);
    }
  }

  const existingNode = await prisma.characterSkillNode.findUnique({
    where: { characterId_nodeId: { characterId, nodeId } },
  });
  if (existingNode && existingNode.level >= node.maxLevel) {
    throw new CharacterError("Węzeł jest już na maksymalnym poziomie", 400);
  }
  if (character.unspentSkillPoints < node.pointCost) {
    throw new CharacterError("Brak niewydanych punktów umiejętności", 400);
  }

  const [, characterSkillNode] = await prisma.$transaction([
    prisma.character.update({
      where: { id: characterId },
      data: { unspentSkillPoints: character.unspentSkillPoints - node.pointCost },
    }),
    prisma.characterSkillNode.upsert({
      where: { characterId_nodeId: { characterId, nodeId } },
      create: { characterId, nodeId, level: 1 },
      update: { level: { increment: 1 } },
    }),
  ]);

  await logAction({
    module: "characters",
    action: "unlock_node",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: { nodeId, classSkillId: node.classSkillId, cost: node.pointCost, newLevel: characterSkillNode.level },
  });

  return characterSkillNode;
}

/** Reads a skill book targeting a ClassSkill — the book-gated continuation of unlockSkill, past
 * classSkill.bookGateFromLevel. Structurally mirrors passiveSkills/service.ts's readBook
 * (gatherKind branch): validates the book targets this skill and isn't past maxLevel, checks the
 * per-item cooldown, rolls bookSuccessChance (boosted by any pending nextReadBonusPct on this
 * stack), and on success ALWAYS accumulates the book's own fixed bonus onto CharacterSkill's
 * running totals — independent of whether this particular read also crosses the current level's
 * ClassSkillBookRequirement threshold (each book grants its own bonus; "level" is just a derived
 * progress counter, see docs/architecture.md). The book is consumed either way. */
export async function readSkillBook(
  input: ReadSkillBookInput & { characterId: string },
  userId: string,
  requestId?: string,
) {
  const character = await assertOwnership(input.characterId, userId);

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { item: { include: { bookClassSkill: { include: { bookRequirements: true } } } } },
  });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new CharacterError("Nie znaleziono przedmiotu", 404);
  }
  if (inventoryItem.item.type !== "book" || !inventoryItem.item.bookClassSkill) {
    throw new CharacterError("Ten przedmiot nie jest książką umiejętności klasowej", 400);
  }
  const classSkill = inventoryItem.item.bookClassSkill;
  if (classSkill.classId !== character.classId) {
    throw new CharacterError("Ta książka nie dotyczy umiejętności klasy tej postaci", 400);
  }

  const existing = await prisma.characterSkill.findUnique({
    where: { characterId_classSkillId: { characterId: input.characterId, classSkillId: classSkill.id } },
  });
  const currentLevel = existing?.level ?? 0;
  if (currentLevel >= classSkill.maxLevel) {
    throw new CharacterError(`Umiejętność "${classSkill.name}" jest już na maksymalnym poziomie`, 400);
  }
  const nextLevel = currentLevel + 1;
  if (classSkill.bookGateFromLevel == null || nextLevel < classSkill.bookGateFromLevel) {
    throw new CharacterError(
      `Umiejętność "${classSkill.name}" rośnie z punktów umiejętności — ta książka nie jest jeszcze potrzebna`,
      400,
    );
  }

  const remainingCooldown = checkBookCooldown(inventoryItem, inventoryItem.item);
  if (remainingCooldown != null) {
    throw new CharacterError(`Ta książka jest jeszcze w trakcie odnowienia (${remainingCooldown}s)`, 400);
  }

  const effectiveChance = (inventoryItem.item.bookSuccessChance ?? 0) + (inventoryItem.nextReadBonusPct ?? 0);
  const success = Math.random() < effectiveChance;
  const booksRequired =
    classSkill.bookRequirements.find((r) => r.level === nextLevel)?.booksRequired ?? 1;
  const pendingBefore = existing?.pendingSkillBooksRead ?? 0;
  const leveledUp = success && pendingBefore + 1 >= booksRequired;

  const bookEffect = inventoryItem.item.bookEffect;
  const bonusField =
    bookEffect === "magnitude" ? "bookMagnitudePct" : bookEffect === "cost" ? "bookCostFlatAmount" : bookEffect === "cooldown" ? "bookCooldownFlatAmount" : null;
  const bonusAmount = bookEffect === "magnitude" ? (inventoryItem.item.bookMagnitudePct ?? 0) : (inventoryItem.item.bookFlatAmount ?? 0);

  const { newLevel, pendingSkillBooksRead } = await prisma.$transaction(async (tx) => {
    if (inventoryItem.quantity <= 1) {
      await tx.inventoryItem.delete({ where: { id: inventoryItem.id } });
    } else {
      await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: { quantity: inventoryItem.quantity - 1, lastReadAt: new Date(), nextReadBonusPct: null },
      });
    }

    if (!success) {
      return { newLevel: currentLevel, pendingSkillBooksRead: pendingBefore };
    }

    const bonusDelta = bonusField ? { [bonusField]: { increment: bonusAmount } } : {};
    const updated = await tx.characterSkill.upsert({
      where: { characterId_classSkillId: { characterId: input.characterId, classSkillId: classSkill.id } },
      create: {
        characterId: input.characterId,
        classSkillId: classSkill.id,
        level: leveledUp ? currentLevel + 1 : currentLevel,
        pendingSkillBooksRead: leveledUp ? 0 : 1,
        ...(bonusField ? { [bonusField]: bonusAmount } : {}),
      },
      update: leveledUp
        ? { level: { increment: 1 }, pendingSkillBooksRead: 0, ...bonusDelta }
        : { pendingSkillBooksRead: { increment: 1 }, ...bonusDelta },
    });
    return { newLevel: updated.level, pendingSkillBooksRead: updated.pendingSkillBooksRead };
  });

  await logAction({
    module: "characters",
    action: "read_skill_book",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, classSkillId: classSkill.id, success, leveledUp, newLevel, pendingSkillBooksRead },
  });

  return {
    success,
    leveledUp,
    newLevel,
    skillName: classSkill.name,
    pendingSkillBooksRead,
    booksRequired,
  };
}
