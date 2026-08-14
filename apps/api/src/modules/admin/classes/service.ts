import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateCharacterClassInput, ClassSkillInput } from "@mmo/shared";

const classInclude = { skills: true } as const;

export class ClassError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

function skillData(skill: ClassSkillInput) {
  return {
    description: skill.description,
    kind: skill.kind,
    scalingStat: skill.scalingStat,
    scalingFactor: skill.scalingFactor,
    maxLevel: skill.maxLevel,
    targetStat: skill.targetStat ?? null,
    effectType: skill.effectType ?? null,
    cooldownSeconds: skill.cooldownSeconds ?? null,
  };
}

export function listCharacterClasses() {
  return prisma.characterClass.findMany({ include: classInclude, orderBy: { name: "asc" } });
}

export function getCharacterClass(id: string) {
  return prisma.characterClass.findUnique({ where: { id }, include: classInclude });
}

export async function createCharacterClass(
  input: CreateCharacterClassInput,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.characterClass.findUnique({ where: { name: input.name } });
  if (existing) throw new ClassError("Klasa o tej nazwie już istnieje", 409);

  const skillNames = new Set(input.skills.map((s) => s.name));
  if (skillNames.size !== input.skills.length) {
    throw new ClassError("Nazwy umiejętności w tej klasie muszą być unikalne", 400);
  }

  const characterClass = await prisma.characterClass.create({
    data: {
      name: input.name,
      description: input.description,
      primaryStat: input.primaryStat,
      skills: { create: input.skills.map((s) => ({ name: s.name, ...skillData(s) })) },
    },
    include: classInclude,
  });

  await logAction({
    module: "admin:classes",
    action: "create",
    actorUserId,
    requestId,
    payload: { classId: characterClass.id, name: characterClass.name },
  });

  return characterClass;
}

export async function updateCharacterClass(
  id: string,
  input: CreateCharacterClassInput,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.characterClass.findUnique({ where: { id }, include: classInclude });
  if (!existing) throw new ClassError("Nie znaleziono klasy", 404);

  const nameTaken = await prisma.characterClass.findFirst({ where: { name: input.name, NOT: { id } } });
  if (nameTaken) throw new ClassError("Klasa o tej nazwie już istnieje", 409);

  const skillNames = new Set(input.skills.map((s) => s.name));
  if (skillNames.size !== input.skills.length) {
    throw new ClassError("Nazwy umiejętności w tej klasie muszą być unikalne", 400);
  }

  const toRemove = existing.skills.filter((s) => !skillNames.has(s.name));
  for (const skill of toRemove) {
    const invested = await prisma.characterSkill.count({ where: { classSkillId: skill.id, level: { gt: 0 } } });
    if (invested > 0) {
      throw new ClassError(
        `Nie można usunąć umiejętności "${skill.name}" — gracze zainwestowali już w nią punkty`,
        409,
      );
    }
  }

  const characterClass = await prisma.$transaction(async (tx) => {
    if (toRemove.length) {
      await tx.classSkill.deleteMany({ where: { id: { in: toRemove.map((s) => s.id) } } });
    }
    for (const skill of input.skills) {
      await tx.classSkill.upsert({
        where: { classId_name: { classId: id, name: skill.name } },
        create: { classId: id, name: skill.name, ...skillData(skill) },
        update: skillData(skill),
      });
    }
    return tx.characterClass.update({
      where: { id },
      data: { name: input.name, description: input.description, primaryStat: input.primaryStat },
      include: classInclude,
    });
  });

  await logAction({
    module: "admin:classes",
    action: "update",
    actorUserId,
    requestId,
    payload: { classId: characterClass.id, name: characterClass.name },
  });

  return characterClass;
}

export async function deleteCharacterClass(id: string, actorUserId: string, requestId?: string) {
  const existing = await prisma.characterClass.findUnique({ where: { id } });
  if (!existing) throw new ClassError("Nie znaleziono klasy", 404);

  const inUse = await prisma.character.count({ where: { classId: id } });
  if (inUse > 0) {
    throw new ClassError("Nie można usunąć klasy, którą ma przypisaną jakaś postać", 409);
  }

  await prisma.characterClass.delete({ where: { id } });

  await logAction({
    module: "admin:classes",
    action: "delete",
    actorUserId,
    requestId,
    payload: { classId: id, name: existing.name },
  });
}
