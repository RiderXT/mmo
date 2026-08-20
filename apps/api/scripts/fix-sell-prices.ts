/** One-off data fix — every item is meant to have at least a symbolic sellPrice (standing policy:
 * real balance numbers come later, but nothing should be permanently unsellable in the meantime).
 * `POST /api/inventory/:characterId/sell` 400s with "Ten przedmiot nie ma ustalonej wartości
 * sprzedaży" for any item at sellPrice <= 0 — this showed up in production as the bot's new
 * sell-wrong-class-loot logic (see docs/architecture.md, "Bot: sprzedaje loot złej klasy...")
 * repeatedly failing on whatever items in the PRODUCTION catalog still have sellPrice 0, which
 * dev.db didn't have (only one local item ever had it, already fixed there).
 *
 * Idempotent — matches only sellPrice <= 0, safe to re-run.
 *
 * Usage (from apps/api/ on the VPS):
 *   npx tsx scripts/fix-sell-prices.ts
 */
import { prisma } from "../src/lib/prismaClient.js";

const broken = await prisma.item.findMany({ where: { sellPrice: { lte: 0 } }, select: { id: true, name: true, type: true } });
for (const item of broken) {
  console.log(`[naprawiono] ${item.type}\t${item.name}`);
}

const result = await prisma.item.updateMany({ where: { sellPrice: { lte: 0 } }, data: { sellPrice: 1 } });
console.log(`Poprawiono sellPrice (0 -> 1) dla ${result.count} itemów.`);

await prisma.$disconnect();
