import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateNpcInput, UpdateNpcInput } from "@mmo/shared";

const npcInclude = {
  zone: { select: { id: true, name: true, isTown: true } },
  shopItems: { include: { item: { select: { id: true, name: true, type: true } } } },
} as const;

export function listNpcs() {
  return prisma.npc.findMany({ include: npcInclude, orderBy: { name: "asc" } });
}

export function getNpc(id: string) {
  return prisma.npc.findUnique({ where: { id }, include: npcInclude });
}

export class NpcError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

async function assertZoneAndItemsExist(input: CreateNpcInput) {
  const zone = await prisma.zone.findUnique({ where: { id: input.zoneId } });
  if (!zone) throw new NpcError("Nie znaleziono krainy", 400);

  const itemIds = input.shopItems.map((s) => s.itemId);
  if (itemIds.length) {
    const count = await prisma.item.count({ where: { id: { in: itemIds } } });
    if (count !== new Set(itemIds).size) {
      throw new NpcError("Jeden lub więcej wskazanych itemów nie istnieje", 400);
    }
  }
}

export async function createNpc(input: CreateNpcInput, actorUserId: string, requestId?: string) {
  await assertZoneAndItemsExist(input);

  const npc = await prisma.npc.create({
    data: {
      zoneId: input.zoneId,
      name: input.name,
      kind: input.kind,
      shopItems: {
        create: input.shopItems.map((s) => ({ itemId: s.itemId, goldPrice: s.goldPrice, stock: s.stock ?? null })),
      },
    },
    include: npcInclude,
  });

  await logAction({
    module: "admin:npcs",
    action: "create",
    actorUserId,
    requestId,
    payload: { npcId: npc.id, name: npc.name, zoneId: npc.zoneId },
  });

  return npc;
}

export async function updateNpc(id: string, input: UpdateNpcInput, actorUserId: string, requestId?: string) {
  const existing = await prisma.npc.findUnique({ where: { id } });
  if (!existing) throw new NpcError("Nie znaleziono NPC", 404);

  await assertZoneAndItemsExist(input);

  const npc = await prisma.$transaction(async (tx) => {
    await tx.npcShopItem.deleteMany({ where: { npcId: id } });

    return tx.npc.update({
      where: { id },
      data: {
        zoneId: input.zoneId,
        name: input.name,
        kind: input.kind,
        shopItems: {
          create: input.shopItems.map((s) => ({ itemId: s.itemId, goldPrice: s.goldPrice, stock: s.stock ?? null })),
        },
      },
      include: npcInclude,
    });
  });

  await logAction({
    module: "admin:npcs",
    action: "update",
    actorUserId,
    requestId,
    payload: { npcId: npc.id, name: npc.name, zoneId: npc.zoneId },
  });

  return npc;
}

export async function deleteNpc(id: string, actorUserId: string, requestId?: string) {
  const existing = await prisma.npc.findUnique({ where: { id } });
  if (!existing) throw new NpcError("Nie znaleziono NPC", 404);

  await prisma.npc.delete({ where: { id } });

  await logAction({
    module: "admin:npcs",
    action: "delete",
    actorUserId,
    requestId,
    payload: { npcId: id, name: existing.name },
  });
}
