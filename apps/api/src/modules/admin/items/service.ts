import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateItemInput, UpdateItemInput } from "@mmo/shared";

const itemInclude = {
  upgradeRequirements: { include: { requiredItem: { select: { id: true, name: true } } } },
} as const;

export class ItemError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

function serialize<T extends { baseStats: string; maxUpgradeStats: string; possibleStatRanges: string }>(item: T) {
  return {
    ...item,
    baseStats: JSON.parse(item.baseStats) as unknown,
    maxUpgradeStats: JSON.parse(item.maxUpgradeStats) as unknown,
    possibleStatRanges: JSON.parse(item.possibleStatRanges) as unknown,
  };
}

async function assertClassExists(classId: string | null | undefined) {
  if (!classId) return;
  const count = await prisma.characterClass.count({ where: { id: classId } });
  if (count === 0) throw new ItemError("Wskazana klasa nie istnieje", 400);
}

function potionData(input: CreateItemInput) {
  const p = input.potion;
  return {
    potionTrigger: p?.trigger ?? null,
    potionThresholdPct: p?.thresholdPct ?? null,
    potionIntervalSec: p?.intervalSeconds ?? null,
    potionEffect: p?.effect ?? null,
    potionMagnitudePct: p?.magnitudePct ?? null,
    potionDurationSec: p?.durationSeconds ?? null,
  };
}

export async function listItems() {
  const items = await prisma.item.findMany({ include: itemInclude, orderBy: { minLevel: "asc" } });
  return items.map(serialize);
}

export async function getItem(id: string) {
  const item = await prisma.item.findUnique({ where: { id }, include: itemInclude });
  return item ? serialize(item) : null;
}

async function assertUpgradeItemsExist(input: CreateItemInput, selfId?: string) {
  const requiredItemIds = input.upgradeRequirements.map((r) => r.requiredItemId);
  if (selfId && requiredItemIds.includes(selfId)) {
    throw new ItemError("Item nie może wymagać samego siebie do ulepszenia", 400);
  }
  if (!requiredItemIds.length) return;
  const count = await prisma.item.count({ where: { id: { in: requiredItemIds } } });
  if (count !== new Set(requiredItemIds).size) {
    throw new ItemError("Jeden lub więcej materiałów ulepszenia nie istnieje", 400);
  }
}

export async function createItem(input: CreateItemInput, actorUserId: string, requestId?: string) {
  await assertUpgradeItemsExist(input);
  await assertClassExists(input.classId);

  const item = await prisma.item.create({
    data: {
      name: input.name,
      type: input.type,
      minLevel: input.minLevel,
      stackable: input.stackable,
      maxStack: input.maxStack,
      description: input.description,
      baseStats: JSON.stringify(input.baseStats),
      maxUpgradeStats: JSON.stringify(input.maxUpgradeStats),
      possibleStatRanges: JSON.stringify(input.possibleStatRanges),
      classId: input.classId ?? null,
      ...potionData(input),
      upgradeRequirements: {
        create: input.upgradeRequirements.map((r) => ({
          targetLevel: r.targetLevel,
          requiredItemId: r.requiredItemId,
          requiredQty: r.requiredQty,
        })),
      },
    },
    include: itemInclude,
  });

  await logAction({
    module: "admin:items",
    action: "create",
    actorUserId,
    requestId,
    payload: { itemId: item.id, name: item.name },
  });

  return serialize(item);
}

export async function updateItem(
  id: string,
  input: UpdateItemInput,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.item.findUnique({ where: { id } });
  if (!existing) throw new ItemError("Nie znaleziono itemu", 404);

  await assertUpgradeItemsExist(input, id);
  await assertClassExists(input.classId);

  const item = await prisma.$transaction(async (tx) => {
    await tx.itemUpgradeRequirement.deleteMany({ where: { itemId: id } });
    return tx.item.update({
      where: { id },
      data: {
        name: input.name,
        type: input.type,
        minLevel: input.minLevel,
        stackable: input.stackable,
        maxStack: input.maxStack,
        description: input.description,
        baseStats: JSON.stringify(input.baseStats),
        maxUpgradeStats: JSON.stringify(input.maxUpgradeStats),
        possibleStatRanges: JSON.stringify(input.possibleStatRanges),
        classId: input.classId ?? null,
        ...potionData(input),
        upgradeRequirements: {
          create: input.upgradeRequirements.map((r) => ({
            targetLevel: r.targetLevel,
            requiredItemId: r.requiredItemId,
            requiredQty: r.requiredQty,
          })),
        },
      },
      include: itemInclude,
    });
  });

  await logAction({
    module: "admin:items",
    action: "update",
    actorUserId,
    requestId,
    payload: { itemId: item.id, name: item.name },
  });

  return serialize(item);
}

export async function deleteItem(id: string, actorUserId: string, requestId?: string) {
  const existing = await prisma.item.findUnique({ where: { id } });
  if (!existing) throw new ItemError("Nie znaleziono itemu", 404);

  const [inMonsterDrops, inZoneDrops, inInventory, inUpgradeMaterial] = await Promise.all([
    prisma.monsterDrop.count({ where: { itemId: id } }),
    prisma.zoneDrop.count({ where: { itemId: id } }),
    prisma.inventoryItem.count({ where: { itemId: id } }),
    prisma.itemUpgradeRequirement.count({ where: { requiredItemId: id } }),
  ]);

  if (inMonsterDrops || inZoneDrops || inInventory || inUpgradeMaterial) {
    throw new ItemError(
      "Nie można usunąć itemu, który jest używany w dropach, ekwipunku graczy lub jako materiał ulepszenia",
      409,
    );
  }

  await prisma.item.delete({ where: { id } });

  await logAction({
    module: "admin:items",
    action: "delete",
    actorUserId,
    requestId,
    payload: { itemId: id, name: existing.name },
  });
}
