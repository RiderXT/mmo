import { PrismaClient } from "@prisma/client";
import { MAX_INVENTORY_SLOTS, inventoryOccupiedRange } from "@mmo/shared";

const prisma = new PrismaClient();

async function main() {
  const orphaned = await prisma.inventoryItem.findMany({
    where: { slotIndex: { gte: MAX_INVENTORY_SLOTS } },
    include: { item: { select: { name: true, gridWidth: true } } },
    orderBy: { slotIndex: "asc" },
  });

  if (orphaned.length === 0) {
    console.log(`Brak przedmiotow poza widocznym zakresem (>= slot ${MAX_INVENTORY_SLOTS}).`);
    return;
  }

  console.log(`Znaleziono ${orphaned.length} przedmiot(ow) poza widocznym zakresem (>= slot ${MAX_INVENTORY_SLOTS}):`);
  for (const o of orphaned) {
    console.log(`  - char ${o.characterId} | ${o.item.name} x${o.quantity} @ slot ${o.slotIndex}`);
  }

  const byCharacter = new Map<string, typeof orphaned>();
  for (const o of orphaned) {
    const list = byCharacter.get(o.characterId) ?? [];
    list.push(o);
    byCharacter.set(o.characterId, list);
  }

  let relocated = 0;
  let stuck = 0;

  for (const [characterId, items] of byCharacter) {
    const existing = await prisma.inventoryItem.findMany({
      where: { characterId, slotIndex: { not: null, lt: MAX_INVENTORY_SLOTS } },
      select: { slotIndex: true, item: { select: { gridWidth: true } } },
    });
    const occupied = new Set<number>();
    for (const e of existing) {
      for (const cell of inventoryOccupiedRange(e.slotIndex!, e.item.gridWidth) ?? [e.slotIndex!]) {
        occupied.add(cell);
      }
    }

    for (const o of items) {
      let target: number | null = null;
      for (let i = 0; i < MAX_INVENTORY_SLOTS; i++) {
        const range = inventoryOccupiedRange(i, o.item.gridWidth);
        if (!range) continue;
        if (range.every((cell) => !occupied.has(cell))) {
          target = i;
          for (const cell of range) occupied.add(cell);
          break;
        }
      }

      if (target === null) {
        console.log(`  BRAK MIEJSCA: ${o.item.name} x${o.quantity} (char ${characterId}, obecnie slot ${o.slotIndex}) - zostaje bez zmian, wymaga recznej decyzji.`);
        stuck += 1;
        continue;
      }

      await prisma.inventoryItem.update({ where: { id: o.id }, data: { slotIndex: target } });
      console.log(`  Przeniesiono: ${o.item.name} x${o.quantity} (char ${characterId}) slot ${o.slotIndex} -> ${target}`);
      relocated += 1;
    }
  }

  console.log(`\nGotowe. Przeniesiono: ${relocated}, bez miejsca (bez zmian): ${stuck}.`);
}

main().finally(() => prisma.$disconnect());
