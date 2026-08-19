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
  const levelBySkillTypeId = new Map(characterSkills.map((s) => [s.skillTypeId, s.level]));

  return types.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    maxLevel: t.maxLevel,
    gatherKind: t.gatherKind as GatherKind | null,
    chanceBonusPerLevel: t.chanceBonusPerLevel,
    speedBonusPerLevel: t.speedBonusPerLevel,
    level: levelBySkillTypeId.get(t.id) ?? 0,
  }));
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

  return { success, newLevel, skillName: skillType.name };
}
