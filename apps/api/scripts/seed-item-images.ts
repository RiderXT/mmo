/** One-time content-seeding script — run on the VPS to bring production Item images in sync
 * with what was already applied to the local dev.db (see docs/architecture.md, "Grafiki
 * itemów..." entry). Idempotent: skips items that already have an imageUrl, and skips creating
 * an item if one with the same exact name already exists — safe to re-run.
 *
 * Usage (from apps/api/ on the VPS, after scp-ing the 17 PNGs from Tymczasowe/ikony/clean/ on
 * the dev machine into a local directory here — default ./seed-icons, override with ICONS_DIR):
 *
 *   ICONS_DIR=./seed-icons npx tsx scripts/seed-item-images.ts
 *
 * Uses the same DATABASE_URL as the running API (apps/api/.env on the VPS points at the
 * production Postgres database — this script does NOT touch dev.db when run there).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prismaClient.js";
import { createItem, setItemImage } from "../src/modules/admin/items/service.js";
import type { CreateItemInput } from "@mmo/shared";

const ICONS_DIR = process.env.ICONS_DIR ?? path.join(process.cwd(), "seed-icons");

const admin = await prisma.user.findFirst({ where: { role: "admin" } });
if (!admin) throw new Error("Brak konta admina w bazie — nie ma kto podpisać się pod zmianą w logu");

async function readIcon(name: string): Promise<Buffer> {
  return fs.readFile(path.join(ICONS_DIR, name));
}

async function assignExisting(iconFile: string, where: Parameters<typeof prisma.item.findMany>[0]["where"]) {
  const items = await prisma.item.findMany({ where });
  const toUpdate = items.filter((i) => !i.imageUrl);
  if (!toUpdate.length) return 0;
  const buffer = await readIcon(iconFile);
  for (const item of toUpdate) {
    await setItemImage(item.id, buffer, "image/png", admin.id);
    console.log(`[obraz] ${iconFile} -> ${item.type}\t${item.name}`);
  }
  return toUpdate.length;
}

let assigned = 0;
assigned += await assignExisting("buty.png", { type: "boots" });
assigned += await assignExisting("naszyjnik.png", { type: "necklace" });
assigned += await assignExisting("kolczyki.png", { type: "earrings" });
assigned += await assignExisting("pierscien.png", { type: "ring" });
assigned += await assignExisting("surowiec.png", { type: "material" });
assigned += await assignExisting("skrzynia.png", { type: "chest" });
assigned += await assignExisting("mikstura.png", { type: "consumable", name: "Mikstura Życia" });
assigned += await assignExisting("bron.png", { type: "weapon", name: { startsWith: "Miecz " } });
assigned += await assignExisting("zbroja.png", { type: "armor", name: { startsWith: "Ciężka Zbroja " } });
assigned += await assignExisting("zbroja.png", { type: "armor", name: { startsWith: "Płytowa Zbroja " } });
assigned += await assignExisting("helm.png", { type: "helmet", name: { startsWith: "Hełm Wojownika " } });
assigned += await assignExisting("helm.png", { type: "helmet", name: { startsWith: "Hełm Strażnika " } });
console.log(`Przypisano obrazy do ${assigned} istniejących itemów.`);

// --- Nowe itemy dla typów, które wcześniej nie miały żadnego przedmiotu w bazie ---
const rybak = await prisma.passiveSkillType.findFirst({ where: { name: "Rybak" } });

const newItems: Array<{ icon: string; input: CreateItemInput }> = [
  {
    icon: "tarcza.png",
    input: {
      name: "Tarcza Wilków",
      type: "shield",
      minLevel: 1,
      stackable: false,
      maxStack: 1,
      description: "Prosta drewniano-żelazna tarcza garnizonu Wilczego Uroczyska.",
      baseStats: { defense: 4 },
      maxUpgradeStats: { defense: 6 },
      possibleStatRanges: [{ stat: "damageReduction", min: 0.005, max: 0.015, weight: 1 }],
      classId: null,
      upgradeRequirements: [],
      upgradeLevelConfigs: [],
      chestLoot: [],
      sellPrice: 1,
      gridWidth: 2,
    },
  },
  {
    icon: "wedka.png",
    input: {
      name: "Wędka Rybaka",
      type: "rod",
      minLevel: 1,
      stackable: false,
      maxStack: 1,
      description: "Prosta wędka dla początkującego rybaka.",
      baseStats: {},
      maxUpgradeStats: {},
      possibleStatRanges: [],
      upgradeRequirements: [],
      upgradeLevelConfigs: [],
      chestLoot: [],
      sellPrice: 1,
      gridWidth: 2,
      gatherSpeedBonusPctMax: 0.05,
      gatherChanceBonusPctMax: 0.05,
    },
  },
  {
    icon: "kilof.png",
    input: {
      name: "Kilof Górnika",
      type: "pickaxe",
      minLevel: 1,
      stackable: false,
      maxStack: 1,
      description: "Prosty kilof dla początkującego górnika.",
      baseStats: {},
      maxUpgradeStats: {},
      possibleStatRanges: [],
      upgradeRequirements: [],
      upgradeLevelConfigs: [],
      chestLoot: [],
      sellPrice: 1,
      gridWidth: 2,
      gatherSpeedBonusPctMax: 0.05,
      gatherChanceBonusPctMax: 0.05,
    },
  },
  {
    icon: "przyneta.png",
    input: {
      name: "Przynęta Rybacka",
      type: "bait",
      minLevel: 1,
      stackable: false,
      maxStack: 1,
      description: "Podstawowa przynęta noszona w aktywnym slocie — zwiększa szansę na połów.",
      baseStats: {},
      maxUpgradeStats: {},
      possibleStatRanges: [],
      upgradeRequirements: [],
      upgradeLevelConfigs: [],
      chestLoot: [],
      sellPrice: 1,
      gridWidth: 1,
      baitChanceBonusPct: 0.05,
    },
  },
  {
    icon: "eliksir.png",
    input: {
      name: "Iskra Kowalska",
      type: "catalyst",
      minLevel: 1,
      stackable: true,
      maxStack: 20,
      description: "Podstawowy katalizator — zwiększa szansę powodzenia ulepszenia na kowadle.",
      baseStats: {},
      maxUpgradeStats: {},
      possibleStatRanges: [],
      upgradeRequirements: [],
      upgradeLevelConfigs: [],
      chestLoot: [],
      sellPrice: 3,
      gridWidth: 1,
      catalystSuccessChanceBonusPct: 0.05,
    },
  },
  ...(rybak
    ? [
        {
          icon: "ksiega.png",
          input: {
            name: "Podręcznik Rybaka",
            type: "book",
            minLevel: 1,
            stackable: true,
            maxStack: 20,
            description: "Podstawowy podręcznik — po udanej lekturze podnosi poziom umiejętności Rybaka.",
            baseStats: {},
            maxUpgradeStats: {},
            possibleStatRanges: [],
            upgradeRequirements: [],
            upgradeLevelConfigs: [],
            chestLoot: [],
            sellPrice: 5,
            gridWidth: 1,
            bookSkillTypeId: rybak.id,
            bookSuccessChance: 0.7,
          } satisfies CreateItemInput,
        },
      ]
    : []),
  {
    icon: "zadanie.png",
    input: {
      name: "Zapieczętowany Zwój",
      type: "quest",
      minLevel: 1,
      stackable: false,
      maxStack: 1,
      description: "Zapieczętowany zwój — placeholder na przyszłe zadania fabularne.",
      baseStats: {},
      maxUpgradeStats: {},
      possibleStatRanges: [],
      upgradeRequirements: [],
      upgradeLevelConfigs: [],
      chestLoot: [],
      sellPrice: 0,
      gridWidth: 1,
    },
  },
];

if (!rybak) {
  console.log("UWAGA: brak PassiveSkillType 'Rybak' w tej bazie — pomijam utworzenie 'Podręcznik Rybaka'.");
}

let created = 0;
for (const def of newItems) {
  const exists = await prisma.item.findFirst({ where: { name: def.input.name } });
  if (exists) {
    console.log(`[pomiń] "${def.input.name}" już istnieje`);
    continue;
  }
  const item = await createItem(def.input, admin.id);
  const buffer = await readIcon(def.icon);
  await setItemImage(item.id, buffer, "image/png", admin.id);
  console.log(`[utworzono] ${item.name} (${item.type}) <- ${def.icon}`);
  created += 1;
}
console.log(`Utworzono ${created} nowych itemów.`);

await prisma.$disconnect();
