/**
 * One-off, additive fix: Item.gridWidth (new field — how many horizontal equipment-grid cells
 * an item occupies, see apps/web/src/lib/inventoryGrid.ts) defaults to 1 for every item, but
 * weapon/armor should render/occupy 2 cells. Only touches rows still at that schema default (1),
 * so any item an admin already hand-tuned through the Itemy panel is left untouched — safe to
 * run against a live production database with real player data.
 *
 * Run once, from apps/api: `npx tsx prisma/scripts/set-weapon-armor-grid-width.ts`
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.item.updateMany({
    where: { type: { in: ["weapon", "armor"] }, gridWidth: 1 },
    data: { gridWidth: 2 },
  });
  console.log(`Ustawiono gridWidth=2 dla ${result.count} itemów typu weapon/armor.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
