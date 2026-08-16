import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { addLootToInventory } from "../inventory/service.js";
import type { BuyFromNpcInput } from "@mmo/shared";

export function listNpcsForZone(zoneId: string) {
  return prisma.npc.findMany({
    where: { zoneId },
    select: {
      id: true,
      name: true,
      kind: true,
      shopItems: {
        select: {
          id: true,
          itemId: true,
          goldPrice: true,
          stock: true,
          item: { select: { id: true, name: true, type: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

export class NpcShopError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export async function buyFromNpc(
  characterId: string,
  input: BuyFromNpcInput,
  userId: string,
  requestId?: string,
) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new NpcShopError("Nie znaleziono postaci", 404);
  }

  const shopItem = await prisma.npcShopItem.findUnique({
    where: { id: input.npcShopItemId },
    include: { npc: true, item: true },
  });
  if (!shopItem) throw new NpcShopError("Nie znaleziono towaru", 404);

  if (character.currentZoneId !== shopItem.npc.zoneId) {
    throw new NpcShopError("Postać musi znajdować się w tej krainie, żeby handlować z tym NPC", 409);
  }

  const totalPrice = shopItem.goldPrice * input.quantity;
  if (character.gold < totalPrice) {
    throw new NpcShopError("Za mało złota", 409);
  }

  if (shopItem.stock !== null) {
    // Atomic guard: only decrement if enough stock remains, avoiding a race between concurrent buyers.
    const decremented = await prisma.npcShopItem.updateMany({
      where: { id: shopItem.id, stock: { gte: input.quantity } },
      data: { stock: { decrement: input.quantity } },
    });
    if (decremented.count === 0) {
      throw new NpcShopError("Za mało towaru na stanie", 409);
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const debited = await tx.character.updateMany({
        where: { id: characterId, gold: { gte: totalPrice } },
        data: { gold: { decrement: totalPrice } },
      });
      if (debited.count === 0) {
        throw new NpcShopError("Za mało złota", 409);
      }
      await addLootToInventory(tx, characterId, shopItem.itemId, input.quantity);
    });
  } catch (err) {
    // Restore stock if the purchase failed after it was reserved above.
    if (shopItem.stock !== null) {
      await prisma.npcShopItem.update({ where: { id: shopItem.id }, data: { stock: { increment: input.quantity } } });
    }
    throw err;
  }

  await logAction({
    module: "npcShop",
    action: "buy",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: { npcShopItemId: shopItem.id, itemId: shopItem.itemId, quantity: input.quantity, totalPrice },
  });

  return { itemId: shopItem.itemId, quantity: input.quantity, totalPrice };
}
