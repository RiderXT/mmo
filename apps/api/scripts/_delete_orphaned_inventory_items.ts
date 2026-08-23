/**
 * ONE-OFF CLEANUP — run manually once, NOT wired into deploy.sh (unlike
 * prisma/scripts/relocate-orphaned-inventory-slots.ts, which is safe to run unattended forever
 * since it only ever relocates-or-leaves-alone, never deletes).
 *
 * Deletes every InventoryItem still stuck at slotIndex >= MAX_INVENTORY_SLOTS after the relocate
 * script has already had a chance to move whatever it could into free visible slots. Confirmed
 * with the project owner (2026-08-23) that every affected character is a bot/test account from
 * load testing, not a real player — see docs/architecture.md, "Ekwipunek: backend pozwalal na
 * 500 slotow..." for the full incident. Prints a per-character summary before deleting anything,
 * and writes one GameLog entry per character so there's a permanent record of what was removed.
 *
 * Run once, from apps/api: `npx tsx scripts/_delete_orphaned_inventory_items.ts`
 */
import { PrismaClient } from "@prisma/client";
import { MAX_INVENTORY_SLOTS } from "@mmo/shared";
import { logAction } from "../src/lib/gameLog.js";

const prisma = new PrismaClient();

async function main() {
  const orphaned = await prisma.inventoryItem.findMany({
    where: { slotIndex: { gte: MAX_INVENTORY_SLOTS } },
    include: { item: { select: { name: true } } },
  });

  if (orphaned.length === 0) {
    console.log(`Brak przedmiotow poza widocznym zakresem (>= slot ${MAX_INVENTORY_SLOTS}) - nic do usuniecia.`);
    return;
  }

  const byCharacter = new Map<string, typeof orphaned>();
  for (const o of orphaned) {
    const list = byCharacter.get(o.characterId) ?? [];
    list.push(o);
    byCharacter.set(o.characterId, list);
  }

  console.log(`Znaleziono ${orphaned.length} przedmiot(ow) poza widocznym zakresem na ${byCharacter.size} postaciach:`);
  for (const [characterId, items] of byCharacter) {
    console.log(`  - char ${characterId}: ${items.length} przedmiotow`);
  }

  const ids = orphaned.map((o) => o.id);
  const result = await prisma.inventoryItem.deleteMany({ where: { id: { in: ids } } });

  for (const [characterId, items] of byCharacter) {
    await logAction({
      module: "inventory",
      level: "warn",
      action: "orphaned_items_purged",
      actorCharacterId: characterId,
      payload: {
        count: items.length,
        items: items.map((i) => ({ itemId: i.itemId, name: i.item.name, quantity: i.quantity, slotIndex: i.slotIndex })),
      },
    });
  }

  console.log(`\nUsunieto ${result.count} przedmiot(ow) z ${byCharacter.size} postaci. Zapisano wpisy w GameLog (module: inventory, action: orphaned_items_purged).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
