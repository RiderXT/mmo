import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateMonsterInput, UpdateMonsterInput } from "@mmo/shared";

const monsterInclude = {
  drops: { include: { item: { select: { id: true, name: true, type: true } } } },
} as const;

export class MonsterError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

function serialize<T extends { stats: string; skills: string }>(monster: T) {
  return {
    ...monster,
    stats: JSON.parse(monster.stats) as unknown,
    skills: JSON.parse(monster.skills) as unknown,
  };
}

export async function listMonsters() {
  const monsters = await prisma.monster.findMany({ include: monsterInclude, orderBy: { level: "asc" } });
  return monsters.map(serialize);
}

export async function getMonster(id: string) {
  const monster = await prisma.monster.findUnique({ where: { id }, include: monsterInclude });
  return monster ? serialize(monster) : null;
}

async function assertItemsExist(input: CreateMonsterInput) {
  const itemIds = input.drops.map((d) => d.itemId);
  if (!itemIds.length) return;
  const count = await prisma.item.count({ where: { id: { in: itemIds } } });
  if (count !== new Set(itemIds).size) {
    throw new MonsterError("Jeden lub więcej wskazanych itemów nie istnieje", 400);
  }
}

export async function createMonster(input: CreateMonsterInput, actorUserId: string, requestId?: string) {
  await assertItemsExist(input);

  const monster = await prisma.monster.create({
    data: {
      name: input.name,
      level: input.level,
      hp: input.hp,
      expReward: input.expReward,
      goldReward: input.goldReward,
      stats: JSON.stringify(input.stats),
      skills: JSON.stringify(input.skills),
      drops: {
        create: input.drops.map((d) => ({
          itemId: d.itemId,
          dropChance: d.dropChance,
          minQty: d.minQty,
          maxQty: d.maxQty,
        })),
      },
    },
    include: monsterInclude,
  });

  await logAction({
    module: "admin:monsters",
    action: "create",
    actorUserId,
    requestId,
    payload: { monsterId: monster.id, name: monster.name },
  });

  return serialize(monster);
}

export async function updateMonster(
  id: string,
  input: UpdateMonsterInput,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.monster.findUnique({ where: { id } });
  if (!existing) throw new MonsterError("Nie znaleziono potwora", 404);

  await assertItemsExist(input);

  const monster = await prisma.$transaction(async (tx) => {
    await tx.monsterDrop.deleteMany({ where: { monsterId: id } });
    return tx.monster.update({
      where: { id },
      data: {
        name: input.name,
        level: input.level,
        hp: input.hp,
        expReward: input.expReward,
        goldReward: input.goldReward,
        stats: JSON.stringify(input.stats),
        skills: JSON.stringify(input.skills),
        drops: {
          create: input.drops.map((d) => ({
            itemId: d.itemId,
            dropChance: d.dropChance,
            minQty: d.minQty,
            maxQty: d.maxQty,
          })),
        },
      },
      include: monsterInclude,
    });
  });

  await logAction({
    module: "admin:monsters",
    action: "update",
    actorUserId,
    requestId,
    payload: { monsterId: monster.id, name: monster.name },
  });

  return serialize(monster);
}

export async function deleteMonster(id: string, actorUserId: string, requestId?: string) {
  const existing = await prisma.monster.findUnique({ where: { id } });
  if (!existing) throw new MonsterError("Nie znaleziono potwora", 404);

  const inUse = await prisma.zoneMonster.count({ where: { monsterId: id } });
  if (inUse > 0) {
    throw new MonsterError("Nie można usunąć potwora przypisanego do krainy — usuń go najpierw z krain", 409);
  }

  await prisma.monster.delete({ where: { id } });

  await logAction({
    module: "admin:monsters",
    action: "delete",
    actorUserId,
    requestId,
    payload: { monsterId: id, name: existing.name },
  });
}
