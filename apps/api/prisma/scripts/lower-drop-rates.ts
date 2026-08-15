/**
 * One-off, additive rebalance: lowers the drop chances seed-zones.ts originally generated,
 * WITHOUT touching anything else (no deletes, no reseed) — safe to run against a live
 * production database with real player data.
 *
 * Context: seed-zones.ts set every monster's tier-upgrade-stone drop at 30% and every zone's
 * 16 class/universal equip items at 4% each, independently checked per kill. That's fine for a
 * handful of kills, but a character that survives long enough to rack up hundreds of kills in a
 * single expedition (see docs/architecture.md "Etap 13") ends up with hundreds of stones/items
 * from ONE expedition — the opposite of "should drop rarely". This only updates rows that still
 * have those exact original values (0.3 / 0.04), so any drop chance an admin already hand-tuned
 * through the Itemy/Potwory panels is left untouched.
 *
 * Run once, from apps/api: `npx tsx prisma/scripts/lower-drop-rates.ts`
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OLD_STONE_CHANCE = 0.3;
const NEW_STONE_CHANCE = 0.08;
const OLD_ITEM_CHANCE = 0.04;
const NEW_ITEM_CHANCE = 0.015;

async function main() {
  const stoneDrops = await prisma.monsterDrop.updateMany({
    where: { dropChance: OLD_STONE_CHANCE },
    data: { dropChance: NEW_STONE_CHANCE },
  });
  const itemDrops = await prisma.zoneDrop.updateMany({
    where: { dropChance: OLD_ITEM_CHANCE },
    data: { dropChance: NEW_ITEM_CHANCE },
  });

  console.log(
    `Zaktualizowano ${stoneDrops.count} dropów kamieni wzmocnienia (${OLD_STONE_CHANCE} -> ${NEW_STONE_CHANCE}) ` +
      `i ${itemDrops.count} dropów itemów krain (${OLD_ITEM_CHANCE} -> ${NEW_ITEM_CHANCE}).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
