import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateCharacterClassInput, ClassSkillInput, SkillTreeNodeInput } from "@mmo/shared";

const classInclude = {
  skills: { include: { nodes: true } },
  starterItems: { include: { item: { select: { id: true, name: true } } } },
} as const;

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
    unlockCost: skill.unlockCost,
    targetStat: skill.targetStat ?? null,
    effectType: skill.effectType ?? null,
    cooldownSeconds: skill.cooldownSeconds ?? null,
    baseManaCost: skill.baseManaCost ?? null,
  };
}

function nodeData(node: SkillTreeNodeInput) {
  return {
    description: node.description,
    effect: node.effect,
    magnitudePct: node.magnitudePct,
    pointCost: node.pointCost,
  };
}

async function assertStarterItemsExist(input: CreateCharacterClassInput) {
  const itemIds = input.starterItems.map((s) => s.itemId);
  if (!itemIds.length) return;
  const count = await prisma.item.count({ where: { id: { in: itemIds } } });
  if (count !== new Set(itemIds).size) {
    throw new ClassError("Jeden lub więcej przedmiotów startowych nie istnieje", 400);
  }
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
  await assertStarterItemsExist(input);

  const characterClass = await prisma.characterClass.create({
    data: {
      name: input.name,
      description: input.description,
      primaryStat: input.primaryStat,
      startingGold: input.startingGold,
      skills: {
        create: input.skills.map((s) => ({
          name: s.name,
          ...skillData(s),
          nodes: { create: s.nodes.map((n) => ({ name: n.name, ...nodeData(n) })) },
        })),
      },
      starterItems: {
        create: input.starterItems.map((s) => ({ itemId: s.itemId, quantity: s.quantity })),
      },
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
  await assertStarterItemsExist(input);

  const toRemove = existing.skills.filter((s) => !skillNames.has(s.name));
  for (const skill of toRemove) {
    const invested = await prisma.characterSkill.count({ where: { classSkillId: skill.id, unlocked: true } });
    if (invested > 0) {
      throw new ClassError(
        `Nie można usunąć umiejętności "${skill.name}" — gracze już ją odblokowali`,
        409,
      );
    }
  }

  // Guard node deletions the same way as skill deletions, computed up front so a 409 aborts
  // before any writes happen (see nested upsert loop below for the matching create/update side).
  const nodeRemovalsBySkillId = new Map<string, string[]>();
  for (const skill of input.skills) {
    const existingSkill = existing.skills.find((s) => s.name === skill.name);
    if (!existingSkill) continue;
    const nodeNames = new Set(skill.nodes.map((n) => n.name));
    const nodesToRemove = existingSkill.nodes.filter((n) => !nodeNames.has(n.name));
    if (!nodesToRemove.length) continue;
    const unlockedCount = await prisma.characterSkillNode.count({
      where: { nodeId: { in: nodesToRemove.map((n) => n.id) } },
    });
    if (unlockedCount > 0) {
      throw new ClassError(
        `Nie można usunąć węzła w umiejętności "${skill.name}" — gracze już go odblokowali`,
        409,
      );
    }
    nodeRemovalsBySkillId.set(existingSkill.id, nodesToRemove.map((n) => n.id));
  }

  const characterClass = await prisma.$transaction(async (tx) => {
    if (toRemove.length) {
      await tx.classSkill.deleteMany({ where: { id: { in: toRemove.map((s) => s.id) } } });
    }
    for (const skill of input.skills) {
      const classSkill = await tx.classSkill.upsert({
        where: { classId_name: { classId: id, name: skill.name } },
        create: { classId: id, name: skill.name, ...skillData(skill) },
        update: skillData(skill),
      });

      const nodesToRemove = nodeRemovalsBySkillId.get(classSkill.id);
      if (nodesToRemove?.length) {
        await tx.skillTreeNode.deleteMany({ where: { id: { in: nodesToRemove } } });
      }
      for (const node of skill.nodes) {
        await tx.skillTreeNode.upsert({
          where: { classSkillId_name: { classSkillId: classSkill.id, name: node.name } },
          create: { classSkillId: classSkill.id, name: node.name, ...nodeData(node) },
          update: nodeData(node),
        });
      }
    }
    await tx.classStarterItem.deleteMany({ where: { classId: id } });
    return tx.characterClass.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        primaryStat: input.primaryStat,
        startingGold: input.startingGold,
        starterItems: {
          create: input.starterItems.map((s) => ({ itemId: s.itemId, quantity: s.quantity })),
        },
      },
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

  const [charactersInUse, itemsInUse] = await Promise.all([
    prisma.character.count({ where: { classId: id } }),
    prisma.item.count({ where: { classId: id } }),
  ]);
  if (charactersInUse > 0) {
    throw new ClassError("Nie można usunąć klasy, którą ma przypisaną jakaś postać", 409);
  }
  if (itemsInUse > 0) {
    throw new ClassError("Nie można usunąć klasy, do której przypisane są itemy", 409);
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
