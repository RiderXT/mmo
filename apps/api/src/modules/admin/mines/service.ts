import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateMineInput, UpdateMineInput } from "@mmo/shared";

const mineInclude = {
  zone: { select: { id: true, name: true } },
  drops: { include: { item: { select: { id: true, name: true, type: true } } } },
} as const;

export function listMines() {
  return prisma.mine.findMany({ include: mineInclude, orderBy: { name: "asc" } });
}

export function getMine(id: string) {
  return prisma.mine.findUnique({ where: { id }, include: mineInclude });
}

export class MineError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

async function assertZoneAndItemsExist(input: CreateMineInput, excludeId?: string) {
  const zone = await prisma.zone.findUnique({ where: { id: input.zoneId } });
  if (!zone) throw new MineError("Nie znaleziono krainy", 400);

  const existing = await prisma.mine.findUnique({ where: { zoneId: input.zoneId } });
  if (existing && existing.id !== excludeId) {
    throw new MineError("Ta kraina ma już przypisaną kopalnię", 409);
  }

  const itemIds = input.drops.map((d) => d.itemId);
  if (itemIds.length) {
    const count = await prisma.item.count({ where: { id: { in: itemIds } } });
    if (count !== new Set(itemIds).size) {
      throw new MineError("Jeden lub więcej wskazanych itemów nie istnieje", 400);
    }
  }
}

export async function createMine(input: CreateMineInput, actorUserId: string, requestId?: string) {
  await assertZoneAndItemsExist(input);

  const mine = await prisma.mine.create({
    data: {
      zoneId: input.zoneId,
      name: input.name,
      minExtractSeconds: input.minExtractSeconds ?? null,
      maxExtractSeconds: input.maxExtractSeconds ?? null,
      minSearchSeconds: input.minSearchSeconds ?? null,
      maxSearchSeconds: input.maxSearchSeconds ?? null,
      drops: {
        create: input.drops.map((d) => ({
          itemId: d.itemId,
          dropChance: d.dropChance,
          minQty: d.minQty,
          maxQty: d.maxQty,
        })),
      },
    },
    include: mineInclude,
  });

  await logAction({
    module: "admin:mines",
    action: "create",
    actorUserId,
    requestId,
    payload: { mineId: mine.id, zoneId: mine.zoneId },
  });

  return mine;
}

export async function updateMine(id: string, input: UpdateMineInput, actorUserId: string, requestId?: string) {
  const existing = await prisma.mine.findUnique({ where: { id } });
  if (!existing) throw new MineError("Nie znaleziono kopalni", 404);

  await assertZoneAndItemsExist(input, id);

  const mine = await prisma.$transaction(async (tx) => {
    await tx.miningDrop.deleteMany({ where: { mineId: id } });

    return tx.mine.update({
      where: { id },
      data: {
        zoneId: input.zoneId,
        name: input.name,
        minExtractSeconds: input.minExtractSeconds ?? null,
        maxExtractSeconds: input.maxExtractSeconds ?? null,
        minSearchSeconds: input.minSearchSeconds ?? null,
        maxSearchSeconds: input.maxSearchSeconds ?? null,
        drops: {
          create: input.drops.map((d) => ({
            itemId: d.itemId,
            dropChance: d.dropChance,
            minQty: d.minQty,
            maxQty: d.maxQty,
          })),
        },
      },
      include: mineInclude,
    });
  });

  await logAction({
    module: "admin:mines",
    action: "update",
    actorUserId,
    requestId,
    payload: { mineId: mine.id, zoneId: mine.zoneId },
  });

  return mine;
}

export async function deleteMine(id: string, actorUserId: string, requestId?: string) {
  const existing = await prisma.mine.findUnique({ where: { id } });
  if (!existing) throw new MineError("Nie znaleziono kopalni", 404);

  await prisma.mine.delete({ where: { id } });

  await logAction({
    module: "admin:mines",
    action: "delete",
    actorUserId,
    requestId,
    payload: { mineId: id, zoneId: existing.zoneId },
  });
}
