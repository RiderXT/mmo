import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateItemInput, UpdateItemInput } from "@mmo/shared";

// Relative to cwd (apps/api/), matching how app.ts serves it at /uploads/.
const UPLOADS_DIR = path.join(process.cwd(), "uploads", "items");
const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const itemInclude = {
  upgradeRequirements: { include: { requiredItem: { select: { id: true, name: true } } } },
  upgradeLevelConfigs: true,
  chestLootEntries: { include: { rewardItem: { select: { id: true, name: true } } } },
} as const;

export class ItemError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

function serialize<
  T extends { baseStats: string; maxUpgradeStats: string; possibleStatRanges: string; chestLootEntries?: unknown },
>(item: T) {
  const { chestLootEntries, ...rest } = item;
  return {
    ...rest,
    baseStats: JSON.parse(item.baseStats) as unknown,
    maxUpgradeStats: JSON.parse(item.maxUpgradeStats) as unknown,
    possibleStatRanges: JSON.parse(item.possibleStatRanges) as unknown,
    chestLoot: chestLootEntries ?? [],
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

function gatherData(input: CreateItemInput) {
  return {
    gatherSpeedBonusPctMax: input.gatherSpeedBonusPctMax ?? null,
    gatherChanceBonusPctMax: input.gatherChanceBonusPctMax ?? null,
    baitChanceBonusPct: input.baitChanceBonusPct ?? null,
  };
}

function bookData(input: CreateItemInput) {
  return {
    bookSkillTypeId: input.bookSkillTypeId ?? null,
    bookSuccessChance: input.bookSuccessChance ?? null,
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

async function assertChestLootItemsExist(input: CreateItemInput, selfId?: string) {
  const rewardItemIds = input.chestLoot.map((c) => c.rewardItemId);
  if (selfId && rewardItemIds.includes(selfId)) {
    throw new ItemError("Skrzynia nie może zawierać samej siebie", 400);
  }
  if (!rewardItemIds.length) return;
  const count = await prisma.item.count({ where: { id: { in: rewardItemIds } } });
  if (count !== new Set(rewardItemIds).size) {
    throw new ItemError("Jeden lub więcej przedmiotów w zawartości skrzyni nie istnieje", 400);
  }
}

export async function createItem(input: CreateItemInput, actorUserId: string, requestId?: string) {
  await assertUpgradeItemsExist(input);
  await assertChestLootItemsExist(input);
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
      sellPrice: input.sellPrice,
      gridWidth: input.gridWidth,
      ...potionData(input),
      ...gatherData(input),
      ...bookData(input),
      upgradeRequirements: {
        create: input.upgradeRequirements.map((r) => ({
          targetLevel: r.targetLevel,
          requiredItemId: r.requiredItemId,
          requiredQty: r.requiredQty,
        })),
      },
      upgradeLevelConfigs: {
        create: input.upgradeLevelConfigs.map((c) => ({
          targetLevel: c.targetLevel,
          successChance: c.successChance,
          goldCost: c.goldCost,
        })),
      },
      chestLootEntries: {
        create: input.chestLoot.map((c) => ({
          rewardItemId: c.rewardItemId,
          dropChance: c.dropChance,
          minQty: c.minQty,
          maxQty: c.maxQty,
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
  await assertChestLootItemsExist(input, id);
  await assertClassExists(input.classId);

  const item = await prisma.$transaction(async (tx) => {
    await tx.itemUpgradeRequirement.deleteMany({ where: { itemId: id } });
    await tx.itemUpgradeLevelConfig.deleteMany({ where: { itemId: id } });
    await tx.chestLoot.deleteMany({ where: { chestItemId: id } });
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
        sellPrice: input.sellPrice,
        gridWidth: input.gridWidth,
        ...potionData(input),
        ...gatherData(input),
        upgradeRequirements: {
          create: input.upgradeRequirements.map((r) => ({
            targetLevel: r.targetLevel,
            requiredItemId: r.requiredItemId,
            requiredQty: r.requiredQty,
          })),
        },
        upgradeLevelConfigs: {
          create: input.upgradeLevelConfigs.map((c) => ({
            targetLevel: c.targetLevel,
            successChance: c.successChance,
            goldCost: c.goldCost,
          })),
        },
        chestLootEntries: {
          create: input.chestLoot.map((c) => ({
            rewardItemId: c.rewardItemId,
            dropChance: c.dropChance,
            minQty: c.minQty,
            maxQty: c.maxQty,
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

  const [inMonsterDrops, inZoneDrops, inInventory, inUpgradeMaterial, inChestLootReward, inClassStarterItem] =
    await Promise.all([
      prisma.monsterDrop.count({ where: { itemId: id } }),
      prisma.zoneDrop.count({ where: { itemId: id } }),
      prisma.inventoryItem.count({ where: { itemId: id } }),
      prisma.itemUpgradeRequirement.count({ where: { requiredItemId: id } }),
      prisma.chestLoot.count({ where: { rewardItemId: id } }),
      prisma.classStarterItem.count({ where: { itemId: id } }),
    ]);

  if (inMonsterDrops || inZoneDrops || inInventory || inUpgradeMaterial || inChestLootReward || inClassStarterItem) {
    throw new ItemError(
      "Nie można usunąć itemu, który jest używany w dropach, ekwipunku graczy, jako materiał ulepszenia, jako zawartość skrzyni lub jako przedmiot startowy klasy",
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

/** Saves an uploaded image for an item, replacing (and deleting) any previous one — a fresh
 * filename per upload (itemId + timestamp) avoids serving a stale browser-cached image under a
 * reused URL after re-uploading. */
export async function setItemImage(
  id: string,
  buffer: Buffer,
  mimetype: string,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.item.findUnique({ where: { id } });
  if (!existing) throw new ItemError("Nie znaleziono itemu", 404);

  const ext = EXT_BY_MIME[mimetype];
  if (!ext) throw new ItemError("Dozwolone formaty: PNG, JPEG, WEBP, GIF", 400);

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${id}-${Date.now()}${ext}`;
  await fs.writeFile(path.join(UPLOADS_DIR, filename), buffer);

  if (existing.imageUrl) {
    await fs.rm(path.join(UPLOADS_DIR, path.basename(existing.imageUrl)), { force: true });
  }

  const imageUrl = `/uploads/items/${filename}`;
  const item = await prisma.item.update({ where: { id }, data: { imageUrl }, include: itemInclude });

  await logAction({
    module: "admin:items",
    action: "upload_image",
    actorUserId,
    requestId,
    payload: { itemId: id, imageUrl },
  });

  return serialize(item);
}
