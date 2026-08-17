import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateFishingSpotInput, UpdateFishingSpotInput } from "@mmo/shared";

const fishingSpotInclude = {
  zone: { select: { id: true, name: true } },
  drops: { include: { item: { select: { id: true, name: true, type: true } } } },
} as const;

export function listFishingSpots() {
  return prisma.fishingSpot.findMany({ include: fishingSpotInclude, orderBy: { name: "asc" } });
}

export function getFishingSpot(id: string) {
  return prisma.fishingSpot.findUnique({ where: { id }, include: fishingSpotInclude });
}

export class FishingSpotError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

async function assertZoneAndItemsExist(input: CreateFishingSpotInput, excludeId?: string) {
  const zone = await prisma.zone.findUnique({ where: { id: input.zoneId } });
  if (!zone) throw new FishingSpotError("Nie znaleziono krainy", 400);

  const existing = await prisma.fishingSpot.findUnique({ where: { zoneId: input.zoneId } });
  if (existing && existing.id !== excludeId) {
    throw new FishingSpotError("Ta kraina ma już przypisane łowisko", 409);
  }

  const itemIds = input.drops.map((d) => d.itemId);
  if (itemIds.length) {
    const count = await prisma.item.count({ where: { id: { in: itemIds } } });
    if (count !== new Set(itemIds).size) {
      throw new FishingSpotError("Jeden lub więcej wskazanych itemów nie istnieje", 400);
    }
  }
}

export async function createFishingSpot(input: CreateFishingSpotInput, actorUserId: string, requestId?: string) {
  await assertZoneAndItemsExist(input);

  const spot = await prisma.fishingSpot.create({
    data: {
      zoneId: input.zoneId,
      name: input.name,
      minCatchSeconds: input.minCatchSeconds ?? null,
      maxCatchSeconds: input.maxCatchSeconds ?? null,
      drops: {
        create: input.drops.map((d) => ({
          itemId: d.itemId,
          dropChance: d.dropChance,
          minQty: d.minQty,
          maxQty: d.maxQty,
        })),
      },
    },
    include: fishingSpotInclude,
  });

  await logAction({
    module: "admin:fishingSpots",
    action: "create",
    actorUserId,
    requestId,
    payload: { fishingSpotId: spot.id, zoneId: spot.zoneId },
  });

  return spot;
}

export async function updateFishingSpot(
  id: string,
  input: UpdateFishingSpotInput,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.fishingSpot.findUnique({ where: { id } });
  if (!existing) throw new FishingSpotError("Nie znaleziono łowiska", 404);

  await assertZoneAndItemsExist(input, id);

  const spot = await prisma.$transaction(async (tx) => {
    await tx.fishingDrop.deleteMany({ where: { fishingSpotId: id } });

    return tx.fishingSpot.update({
      where: { id },
      data: {
        zoneId: input.zoneId,
        name: input.name,
        minCatchSeconds: input.minCatchSeconds ?? null,
        maxCatchSeconds: input.maxCatchSeconds ?? null,
        drops: {
          create: input.drops.map((d) => ({
            itemId: d.itemId,
            dropChance: d.dropChance,
            minQty: d.minQty,
            maxQty: d.maxQty,
          })),
        },
      },
      include: fishingSpotInclude,
    });
  });

  await logAction({
    module: "admin:fishingSpots",
    action: "update",
    actorUserId,
    requestId,
    payload: { fishingSpotId: spot.id, zoneId: spot.zoneId },
  });

  return spot;
}

export async function deleteFishingSpot(id: string, actorUserId: string, requestId?: string) {
  const existing = await prisma.fishingSpot.findUnique({ where: { id } });
  if (!existing) throw new FishingSpotError("Nie znaleziono łowiska", 404);

  await prisma.fishingSpot.delete({ where: { id } });

  await logAction({
    module: "admin:fishingSpots",
    action: "delete",
    actorUserId,
    requestId,
    payload: { fishingSpotId: id, zoneId: existing.zoneId },
  });
}
