import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import type { GatherKind, PassiveSkillDto, ReadBookInput } from "@mmo/shared";

export class PassiveSkillError extends Error {
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
    throw new PassiveSkillError("Nie znaleziono postaci", 404);
  }
  return character;
}

/** Every PassiveSkillType, left-joined with this character's level (0 if they've never read a
 * book for it) — the "Umiejętności pasywne" tab always shows the full catalog, not just started
 * skills. */
export async function listPassiveSkillsForCharacter(
  characterId: string,
  userId: string,
): Promise<PassiveSkillDto[]> {
  await assertCharacterOwnership(characterId, userId);

  const [types, characterSkills] = await Promise.all([
    prisma.passiveSkillType.findMany({ orderBy: { name: "asc" } }),
    prisma.characterPassiveSkill.findMany({ where: { characterId } }),
  ]);
  const progressBySkillTypeId = new Map(characterSkills.map((s) => [s.skillTypeId, s]));

  return types.map((t) => {
    const progress = progressBySkillTypeId.get(t.id);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      maxLevel: t.maxLevel,
      gatherKind: t.gatherKind as GatherKind | null,
      chanceBonusPerLevel: t.chanceBonusPerLevel,
      speedBonusPerLevel: t.speedBonusPerLevel,
      level: progress?.level ?? 0,
      xpPerLevel: t.xpPerLevel,
      xp: progress?.xp ?? 0,
      bookGateFromLevel: t.bookGateFromLevel,
      booksRequiredPerLevel: t.booksRequiredPerLevel,
      pendingBooksRead: progress?.pendingBooksRead ?? 0,
    };
  });
}

/** Grants xpPerGatherAction to every PassiveSkillType matching gatherKind for every completed
 * catch/dig attempt (success or not — confirmed with the user) and auto-levels-up any that cross
 * their xpPerLevel threshold, UNLESS the level being leveled INTO is gated by bookGateFromLevel
 * (see readBook), in which case xp is held (capped at xpPerLevel) until enough books are read.
 * Must run inside the same transaction as the gather-cycle resolution that calls it (mirrors
 * gatherSuccessCount's per-instance increment in inventory/service.ts). Runs for level-0 skills
 * too (unlike getPassiveSkillGatherBonus, which only reads level>0 rows for its bonus sum) — a
 * character must be able to start earning XP from their very first attempt. */
export async function grantGatherXp(
  tx: Prisma.TransactionClient,
  characterId: string,
  gatherKind: GatherKind,
): Promise<void> {
  const skillTypes = await tx.passiveSkillType.findMany({
    where: { gatherKind },
    select: { id: true, maxLevel: true, xpPerLevel: true, xpPerGatherAction: true, bookGateFromLevel: true },
  });

  for (const skillType of skillTypes) {
    const existing = await tx.characterPassiveSkill.findUnique({
      where: { characterId_skillTypeId: { characterId, skillTypeId: skillType.id } },
    });
    let level = existing?.level ?? 0;
    let xp = (existing?.xp ?? 0) + skillType.xpPerGatherAction;

    while (
      level < skillType.maxLevel &&
      xp >= skillType.xpPerLevel &&
      (skillType.bookGateFromLevel == null || level + 1 < skillType.bookGateFromLevel)
    ) {
      level += 1;
      xp -= skillType.xpPerLevel;
    }
    // Gated and XP-ready: stop accumulating further — nothing more to gain until books are read.
    if (skillType.bookGateFromLevel != null && level + 1 >= skillType.bookGateFromLevel) {
      xp = Math.min(xp, skillType.xpPerLevel);
    }

    await tx.characterPassiveSkill.upsert({
      where: { characterId_skillTypeId: { characterId, skillTypeId: skillType.id } },
      create: { characterId, skillTypeId: skillType.id, level, xp },
      update: { level, xp },
    });
  }
}

/** Sums (level * bonusPerLevel) across every passive skill matching this gather kind — additive
 * with the equipped tool's own bonus (see modules/gathering/service.ts). */
export async function getPassiveSkillGatherBonus(
  characterId: string,
  gatherKind: GatherKind,
): Promise<{ chanceBonusPct: number; speedBonusPct: number }> {
  const rows = await prisma.characterPassiveSkill.findMany({
    where: { characterId, level: { gt: 0 }, skillType: { gatherKind } },
    include: { skillType: { select: { chanceBonusPerLevel: true, speedBonusPerLevel: true } } },
  });
  let chanceBonusPct = 0;
  let speedBonusPct = 0;
  for (const row of rows) {
    chanceBonusPct += row.level * row.skillType.chanceBonusPerLevel;
    speedBonusPct += row.level * row.skillType.speedBonusPerLevel;
  }
  return { chanceBonusPct, speedBonusPct };
}

export async function readBook(input: ReadBookInput & { characterId: string }, userId: string, requestId?: string) {
  await assertCharacterOwnership(input.characterId, userId);

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { item: { include: { bookSkillType: true } } },
  });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new PassiveSkillError("Nie znaleziono przedmiotu", 404);
  }
  if (inventoryItem.item.type !== "book" || !inventoryItem.item.bookSkillType) {
    throw new PassiveSkillError("Ten przedmiot nie jest książką umiejętności", 400);
  }
  const skillType = inventoryItem.item.bookSkillType;

  const existing = await prisma.characterPassiveSkill.findUnique({
    where: { characterId_skillTypeId: { characterId: input.characterId, skillTypeId: skillType.id } },
  });
  const currentLevel = existing?.level ?? 0;
  if (currentLevel >= skillType.maxLevel) {
    throw new PassiveSkillError(`Umiejętność "${skillType.name}" jest już na maksymalnym poziomie`, 400);
  }

  // Gathering-tied skills (gatherKind set) level up primarily from XP earned while
  // fishing/mining (see grantGatherXp) — books only matter once the skill is gated at/above
  // bookGateFromLevel AND its XP is already full, at which point each book is a bookSuccessChance
  // roll toward pendingBooksRead (same "can be wasted" flavor as the legacy path below). Skills
  // without gatherKind (no XP source) keep the original direct chance-roll-to-level-up behavior.
  if (skillType.gatherKind) {
    const nextLevel = currentLevel + 1;
    if (skillType.bookGateFromLevel == null || nextLevel < skillType.bookGateFromLevel) {
      throw new PassiveSkillError(
        `Umiejętność "${skillType.name}" rośnie z doświadczenia podczas zbieractwa — książka nie jest jeszcze potrzebna`,
        400,
      );
    }
    const currentXp = existing?.xp ?? 0;
    if (currentXp < skillType.xpPerLevel) {
      throw new PassiveSkillError(
        `Zbierz najpierw pełne doświadczenie (${currentXp}/${skillType.xpPerLevel} XP), zanim książka pomoże`,
        400,
      );
    }

    const success = Math.random() < (inventoryItem.item.bookSuccessChance ?? 0);
    const pendingBefore = existing?.pendingBooksRead ?? 0;
    const leveledUp = success && pendingBefore + 1 >= skillType.booksRequiredPerLevel;

    const { newLevel, pendingBooksRead } = await prisma.$transaction(async (tx) => {
      if (inventoryItem.quantity <= 1) {
        await tx.inventoryItem.delete({ where: { id: inventoryItem.id } });
      } else {
        await tx.inventoryItem.update({ where: { id: inventoryItem.id }, data: { quantity: inventoryItem.quantity - 1 } });
      }

      if (!success) return { newLevel: currentLevel, pendingBooksRead: pendingBefore };

      const updated = await tx.characterPassiveSkill.upsert({
        where: { characterId_skillTypeId: { characterId: input.characterId, skillTypeId: skillType.id } },
        create: leveledUp
          ? { characterId: input.characterId, skillTypeId: skillType.id, level: 1, xp: 0, pendingBooksRead: 0 }
          : { characterId: input.characterId, skillTypeId: skillType.id, level: 0, xp: currentXp, pendingBooksRead: 1 },
        update: leveledUp
          ? { level: { increment: 1 }, xp: Math.max(0, currentXp - skillType.xpPerLevel), pendingBooksRead: 0 }
          : { pendingBooksRead: { increment: 1 } },
      });
      return { newLevel: updated.level, pendingBooksRead: updated.pendingBooksRead };
    });

    await logAction({
      module: "passiveSkills",
      action: "read_book",
      actorUserId: userId,
      actorCharacterId: input.characterId,
      requestId,
      payload: { inventoryItemId: input.inventoryItemId, skillTypeId: skillType.id, success, leveledUp, newLevel, pendingBooksRead },
    });

    return {
      success,
      leveledUp,
      newLevel,
      skillName: skillType.name,
      pendingBooksRead,
      booksRequiredPerLevel: skillType.booksRequiredPerLevel,
    };
  }

  const success = Math.random() < (inventoryItem.item.bookSuccessChance ?? 0);

  const newLevel = await prisma.$transaction(async (tx) => {
    if (inventoryItem.quantity <= 1) {
      await tx.inventoryItem.delete({ where: { id: inventoryItem.id } });
    } else {
      await tx.inventoryItem.update({ where: { id: inventoryItem.id }, data: { quantity: inventoryItem.quantity - 1 } });
    }

    if (!success) return currentLevel;

    const updated = await tx.characterPassiveSkill.upsert({
      where: { characterId_skillTypeId: { characterId: input.characterId, skillTypeId: skillType.id } },
      create: { characterId: input.characterId, skillTypeId: skillType.id, level: 1 },
      update: { level: { increment: 1 } },
    });
    return updated.level;
  });

  await logAction({
    module: "passiveSkills",
    action: "read_book",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, skillTypeId: skillType.id, success, newLevel },
  });

  return { success, leveledUp: success, newLevel, skillName: skillType.name };
}
