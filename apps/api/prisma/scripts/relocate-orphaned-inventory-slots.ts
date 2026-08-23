/**
 * One-off, additive fix: findNextFreeSlotIndex used to search up to slot 500 for a free grid
 * cell, but EquipmentTab.tsx only ever rendered/allowed switching to INVENTORY_TABS (4) tabs =
 * 140 slots — items placed at slot >= 140 were fully persisted server-side but permanently
 * invisible in the UI (no tab control could reach them), even though the grant/purchase/drop
 * that created them succeeded with no error. See docs/architecture.md, "Ekwipunek: backend
 * pozwalal na 500 slotow..." (2026-08-23) for the full incident writeup.
 *
 * Idempotent and non-destructive: only touches InventoryItem rows already at slotIndex >=
 * MAX_INVENTORY_SLOTS, moving each to the first free slot < MAX_INVENTORY_SLOTS for that
 * character (respecting Item.gridWidth, same placement logic as findNextFreeSlotIndex). If a
 * character's visible inventory is genuinely full, the row is left untouched and reported —
 * nothing is ever deleted or overwritten. Safe to run on every deploy; no-ops once every
 * orphaned row has been relocated (or once none exist, which is the steady state after the
 * first successful run).
 *
 * Run once, from apps/api: `npx tsx prisma/scripts/relocate-orphaned-inventory-slots.ts`
 */
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

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
