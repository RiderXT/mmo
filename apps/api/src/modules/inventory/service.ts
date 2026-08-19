import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { getGatheringSettings } from "../settings/service.js";
import {
  defaultUpgradeSuccessChance,
  defaultUpgradeGoldCost,
  inventoryOccupiedRange,
  type EquipSlot,
  type ItemType,
  type StatRange,
} from "@mmo/shared";

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
  shield: ["shield"],
  necklace: ["necklace"],
  earrings: ["earrings"],
  ring: ["ring"],
  rod: ["rod"],
  pickaxe: ["pickaxe"],
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
    include: { item: { include: { class: { select: { id: true, name: true } } } } },
    orderBy: { slotIndex: "asc" },
  });
  return items.map((i) => ({
    ...serializeInventoryItem(i),
    item: {
      ...i.item,
      baseStats: JSON.parse(i.item.baseStats),
      maxUpgradeStats: JSON.parse(i.item.maxUpgradeStats),
      possibleStatRanges: JSON.parse(i.item.possibleStatRanges),
    },
  }));
}

export async function moveItem(
  input: { characterId: string; inventoryItemId: string; toSlotIndex: number },
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(input.characterId, userId);

  const moving = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { item: { select: { gridWidth: true, stackable: true, maxStack: true } } },
  });
  if (!moving || moving.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }
  if (moving.slotIndex === null) {
    // Equipped/active-slotted items aren't in the grid — they leave via unequip/clear-active-slot,
    // not a plain move.
    throw new InventoryError("Ten przedmiot nie jest w plecaku", 400);
  }

  const width = moving.item.gridWidth;
  const targetRange = inventoryOccupiedRange(input.toSlotIndex, width);
  if (!targetRange) {
    throw new InventoryError("Przedmiot nie mieści się w tym miejscu (wychodzi poza wiersz)", 400);
  }

  // Grid-placed items only — equipped/active-slot items have slotIndex: null and can't collide.
  // Width>1 items have no DB row for their extra cell(s), so every candidate's range must be
  // expanded from its own primary slotIndex + gridWidth to catch those too.
  const others = await prisma.inventoryItem.findMany({
    where: { characterId: input.characterId, slotIndex: { not: null }, id: { not: moving.id } },
    include: { item: { select: { gridWidth: true } } },
  });
  const overlapping = others.filter((o) => {
    const range = inventoryOccupiedRange(o.slotIndex!, o.item.gridWidth) ?? [o.slotIndex!];
    return range.some((c) => targetRange.includes(c));
  });

  await prisma.$transaction(async (tx) => {
    if (overlapping.length === 0) {
      await tx.inventoryItem.update({ where: { id: moving.id }, data: { slotIndex: input.toSlotIndex } });
    } else if (overlapping.length === 1 && overlapping[0].itemId === moving.itemId && moving.item.stackable) {
      // Same stackable item dropped on itself — merge quantities instead of swapping/rejecting.
      // Whatever doesn't fit under maxStack stays behind in the source stack.
      const occupant = overlapping[0];
      const maxStack = moving.item.maxStack;
      const combined = moving.quantity + occupant.quantity;
      if (combined <= maxStack) {
        await tx.inventoryItem.update({ where: { id: occupant.id }, data: { quantity: combined } });
        await tx.inventoryItem.delete({ where: { id: moving.id } });
      } else {
        await tx.inventoryItem.update({ where: { id: occupant.id }, data: { quantity: maxStack } });
        await tx.inventoryItem.update({
          where: { id: moving.id },
          data: { quantity: combined - maxStack },
        });
      }
    } else if (
      overlapping.length === 1 &&
      width === 1 &&
      overlapping[0].item.gridWidth === 1 &&
      overlapping[0].slotIndex === input.toSlotIndex
    ) {
      // Classic single-cell swap — both items are 1-wide and exactly trade places. Wider items
      // never swap: an ambiguous partial overlap is rejected instead (see else branch).
      const occupant = overlapping[0];
      await tx.inventoryItem.update({ where: { id: moving.id }, data: { slotIndex: null } });
      await tx.inventoryItem.update({ where: { id: occupant.id }, data: { slotIndex: moving.slotIndex } });
      await tx.inventoryItem.update({ where: { id: moving.id }, data: { slotIndex: input.toSlotIndex } });
    } else {
      throw new InventoryError("Docelowe miejsce jest zajęte", 409);
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
  const owner = await assertCharacterOwnership(input.characterId, userId);

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

  if (inventoryItem.item.classId && inventoryItem.item.classId !== owner.classId) {
    throw new InventoryError("Ten przedmiot jest dostępny tylko dla innej klasy postaci", 400);
  }

  await prisma.$transaction(async (tx) => {
    // Whatever was previously worn in this slot must go back to a real grid cell — it must NOT
    // just have equippedSlot cleared, or it ends up with equippedSlot: null AND slotIndex: null,
    // invisible in both the doll and the grid (this was a real bug: equipping a second weapon
    // made the first one vanish instead of returning to the backpack).
    const previouslyEquipped = await tx.inventoryItem.findFirst({
      where: { characterId: input.characterId, equippedSlot: input.equipSlot },
      include: { item: { select: { gridWidth: true } } },
    });
    if (previouslyEquipped && previouslyEquipped.id !== inventoryItem.id) {
      const freeSlot = await findNextFreeSlotIndex(tx, input.characterId, previouslyEquipped.item.gridWidth);
      await tx.inventoryItem.update({
        where: { id: previouslyEquipped.id },
        data: { equippedSlot: null, slotIndex: freeSlot },
      });
    }
    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      // Free the grid cell(s) it was sitting in — an equipped item no longer occupies a slot.
      data: { equippedSlot: input.equipSlot, slotIndex: null },
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

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { item: { select: { gridWidth: true } } },
  });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }

  await prisma.$transaction(async (tx) => {
    const slotIndex = await findNextFreeSlotIndex(tx, input.characterId, inventoryItem.item.gridWidth);
    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { equippedSlot: null, slotIndex },
    });
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
  if (inventoryItem.item.type !== "consumable" && inventoryItem.item.type !== "bait") {
    throw new InventoryError("Tylko mikstury i przynęty można umieścić w aktywnym slocie", 400);
  }

  await prisma.$transaction(async (tx) => {
    // Same fix as equipItem: whatever previously sat in this active slot must go back to a real
    // grid cell, not just have activeSlotIndex cleared (else it ends up invisible: activeSlotIndex
    // null AND slotIndex null).
    const previouslyActive = await tx.inventoryItem.findFirst({
      where: { characterId: input.characterId, activeSlotIndex: input.slotIndex },
      include: { item: { select: { gridWidth: true } } },
    });
    if (previouslyActive && previouslyActive.id !== inventoryItem.id) {
      const freeSlot = await findNextFreeSlotIndex(tx, input.characterId, previouslyActive.item.gridWidth);
      await tx.inventoryItem.update({
        where: { id: previouslyActive.id },
        data: { activeSlotIndex: null, slotIndex: freeSlot },
      });
    }
    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      // Free the grid cell — an active-slotted item no longer occupies one.
      data: { activeSlotIndex: input.slotIndex, slotIndex: null },
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

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { item: { select: { gridWidth: true } } },
  });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }

  await prisma.$transaction(async (tx) => {
    const slotIndex = await findNextFreeSlotIndex(tx, input.characterId, inventoryItem.item.gridWidth);
    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { activeSlotIndex: null, slotIndex },
    });
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

/** Lets the player pick a per-slot HP/MP threshold for a hp_below/mana_below potion instead of
 * always using the item's admin-configured default (Item.potionThresholdPct) — read back by
 * gatherCombatBuild in modules/expeditions/service.ts. Rejected for potions with no threshold
 * trigger (interval-based, or non-potions) since there'd be nothing for the override to affect. */
export async function setPotionThresholdOverride(
  input: { characterId: string; inventoryItemId: string; thresholdPct: number | null },
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(input.characterId, userId);

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { item: { select: { potionTrigger: true } } },
  });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }
  if (inventoryItem.item.potionTrigger !== "hp_below" && inventoryItem.item.potionTrigger !== "mana_below") {
    throw new InventoryError("Ten przedmiot nie ma progu użycia do ustawienia", 400);
  }

  await prisma.inventoryItem.update({
    where: { id: inventoryItem.id },
    data: { potionThresholdOverridePct: input.thresholdPct },
  });

  await logAction({
    module: "inventory",
    action: "set_potion_threshold",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, thresholdPct: input.thresholdPct },
  });
}

export async function upgradeItem(
  input: { characterId: string; inventoryItemId: string },
  userId: string,
  requestId?: string,
) {
  const owner = await assertCharacterOwnership(input.characterId, userId);

  const inventoryItem = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { item: true },
  });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }

  // Rod/pickaxe upgrades are additionally gated behind actual use — a fresh tool can't be
  // power-leveled purely with gold/materials, it has to prove itself gathering first. The counter
  // resets to 0 below on a successful upgrade (see the success branch further down).
  if (inventoryItem.item.type === "rod" || inventoryItem.item.type === "pickaxe") {
    const { successesPerToolUpgrade } = await getGatheringSettings();
    if (inventoryItem.gatherSuccessCount < successesPerToolUpgrade) {
      throw new InventoryError(
        `Potrzeba jeszcze ${successesPerToolUpgrade - inventoryItem.gatherSuccessCount} udanych zbiórek tym narzędziem (${inventoryItem.gatherSuccessCount}/${successesPerToolUpgrade}).`,
        400,
      );
    }
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

  const targetLevel = inventoryItem.upgradeLevel + 1;
  const levelConfig = await prisma.itemUpgradeLevelConfig.findUnique({
    where: { itemId_targetLevel: { itemId: inventoryItem.itemId, targetLevel } },
  });
  const chance = levelConfig?.successChance ?? defaultUpgradeSuccessChance(targetLevel);
  const goldCost = levelConfig?.goldCost ?? defaultUpgradeGoldCost(targetLevel);
  if (owner.gold < goldCost) {
    throw new InventoryError("Za mało złota na ulepszenie", 409);
  }
  // Gold and materials are always consumed on an upgrade attempt, win or lose — rolled before the
  // transaction so the same outcome is used for the gold/material consumption and the level bump
  // (or, on failure, the item's destruction — see below).
  const success = Math.random() < chance;

  await prisma.$transaction(async (tx) => {
    await tx.character.update({
      where: { id: input.characterId },
      data: { gold: { decrement: goldCost } },
    });

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

    if (success) {
      await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        // Reset the gather-success counter (only meaningful for rod/pickaxe — harmless no-op
        // write for every other item type) so the next upgrade level requires fresh proof of use.
        data: { upgradeLevel: targetLevel, gatherSuccessCount: 0 },
      });
    } else {
      // On failure the item itself is destroyed, not just the materials/gold — upgrading is a
      // real risk, not a free retry.
      await tx.inventoryItem.delete({ where: { id: inventoryItem.id } });
    }
  });

  await logAction({
    module: "inventory",
    action: "upgrade",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, targetLevel, chance, goldCost, success },
  });

  return {
    success,
    newLevel: success ? targetLevel : inventoryItem.upgradeLevel,
    chance,
    goldCost,
    itemDestroyed: !success,
  };
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Opens one chest from the stack: rolls each ChestLoot row independently (dropChance:1 =
 * guaranteed), awards hits via the same addLootToInventory used by real monster drops, and
 * consumes one unit of the chest itself. */
export async function openChest(
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
  if (inventoryItem.item.type !== "chest") {
    throw new InventoryError("Ten przedmiot nie jest skrzynią", 400);
  }

  const lootRows = await prisma.chestLoot.findMany({ where: { chestItemId: inventoryItem.itemId } });
  const awarded: { itemId: string; quantity: number }[] = [];
  for (const row of lootRows) {
    if (Math.random() < row.dropChance) {
      awarded.push({ itemId: row.rewardItemId, quantity: randomInt(row.minQty, row.maxQty) });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (inventoryItem.quantity <= 1) {
      await tx.inventoryItem.delete({ where: { id: inventoryItem.id } });
    } else {
      await tx.inventoryItem.update({ where: { id: inventoryItem.id }, data: { quantity: inventoryItem.quantity - 1 } });
    }
    for (const a of awarded) {
      await addLootToInventory(tx, input.characterId, a.itemId, a.quantity);
    }
    await tx.character.update({ where: { id: input.characterId }, data: { chestsOpened: { increment: 1 } } });
  });

  await logAction({
    module: "inventory",
    action: "open_chest",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, awarded },
  });

  return { awarded };
}

/** Sells the whole stack for item.sellPrice × quantity gold. Equipped items must be unequipped
 * first — selling straight out of a slot is a common source of accidental gear loss in games
 * with this pattern, so it's blocked here rather than silently unequipping. */
export async function sellItem(
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
  if (inventoryItem.equippedSlot) {
    throw new InventoryError("Zdejmij przedmiot przed sprzedażą", 400);
  }
  if (inventoryItem.item.sellPrice <= 0) {
    throw new InventoryError("Ten przedmiot nie ma ustalonej wartości sprzedaży", 400);
  }

  const goldEarned = inventoryItem.item.sellPrice * inventoryItem.quantity;

  await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.delete({ where: { id: inventoryItem.id } });
    await tx.character.update({
      where: { id: input.characterId },
      data: { gold: { increment: goldEarned } },
    });
  });

  await logAction({
    module: "inventory",
    action: "sell",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, itemId: inventoryItem.itemId, quantity: inventoryItem.quantity, goldEarned },
  });

  return { goldEarned };
}

/** Permanently removes an item stack from the inventory with no reward — for junk the player
 * wants gone. Equipped items must be unequipped first (same reasoning as sellItem). */
export async function discardItem(
  input: { characterId: string; inventoryItemId: string },
  userId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(input.characterId, userId);

  const inventoryItem = await prisma.inventoryItem.findUnique({ where: { id: input.inventoryItemId } });
  if (!inventoryItem || inventoryItem.characterId !== input.characterId) {
    throw new InventoryError("Nie znaleziono przedmiotu", 404);
  }
  if (inventoryItem.equippedSlot) {
    throw new InventoryError("Zdejmij przedmiot przed usunięciem", 400);
  }

  await prisma.inventoryItem.delete({ where: { id: inventoryItem.id } });

  await logAction({
    module: "inventory",
    action: "discard",
    actorUserId: userId,
    actorCharacterId: input.characterId,
    requestId,
    payload: { inventoryItemId: input.inventoryItemId, itemId: inventoryItem.itemId, quantity: inventoryItem.quantity },
  });
}

/** A narrow range (e.g. critChance 0.01-0.03) is a fractional/percentage stat and must not be
 * rounded to an integer first — that would floor it to 0. A wide range (e.g. attack 20-40) is
 * a whole-number stat and should roll a clean integer, not a stray float like 23.647. */
function randomInRange(min: number, max: number): number {
  if (Math.abs(max - min) < 2) {
    return Math.round((min + Math.random() * (max - min)) * 10000) / 10000;
  }
  return randomInt(Math.round(min), Math.round(max));
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
    stats[range.stat] = randomInRange(range.min, range.max);
  }
  return stats;
}

async function findNextFreeSlotIndex(
  tx: Prisma.TransactionClient,
  characterId: string,
  width: number,
): Promise<number> {
  // Equipped/active-slotted items have slotIndex: null (see equipItem/setActiveSlot) and don't
  // occupy a grid cell at all, so they're skipped here.
  const existing = await tx.inventoryItem.findMany({
    where: { characterId, slotIndex: { not: null } },
    select: { slotIndex: true, item: { select: { gridWidth: true } } },
  });
  const occupied = new Set<number>();
  for (const e of existing) {
    for (const cell of inventoryOccupiedRange(e.slotIndex!, e.item.gridWidth) ?? [e.slotIndex!]) {
      occupied.add(cell);
    }
  }

  const MAX_SLOTS = 500;
  for (let i = 0; i < MAX_SLOTS; i++) {
    const range = inventoryOccupiedRange(i, width);
    if (!range) continue; // would spill past this row — not a valid start position
    if (range.every((cell) => !occupied.has(cell))) return i;
  }
  throw new InventoryError("Ekwipunek jest pełny", 409);
}

/** Adds looted item(s) to a character's inventory: stacks where possible, otherwise creates new
 * slots with freshly-rolled stats. Must run inside the same transaction as the reward grant it
 * belongs to.
 *
 * By default (allowPartial: false) a full inventory throws InventoryError(409) and — since this
 * always runs inside the caller's transaction — the whole transaction rolls back atomically. That
 * is the right behavior for a deliberate player action (buying from an NPC, opening a chest):
 * nothing is granted, nothing is consumed, the player just sees "ekwipunek jest pełny" and keeps
 * what they had.
 *
 * Pass allowPartial: true for background/passive rewards (expedition claim, gathering) where the
 * rest of the reward (exp, gold, other loot rows) must NOT be lost just because the bag is full —
 * this grants as much as fits and reports the rest as `overflow` instead of throwing. */
export async function addLootToInventory(
  tx: Prisma.TransactionClient,
  characterId: string,
  itemId: string,
  quantity: number,
  options: { allowPartial?: boolean } = {},
): Promise<{ granted: number; overflow: number }> {
  const item = await tx.item.findUnique({ where: { id: itemId } });
  if (!item || quantity <= 0) return { granted: 0, overflow: 0 };

  const allowPartial = options.allowPartial ?? false;
  async function nextFreeSlot(width: number): Promise<number | null> {
    try {
      return await findNextFreeSlotIndex(tx, characterId, width);
    } catch (err) {
      if (allowPartial && err instanceof InventoryError && err.statusCode === 409) return null;
      throw err;
    }
  }

  let granted = 0;

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
      granted += add;
    }

    while (remaining > 0) {
      const slotIndex = await nextFreeSlot(item.gridWidth);
      if (slotIndex === null) break;
      const add = Math.min(item.maxStack, remaining);
      await tx.inventoryItem.create({
        data: { characterId, itemId, slotIndex, quantity: add, rolledStats: JSON.stringify({}) },
      });
      remaining -= add;
      granted += add;
    }
  } else {
    const possibleStatRanges = JSON.parse(item.possibleStatRanges) as StatRange[];
    for (let i = 0; i < quantity; i++) {
      const slotIndex = await nextFreeSlot(item.gridWidth);
      if (slotIndex === null) break;
      await tx.inventoryItem.create({
        data: {
          characterId,
          itemId,
          slotIndex,
          quantity: 1,
          rolledStats: JSON.stringify(rollItemStats(possibleStatRanges)),
        },
      });
      granted += 1;
    }
  }

  return { granted, overflow: quantity - granted };
}
