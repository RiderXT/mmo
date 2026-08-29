import fs from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateCharacterClassInput, ClassSkillInput, SkillTreeNodeInput } from "@mmo/shared";

const classInclude = {
  skills: { include: { nodes: true } },
  starterItems: { include: { item: { select: { id: true, name: true } } } },
} as const;

// Relative to cwd (apps/api/), matching how app.ts serves it at /uploads/ — same convention as
// modules/admin/items. Shared by both ClassSkill (branch root) and SkillTreeNode (upgrade) icons
// since each entity's own cuid already guarantees a unique filename across both.
const UPLOADS_DIR = path.join(process.cwd(), "uploads", "skills");
const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

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
    durationSeconds: skill.durationSeconds ?? null,
    maxLevel: skill.maxLevel,
    levelMagnitudePct: skill.levelMagnitudePct,
    category: skill.category,
  };
}

// requiresNodeId is deliberately excluded here — it references another node that may be created
// in the very same batch, so it's resolved in a second pass once every node in the skill has an
// id (see resolveNodeRequirements below).
function nodeData(node: SkillTreeNodeInput) {
  return {
    description: node.description,
    effect: node.effect,
    magnitudePct: node.magnitudePct,
    pointCost: node.pointCost,
    maxLevel: node.maxLevel,
  };
}

/** Second pass, run after every node of a skill has been upserted: resolves each node's
 * requiresNodeName (a name within the same skill) to the sibling's freshly-known id. */
async function resolveNodeRequirements(
  tx: Prisma.TransactionClient,
  nodes: SkillTreeNodeInput[],
  nameToId: Map<string, string>,
) {
  for (const node of nodes) {
    const nodeId = nameToId.get(node.name)!;
    const requiresNodeId = node.requiresNodeName ? (nameToId.get(node.requiresNodeName) ?? null) : null;
    await tx.skillTreeNode.update({ where: { id: nodeId }, data: { requiresNodeId } });
  }
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

  const characterClass = await prisma.$transaction(async (tx) => {
    const created = await tx.characterClass.create({
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
      include: { skills: { include: { nodes: true } } },
    });

    for (const skill of input.skills) {
      if (!skill.nodes.some((n) => n.requiresNodeName)) continue;
      const createdSkill = created.skills.find((s) => s.name === skill.name)!;
      const nameToId = new Map(createdSkill.nodes.map((n) => [n.name, n.id]));
      await resolveNodeRequirements(tx, skill.nodes, nameToId);
    }

    return tx.characterClass.findUniqueOrThrow({ where: { id: created.id }, include: classInclude });
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
    const invested = await prisma.characterSkill.count({ where: { classSkillId: skill.id, level: { gt: 0 } } });
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
    // Exclude nodes that are themselves also being removed in this same request — deleting a
    // dependent pair together is fine, only a SURVIVING node left pointing at a removed one isn't.
    const requiredByOthers = await prisma.skillTreeNode.count({
      where: {
        requiresNodeId: { in: nodesToRemove.map((n) => n.id) },
        id: { notIn: nodesToRemove.map((n) => n.id) },
      },
    });
    if (requiredByOthers > 0) {
      throw new ClassError(
        `Nie można usunąć węzła w umiejętności "${skill.name}" — jest wymagany przez inny węzeł`,
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
      const nameToId = new Map<string, string>();
      for (const node of skill.nodes) {
        const upserted = await tx.skillTreeNode.upsert({
          where: { classSkillId_name: { classSkillId: classSkill.id, name: node.name } },
          create: { classSkillId: classSkill.id, name: node.name, ...nodeData(node) },
          update: nodeData(node),
        });
        nameToId.set(node.name, upserted.id);
      }
      if (skill.nodes.some((n) => n.requiresNodeName)) {
        await resolveNodeRequirements(tx, skill.nodes, nameToId);
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

/** Writes an uploaded icon to disk under a fresh timestamped filename (avoids serving a
 * stale browser-cached image under a reused URL after re-uploading) and removes the previous
 * one, if any — same convention as modules/admin/items setItemImage. */
async function saveIcon(entityId: string, previousUrl: string | null, buffer: Buffer, mimetype: string) {
  const ext = EXT_BY_MIME[mimetype];
  if (!ext) throw new ClassError("Dozwolone formaty: PNG, JPEG, WEBP, GIF", 400);

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${entityId}-${Date.now()}${ext}`;
  await fs.writeFile(path.join(UPLOADS_DIR, filename), buffer);

  if (previousUrl) {
    await fs.rm(path.join(UPLOADS_DIR, path.basename(previousUrl)), { force: true });
  }

  return `/uploads/skills/${filename}`;
}

/** Sets the icon for a ClassSkill (the skill-tree branch root, rendered as the first tile in
 * SkillsPanel.tsx). Returns the whole parent class, matching updateCharacterClass's shape, so
 * the admin form can refresh its state directly without a second fetch. */
export async function setClassSkillImage(
  skillId: string,
  buffer: Buffer,
  mimetype: string,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.classSkill.findUnique({ where: { id: skillId } });
  if (!existing) throw new ClassError("Nie znaleziono umiejętności", 404);

  const imageUrl = await saveIcon(skillId, existing.imageUrl, buffer, mimetype);
  await prisma.classSkill.update({ where: { id: skillId }, data: { imageUrl } });

  await logAction({
    module: "admin:classes",
    action: "upload_skill_image",
    actorUserId,
    requestId,
    payload: { skillId, imageUrl },
  });

  return prisma.characterClass.findUniqueOrThrow({ where: { id: existing.classId }, include: classInclude });
}

/** Sets the icon for one SkillTreeNode (an upgrade tile within a skill's tree). Same
 * save-first-then-upload flow as items — a node must already exist (i.e. the class has been
 * saved at least once with that node) before its id is known. */
export async function setSkillNodeImage(
  nodeId: string,
  buffer: Buffer,
  mimetype: string,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.skillTreeNode.findUnique({
    where: { id: nodeId },
    include: { classSkill: { select: { classId: true } } },
  });
  if (!existing) throw new ClassError("Nie znaleziono węzła", 404);

  const imageUrl = await saveIcon(nodeId, existing.imageUrl, buffer, mimetype);
  await prisma.skillTreeNode.update({ where: { id: nodeId }, data: { imageUrl } });

  await logAction({
    module: "admin:classes",
    action: "upload_node_image",
    actorUserId,
    requestId,
    payload: { nodeId, imageUrl },
  });

  return prisma.characterClass.findUniqueOrThrow({
    where: { id: existing.classSkill.classId },
    include: classInclude,
  });
}
