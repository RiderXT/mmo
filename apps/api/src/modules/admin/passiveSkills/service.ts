import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreatePassiveSkillTypeInput, UpdatePassiveSkillTypeInput } from "@mmo/shared";

export class PassiveSkillTypeError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

const skillTypeInclude = { bookRequirements: true } as const;

export function listPassiveSkillTypes() {
  return prisma.passiveSkillType.findMany({ orderBy: { name: "asc" }, include: skillTypeInclude });
}

export function getPassiveSkillType(id: string) {
  return prisma.passiveSkillType.findUnique({ where: { id }, include: skillTypeInclude });
}

export async function createPassiveSkillType(
  input: CreatePassiveSkillTypeInput,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.passiveSkillType.findUnique({ where: { name: input.name } });
  if (existing) throw new PassiveSkillTypeError("Umiejętność o tej nazwie już istnieje", 409);

  const skillType = await prisma.passiveSkillType.create({
    data: {
      name: input.name,
      description: input.description,
      maxLevel: input.maxLevel,
      gatherKind: input.gatherKind ?? null,
      chanceBonusPerLevel: input.chanceBonusPerLevel,
      speedBonusPerLevel: input.speedBonusPerLevel,
      xpPerLevel: input.xpPerLevel,
      xpPerGatherAction: input.xpPerGatherAction,
      bookGateFromLevel: input.bookGateFromLevel ?? null,
      booksRequiredPerLevel: input.booksRequiredPerLevel,
      bookRequirements: { create: input.bookRequirements },
    },
    include: skillTypeInclude,
  });

  await logAction({
    module: "admin:passiveSkills",
    action: "create",
    actorUserId,
    requestId,
    payload: { skillTypeId: skillType.id, name: skillType.name },
  });

  return skillType;
}

export async function updatePassiveSkillType(
  id: string,
  input: UpdatePassiveSkillTypeInput,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.passiveSkillType.findUnique({ where: { id } });
  if (!existing) throw new PassiveSkillTypeError("Nie znaleziono umiejętności", 404);

  const nameClash = await prisma.passiveSkillType.findUnique({ where: { name: input.name } });
  if (nameClash && nameClash.id !== id) {
    throw new PassiveSkillTypeError("Umiejętność o tej nazwie już istnieje", 409);
  }

  const skillType = await prisma.$transaction(async (tx) => {
    const updated = await tx.passiveSkillType.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        maxLevel: input.maxLevel,
        gatherKind: input.gatherKind ?? null,
        chanceBonusPerLevel: input.chanceBonusPerLevel,
        speedBonusPerLevel: input.speedBonusPerLevel,
        xpPerLevel: input.xpPerLevel,
        xpPerGatherAction: input.xpPerGatherAction,
        bookGateFromLevel: input.bookGateFromLevel ?? null,
        booksRequiredPerLevel: input.booksRequiredPerLevel,
      },
    });
    // Book-level requirements are just curve parameters, not something a player "unlocks" — no
    // invested-count guard needed before replacing them wholesale.
    await tx.passiveSkillBookRequirement.deleteMany({ where: { skillTypeId: id } });
    if (input.bookRequirements.length) {
      await tx.passiveSkillBookRequirement.createMany({
        data: input.bookRequirements.map((r) => ({ skillTypeId: id, ...r })),
      });
    }
    return tx.passiveSkillType.findUniqueOrThrow({ where: { id }, include: skillTypeInclude });
  });

  await logAction({
    module: "admin:passiveSkills",
    action: "update",
    actorUserId,
    requestId,
    payload: { skillTypeId: skillType.id, name: skillType.name },
  });

  return skillType;
}

export async function deletePassiveSkillType(id: string, actorUserId: string, requestId?: string) {
  const existing = await prisma.passiveSkillType.findUnique({ where: { id } });
  if (!existing) throw new PassiveSkillTypeError("Nie znaleziono umiejętności", 404);

  // Books that targeted this skill just lose their target (Item.bookSkillTypeId onDelete: SetNull)
  // rather than being deleted — admin should reassign them afterward if that wasn't intended.
  await prisma.passiveSkillType.delete({ where: { id } });

  await logAction({
    module: "admin:passiveSkills",
    action: "delete",
    actorUserId,
    requestId,
    payload: { skillTypeId: id, name: existing.name },
  });
}
