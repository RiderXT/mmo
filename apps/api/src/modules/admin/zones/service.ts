import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateZoneInput, UpdateZoneInput } from "@mmo/shared";

const zoneInclude = {
  monsters: { include: { monster: { select: { id: true, name: true, level: true } } } },
  drops: { include: { item: { select: { id: true, name: true, type: true } } } },
} as const;

export function listZones() {
  return prisma.zone.findMany({ include: zoneInclude, orderBy: { minLevel: "asc" } });
}

export function getZone(id: string) {
  return prisma.zone.findUnique({ where: { id }, include: zoneInclude });
}

export class ZoneError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

async function assertMonstersAndItemsExist(input: CreateZoneInput) {
  const monsterIds = input.monsters.map((m) => m.monsterId);
  const itemIds = input.drops.map((d) => d.itemId);

  if (monsterIds.length) {
    const count = await prisma.monster.count({ where: { id: { in: monsterIds } } });
    if (count !== new Set(monsterIds).size) {
      throw new ZoneError("Jeden lub więcej wskazanych potworów nie istnieje", 400);
    }
  }

  if (itemIds.length) {
    const count = await prisma.item.count({ where: { id: { in: itemIds } } });
    if (count !== new Set(itemIds).size) {
      throw new ZoneError("Jeden lub więcej wskazanych itemów nie istnieje", 400);
    }
  }
}

export async function createZone(input: CreateZoneInput, actorUserId: string, requestId?: string) {
  const existing = await prisma.zone.findUnique({ where: { name: input.name } });
  if (existing) throw new ZoneError("Kraina o tej nazwie już istnieje", 409);

  await assertMonstersAndItemsExist(input);

  const zone = await prisma.zone.create({
    data: {
      name: input.name,
      description: input.description,
      minLevel: input.minLevel,
      maxLevel: input.maxLevel,
      monsters: { create: input.monsters.map((m) => ({ monsterId: m.monsterId, spawnWeight: m.spawnWeight, maxCount: m.maxCount })) },
      drops: { create: input.drops.map((d) => ({ itemId: d.itemId, dropChance: d.dropChance })) },
    },
    include: zoneInclude,
  });

  await logAction({
    module: "admin:zones",
    action: "create",
    actorUserId,
    requestId,
    payload: { zoneId: zone.id, name: zone.name },
  });

  return zone;
}

export async function updateZone(
  id: string,
  input: UpdateZoneInput,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.zone.findUnique({ where: { id } });
  if (!existing) throw new ZoneError("Nie znaleziono krainy", 404);

  const nameTaken = await prisma.zone.findFirst({ where: { name: input.name, NOT: { id } } });
  if (nameTaken) throw new ZoneError("Kraina o tej nazwie już istnieje", 409);

  await assertMonstersAndItemsExist(input);

  const zone = await prisma.$transaction(async (tx) => {
    await tx.zoneMonster.deleteMany({ where: { zoneId: id } });
    await tx.zoneDrop.deleteMany({ where: { zoneId: id } });

    return tx.zone.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        minLevel: input.minLevel,
        maxLevel: input.maxLevel,
        monsters: { create: input.monsters.map((m) => ({ monsterId: m.monsterId, spawnWeight: m.spawnWeight, maxCount: m.maxCount })) },
        drops: { create: input.drops.map((d) => ({ itemId: d.itemId, dropChance: d.dropChance })) },
      },
      include: zoneInclude,
    });
  });

  await logAction({
    module: "admin:zones",
    action: "update",
    actorUserId,
    requestId,
    payload: { zoneId: zone.id, name: zone.name },
  });

  return zone;
}

export async function deleteZone(id: string, actorUserId: string, requestId?: string) {
  const existing = await prisma.zone.findUnique({ where: { id } });
  if (!existing) throw new ZoneError("Nie znaleziono krainy", 404);

  const inUse = await prisma.character.count({ where: { currentZoneId: id } });
  if (inUse > 0) {
    throw new ZoneError("Nie można usunąć krainy, w której aktualnie przebywają postacie", 409);
  }

  await prisma.zone.delete({ where: { id } });

  await logAction({
    module: "admin:zones",
    action: "delete",
    actorUserId,
    requestId,
    payload: { zoneId: id, name: existing.name },
  });
}
