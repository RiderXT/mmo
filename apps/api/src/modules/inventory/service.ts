import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import type { EquipSlot, ItemType, StatRange } from "@mmo/shared";

export class InventoryError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

// Item type maps 1:1 onto its equip slot.
const EQUIPPABLE_SLOTS_BY_TYPE: Partial<Record<ItemType, EquipSlot[]>> = {
  weapon: ["weapon"],
  armor: ["armor"],
  helmet: ["helmet"],
  boots: ["boots"],
  necklace: ["necklace"],
  earrings: ["earrings"],
  ring: ["ring"],
};

function serializeInventoryItem<T extends { rolledStats: string }>(item: T) {
  return { ...item, rolledStats: JSON.parse(item.rolledStats) as unknown };
}

async function assertCharacterOwnership(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new InventoryError("Nie znaleziono postaci", 404);
  }
  return character;
}

export async function listInventory(characterId: string, userId: string) {
  await assertCharacterOwnership(characterId, userId);
  const items = await prisma.inventoryItem.findMany({
    where: { characterId },
    include: { item: true },
    orderBy: { slotIndex: "asc" },
  });
  return items.map((i) => ({
    ...serializeInventoryItem(i),
    item: { ...i.item, baseStats: JSON.parse(i.item.baseStats), possibleStatRanges: JSON.parse(i.item.possibleStatRanges) },
  }));
}

export async function moveItem(
  input: { characterId: string; inventoryItemId: string; toSlotIndex: number },
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(input.characterId, userId);

  const moving = await prisma.inventoryItem.findUnique({ where: { id: input.inventoryItemId } });
  if (!moving || moving.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }

  const occupant = await prisma.inventoryItem.findUnique({
    where: { characterId_slotIndex: { characterId: input.characterId, slotIndex: input.toSlotIndex } },
  });

  await prisma.$transaction(async (tx) => {
    if (occupant && occupant.id !== moving.id) {
      // free the target slot first (temp negative slot) to avoid unique constraint clash, then swap
      await tx.inventoryItem.update({ where: { id: moving.id }, data: { slotIndex: -1 } });
      await tx.inventoryItem.update({ where: { id: occupant.id }, data: { slotIndex: moving.slotIndex } });
      await tx.inventoryItem.update({ where: { id: moving.id }, data: { slotIndex: input.toSlotIndex } });
    } else {
      await tx.inventoryItem.update({ where: { id: moving.id }, data: { slotIndex: input.toSlotIndex } });
    }
  });

  await logAction({
    module: "inventory",
    action: "move",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, toSlotIndex: input.toSlotIndex },
  });
}

export async function equipItem(
  input: { characterId: string; inventoryItemId: string; equipSlot: EquipSlot },
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(input.characterId, userId);

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { item: true },
  });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }

  const allowedSlots = EQUIPPABLE_SLOTS_BY_TYPE[inventoryItem.item.type as ItemType];
  if (!allowedSlots || !allowedSlots.includes(input.equipSlot)) {
    throw new InventoryError("Tego przedmiotu nie można założyć w tym slocie", 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.updateMany({
      where: { characterId: input.characterId, equippedSlot: input.equipSlot },
      data: { equippedSlot: null },
    });
    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { equippedSlot: input.equipSlot },
    });
  });

  await logAction({
    module: "inventory",
    action: "equip",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, equipSlot: input.equipSlot },
  });
}

export async function unequipItem(
  input: { characterId: string; inventoryItemId: string },
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(input.characterId, userId);

  const inventoryItem = await prisma.inventoryItem.findUnique({ where: { id: input.inventoryItemId } });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }

  await prisma.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: { equippedSlot: null },
  });

  await logAction({
    module: "inventory",
    action: "unequip",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId },
  });
}

export async function setActiveSlot(
  input: { characterId: string; inventoryItemId: string; slotIndex: number },
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(input.characterId, userId);

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { item: true },
  });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }
  if (inventoryItem.item.type !== "consumable") {
    throw new InventoryError("Tylko przedmioty typu consumable można umieścić w aktywnym slocie", 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.updateMany({
      where: { characterId: input.characterId, activeSlotIndex: input.slotIndex },
      data: { activeSlotIndex: null },
    });
    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { activeSlotIndex: input.slotIndex },
    });
  });

  await logAction({
    module: "inventory",
    action: "set_active_slot",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, slotIndex: input.slotIndex },
  });
}

export async function clearActiveSlot(
  input: { characterId: string; inventoryItemId: string },
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(input.characterId, userId);

  const inventoryItem = await prisma.inventoryItem.findUnique({ where: { id: input.inventoryItemId } });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }

  await prisma.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: { activeSlotIndex: null },
  });

  await logAction({
    module: "inventory",
    action: "clear_active_slot",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId },
  });
}

export async function upgradeItem(
  input: { characterId: string; inventoryItemId: string },
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(input.characterId, userId);

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { item: true },
  });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }

  const requirements = await prisma.itemUpgradeRequirement.findMany({
    where: { itemId: inventoryItem.itemId, targetLevel: inventoryItem.upgradeLevel + 1 },
  });
  if (requirements.length === 0) {
    throw new InventoryError("Brak zdefiniowanej ścieżki ulepszenia dla tego poziomu", 400);
  }

  const stacksByRequiredItem = new Map<string, { id: string; quantity: number }[]>();
  for (const req of requirements) {
    const stacks = await prisma.inventoryItem.findMany({
      where: { characterId: input.characterId, itemId: req.requiredItemId },
      orderBy: { quantity: "asc" },
    });
    const total = stacks.reduce((sum, s) => sum + s.quantity, 0);
    if (total < req.requiredQty) {
      throw new InventoryError("Brak wymaganych materiałów do ulepszenia", 409);
    }
    stacksByRequiredItem.set(req.requiredItemId, stacks);
  }

  await prisma.$transaction(async (tx) => {
    for (const req of requirements) {
      let remaining = req.requiredQty;
      const stacks = stacksByRequiredItem.get(req.requiredItemId)!;
      for (const stack of stacks) {
        if (remaining <= 0) break;
        const consume = Math.min(stack.quantity, remaining);
        remaining -= consume;
        if (consume >= stack.quantity) {
          await tx.inventoryItem.delete({ where: { id: stack.id } });
        } else {
          await tx.inventoryItem.update({
            where: { id: stack.id },
            data: { quantity: stack.quantity - consume },
          });
        }
      }
    }

    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { upgradeLevel: inventoryItem.upgradeLevel + 1 },
    });
  });

  await logAction({
    module: "inventory",
    action: "upgrade",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, newLevel: inventoryItem.upgradeLevel + 1 },
  });

  return { newLevel: inventoryItem.upgradeLevel + 1 };
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Weighted sample without replacement of up to `count` stat ranges, each rolled to a concrete value. */
function rollItemStats(possibleStatRanges: StatRange[], count = 3): Record<string, number> {
  const pool = [...possibleStatRanges];
  const picked: StatRange[] = [];

  while (pool.length && picked.length < count) {
    const totalWeight = pool.reduce((sum, r) => sum + r.weight, 0);
    let roll = Math.random() * totalWeight;
    let index = 0;
    for (; index < pool.length; index++) {
      roll -= pool[index].weight;
      if (roll <= 0) break;
    }
    const [chosen] = pool.splice(Math.min(index, pool.length - 1), 1);
    picked.push(chosen);
  }

  const stats: Record<string, number> = {};
  for (const range of picked) {
    stats[range.stat] = randomInt(Math.round(range.min), Math.round(range.max));
  }
  return stats;
}

async function findNextFreeSlotIndex(tx: Prisma.TransactionClient, characterId: string): Promise<number> {
  const used = await tx.inventoryItem.findMany({ where: { characterId }, select: { slotIndex: true } });
  const usedSet = new Set(used.map((u) => u.slotIndex));
  const MAX_SLOTS = 500;
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (!usedSet.has(i)) return i;
  }
  throw new InventoryError("Ekwipunek jest pełny", 409);
}

/** Adds looted item(s) to a character's inventory: stacks where possible, otherwise creates new slots with freshly-rolled stats. Must run inside the same transaction as the reward grant it belongs to. */
export async function addLootToInventory(
  tx: Prisma.TransactionClient,
  characterId: string,
  itemId: string,
  quantity: number,
): Promise<void> {
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item || quantity <= 0) return;

  if (item.stackable) {
    let remaining = quantity;
    const existingStacks = await tx.inventoryItem.findMany({
      where: { characterId, itemId, equippedSlot: null },
      orderBy: { quantity: "desc" },
    });

    for (const stack of existingStacks) {
      if (remaining <= 0) break;
      const room = item.maxStack - stack.quantity;
      if (room <= 0) continue;
      const add = Math.min(room, remaining);
      await tx.inventoryItem.update({ where: { id: stack.id }, data: { quantity: stack.quantity + add } });
      remaining -= add;
    }

    while (remaining > 0) {
      const slotIndex = await findNextFreeSlotIndex(tx, characterId);
      const add = Math.min(item.maxStack, remaining);
      await tx.inventoryItem.create({
        data: { characterId, itemId, slotIndex, quantity: add, rolledStats: JSON.stringify({}) },
      });
      remaining -= add;
    }
  } else {
    const possibleStatRanges = JSON.parse(item.possibleStatRanges) as StatRange[];
    for (let i = 0; i < quantity; i++) {
      const slotIndex = await findNextFreeSlotIndex(tx, characterId);
      await tx.inventoryItem.create({
        data: {
          characterId,
          itemId,
          slotIndex,
          quantity: 1,
          rolledStats: JSON.stringify(rollItemStats(possibleStatRanges)),
        },
      });
    }
  }
}
