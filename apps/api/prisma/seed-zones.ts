/**
 * Balance-baseline content generator for zones spanning levels 1-99, per the design framework
 * worked out with the user: reference-build power curve (a universal 50% primary / 30%
 * vitality / 10%/10% secondary stat-split assumption, since equipment isn't class-restricted
 * in its power level, only in who can equip it) -> monster difficulty sized against sustained
 * (not single-encounter) survivability -> item stat budget distributed across the 7 equip
 * slots, shaped after real Metin2 wiki data as a starting reference (flat early growth,
 * late-tier spike; per-class weapon/armor/helmet lines; boots carry movementSpeed).
 *
 * Zones are ordered by minLevel (both here and in listZones()'s orderBy) — keep new tiers in
 * ascending level order when editing TIERS. Ten narrower brackets instead of the previous six
 * wider ones, five monsters per bracket spread across its level range (not just the endpoints),
 * matching the density the user asked for.
 *
 * movementSpeed on boots is a FLAT constant (BOOTS_MOVEMENT_SPEED_PCT) across every tier, not
 * scaled up per tier — early game should feel like travel takes a while; later stages add
 * dedicated speed items (e.g. a mount) as the main lever for cutting it down, not ever-better
 * boots. Don't reintroduce per-tier scaling here without revisiting that plan.
 *
 * Deliberately OUT OF SCOPE (new engine mechanics, not just content): resistances vs specific
 * enemy types, double-loot/double-yang chance, on-hit debuff chances, bonus stat points from
 * items. Random bonuses are limited to existing StatKey values.
 *
 * Safe to re-run after editing TIERS — existing zones/monsters/items/upgrade materials (matched
 * by name) are deleted and recreated rather than skipped, so tuning numbers is "edit and re-run".
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BOOTS_MOVEMENT_SPEED_PCT = 0.1;
const UPGRADE_BUDGET_MULTIPLIER = 1.6; // maxUpgradeStats (at +9) vs baseStats (at +0) budget
const MONSTERS_PER_TIER = 5;
const LEVEL_QUALIFIERS = ["Młody", "Zwykły", "Doświadczony", "Groźny", "Elitarny"];

interface Tier {
  zoneName: string;
  minLevel: number;
  maxLevel: number;
  travelTimeSeconds: number;
  /** Genitive modifier appended to slot nouns, e.g. "Miecz Mokradeł" — sidesteps Polish
   * adjective/noun gender agreement entirely (works the same after masculine or feminine nouns). */
  itemGenitive: string;
  /** Masculine monster noun, so LEVEL_QUALIFIERS (also masculine) agree without extra work. */
  monsterNoun: string;
}

const TIERS: Tier[] = [
  { zoneName: "Wilcze Uroczysko", minLevel: 1, maxLevel: 10, travelTimeSeconds: 30, itemGenitive: "Wilków", monsterNoun: "Wilk" },
  { zoneName: "Zapomniane Mokradła", minLevel: 11, maxLevel: 20, travelTimeSeconds: 55, itemGenitive: "Mokradeł", monsterNoun: "Pełzacz" },
  { zoneName: "Krwawy Wąwóz", minLevel: 21, maxLevel: 30, travelTimeSeconds: 80, itemGenitive: "Wąwozu", monsterNoun: "Rozbójnik" },
  { zoneName: "Spalone Laguny", minLevel: 31, maxLevel: 40, travelTimeSeconds: 105, itemGenitive: "Lagun", monsterNoun: "Jaszczur" },
  { zoneName: "Popielne Pustkowia", minLevel: 41, maxLevel: 50, travelTimeSeconds: 130, itemGenitive: "Pustkowi", monsterNoun: "Golem" },
  { zoneName: "Zimowe Manowce", minLevel: 51, maxLevel: 60, travelTimeSeconds: 155, itemGenitive: "Manowców", monsterNoun: "Upiór Mrozu" },
  { zoneName: "Czarna Twierdza", minLevel: 61, maxLevel: 70, travelTimeSeconds: 180, itemGenitive: "Twierdzy", monsterNoun: "Strażnik Twierdzy" },
  { zoneName: "Wulkaniczne Turnie", minLevel: 71, maxLevel: 80, travelTimeSeconds: 205, itemGenitive: "Turni", monsterNoun: "Salamander" },
  { zoneName: "Otchłań Cieni", minLevel: 81, maxLevel: 90, travelTimeSeconds: 230, itemGenitive: "Cieni", monsterNoun: "Cień" },
  { zoneName: "Tron Zapomnianego Króla", minLevel: 91, maxLevel: 99, travelTimeSeconds: 260, itemGenitive: "Króla", monsterNoun: "Strażnik Tronu" },
];

/** Weapon/armor noun + genitive class name (for helmets: "Hełm <classGenitive> <tier.itemGenitive>"). */
const CLASS_FLAVOR: Record<string, { weapon: string; armor: string; genitive: string }> = {
  Wojownik: { weapon: "Miecz", armor: "Płytowa Zbroja", genitive: "Wojownika" },
  Strażnik: { weapon: "Topór", armor: "Ciężka Zbroja", genitive: "Strażnika" },
  Mag: { weapon: "Różdżka", armor: "Szata", genitive: "Maga" },
  Łotrzyk: { weapon: "Sztylet", armor: "Skórzana Zbroja", genitive: "Łotrzyka" },
};

// --- Reference-build naked (zero-equipment) derived stats, matching combat.ts's formulas ---
function referenceNakedStats(level: number) {
  const alloc = 4 * (level - 1);
  const primary = 5 + Math.round(0.5 * alloc);
  const vitality = 5 + Math.round(0.3 * alloc);
  const secondary = 5 + Math.round(0.1 * alloc); // stand-in for dexterity in the attack formula
  return {
    attack: Math.round(5 + primary * 2 + secondary * 0.5),
    defense: Math.round(2 + vitality * 1),
    hp: Math.round(50 + vitality * 10),
  };
}

// --- Item stat budget: how much a FULL 7-slot set of this tier should add on top of naked ---
function gearBudget(naked: { attack: number; defense: number; hp: number }) {
  return {
    attack: Math.round(naked.attack * 0.8),
    defense: Math.round(naked.defense * 0.6),
    hp: Math.round(naked.hp * 0.5),
  };
}

// Slot weights: fraction of the total budget each slot contributes.
const ATTACK_WEIGHTS = { weapon: 0.7, necklace: 0.15, ring: 0.15 };
const DEF_HP_WEIGHTS = { armor: 0.35, helmet: 0.25, boots: 0.2, necklace: 0.07, earrings: 0.07, ring: 0.06 };

function split(total: number, weight: number): number {
  return Math.max(0, Math.round(total * weight));
}

/** Monster difficulty, sized against a character already fully geared for THIS tier at the
 * monster's own level. HP persists across the whole expedition with no passive regen above 0
 * (only a slow 2%/min trickle once it actually hits 0), so a naive single-encounter
 * roundsToKill:roundsSurvivable ratio compounds harshly over ~30 sequential encounters — every
 * win still chips away roundsToKill-1 rounds of unrecovered damage. Sizing monsterAttack against
 * maxHp/12 (roughly a dozen full encounters survivable in a row) instead of a single-fight ratio
 * is what actually produces a healthy win rate (confirmed live: 30/30 wins geared, mostly losses
 * naked, at the same test level). */
function monsterStatsForLevel(level: number) {
  const naked = referenceNakedStats(level);
  const budget = gearBudget(naked);
  const geared = {
    attack: naked.attack + budget.attack,
    defense: naked.defense + budget.defense,
    hp: naked.hp + budget.hp,
  };

  const targetRoundsToKill = 3;
  const monsterDefense = Math.round(geared.attack * 0.25);
  const damagePerRound = geared.attack - monsterDefense;
  const hp = Math.round(damagePerRound * targetRoundsToKill);
  const attack = geared.defense + Math.round(geared.hp / 12 / (targetRoundsToKill - 1));
  const expReward = Math.round(hp * 0.21);
  const goldReward = Math.round(hp * 0.045);

  return { hp, attack, defense: monsterDefense, expReward, goldReward };
}

function monsterLevelsForTier(tier: Tier): number[] {
  return LEVEL_QUALIFIERS.map((_, i) =>
    Math.round(tier.minLevel + ((tier.maxLevel - tier.minLevel) * i) / (LEVEL_QUALIFIERS.length - 1)),
  );
}

function monsterNamesForTier(tier: Tier): string[] {
  return LEVEL_QUALIFIERS.map((q) => (q === "Zwykły" ? tier.monsterNoun : `${q} ${tier.monsterNoun}`));
}

function stoneNameForTier(tier: Tier): string {
  return `Kamień Wzmocnienia — ${tier.zoneName}`;
}

/** Deletes a previously-generated tier (by name) so it can be recreated with fresh numbers —
 * clears the FK chain that blocks a plain delete: characters parked in the zone, expeditions
 * referencing it, upgrade requirements in both directions, then the zone/monsters/items. */
async function clearTier(tier: Tier) {
  const zone = await prisma.zone.findUnique({ where: { name: tier.zoneName } });
  if (zone) {
    await prisma.character.updateMany({
      where: { currentZoneId: zone.id },
      data: { currentZoneId: null, activeExpeditionId: null },
    });
    await prisma.expedition.deleteMany({ where: { zoneId: zone.id } });
    await prisma.zoneDrop.deleteMany({ where: { zoneId: zone.id } });
    await prisma.zoneMonster.deleteMany({ where: { zoneId: zone.id } });
    await prisma.zone.delete({ where: { id: zone.id } });
  }

  const monsters = await prisma.monster.findMany({ where: { name: { in: monsterNamesForTier(tier) } } });
  for (const monster of monsters) {
    await prisma.monsterDrop.deleteMany({ where: { monsterId: monster.id } });
    await prisma.monster.delete({ where: { id: monster.id } });
  }

  const items = await prisma.item.findMany({
    where: { name: { contains: tier.itemGenitive } },
  });
  for (const item of items) {
    await prisma.inventoryItem.deleteMany({ where: { itemId: item.id } });
    await prisma.itemUpgradeRequirement.deleteMany({
      where: { OR: [{ itemId: item.id }, { requiredItemId: item.id }] },
    });
    await prisma.item.delete({ where: { id: item.id } });
  }
}

/** One-time cleanup of the original hand-seeded Wilcze Uroczysko content (seed.ts) — replaced
 * by this generator's own tier-0 output, which uses a different naming scheme. */
async function clearLegacySeedContent() {
  const names = ["Żelazny Miecz", "Skórzana Zbroja", "Wilczy Kieł"];
  const items = await prisma.item.findMany({ where: { name: { in: names } } });
  for (const item of items) {
    await prisma.inventoryItem.deleteMany({ where: { itemId: item.id } });
    await prisma.itemUpgradeRequirement.deleteMany({
      where: { OR: [{ itemId: item.id }, { requiredItemId: item.id }] },
    });
    await prisma.monsterDrop.deleteMany({ where: { itemId: item.id } });
    await prisma.zoneDrop.deleteMany({ where: { itemId: item.id } });
    await prisma.item.delete({ where: { id: item.id } });
  }

  const monster = await prisma.monster.findFirst({ where: { name: "Szary Wilk" } });
  if (monster) {
    await prisma.monsterDrop.deleteMany({ where: { monsterId: monster.id } });
    await prisma.zoneMonster.deleteMany({ where: { monsterId: monster.id } });
    await prisma.monster.delete({ where: { id: monster.id } });
  }
}

async function main() {
  await clearLegacySeedContent();

  const classes = await prisma.characterClass.findMany({
    where: { name: { in: Object.keys(CLASS_FLAVOR) } },
  });
  if (classes.length === 0) {
    throw new Error("Brak klas postaci — uruchom najpierw `pnpm seed`.");
  }

  for (const [tierIndex, tier] of TIERS.entries()) {
    await clearTier(tier);

    const nakedAtMax = referenceNakedStats(tier.maxLevel);
    const budget = gearBudget(nakedAtMax);
    const upgradeBudget = {
      attack: Math.round(budget.attack * UPGRADE_BUDGET_MULTIPLIER),
      defense: Math.round(budget.defense * UPGRADE_BUDGET_MULTIPLIER),
      hp: Math.round(budget.hp * UPGRADE_BUDGET_MULTIPLIER),
    };

    const weaponAttack = split(budget.attack, ATTACK_WEIGHTS.weapon);
    const weaponAttackMax = split(upgradeBudget.attack, ATTACK_WEIGHTS.weapon);
    const necklaceAttack = split(budget.attack, ATTACK_WEIGHTS.necklace);
    const necklaceAttackMax = split(upgradeBudget.attack, ATTACK_WEIGHTS.necklace);
    const ringAttack = split(budget.attack, ATTACK_WEIGHTS.ring);
    const ringAttackMax = split(upgradeBudget.attack, ATTACK_WEIGHTS.ring);

    const armorDef = split(budget.defense, DEF_HP_WEIGHTS.armor);
    const armorDefMax = split(upgradeBudget.defense, DEF_HP_WEIGHTS.armor);
    const helmetDef = split(budget.defense, DEF_HP_WEIGHTS.helmet);
    const helmetDefMax = split(upgradeBudget.defense, DEF_HP_WEIGHTS.helmet);
    const bootsDef = split(budget.defense, DEF_HP_WEIGHTS.boots);
    const bootsDefMax = split(upgradeBudget.defense, DEF_HP_WEIGHTS.boots);
    const necklaceDef = split(budget.defense, DEF_HP_WEIGHTS.necklace);
    const necklaceDefMax = split(upgradeBudget.defense, DEF_HP_WEIGHTS.necklace);
    const earringsDef = split(budget.defense, DEF_HP_WEIGHTS.earrings);
    const earringsDefMax = split(upgradeBudget.defense, DEF_HP_WEIGHTS.earrings);
    const ringDef = split(budget.defense, DEF_HP_WEIGHTS.ring);
    const ringDefMax = split(upgradeBudget.defense, DEF_HP_WEIGHTS.ring);

    const armorHp = split(budget.hp, DEF_HP_WEIGHTS.armor);
    const armorHpMax = split(upgradeBudget.hp, DEF_HP_WEIGHTS.armor);
    const helmetHp = split(budget.hp, DEF_HP_WEIGHTS.helmet);
    const helmetHpMax = split(upgradeBudget.hp, DEF_HP_WEIGHTS.helmet);
    const bootsHp = split(budget.hp, DEF_HP_WEIGHTS.boots);
    const bootsHpMax = split(upgradeBudget.hp, DEF_HP_WEIGHTS.boots);
    const necklaceHp = split(budget.hp, DEF_HP_WEIGHTS.necklace);
    const necklaceHpMax = split(upgradeBudget.hp, DEF_HP_WEIGHTS.necklace);
    const earringsHp = split(budget.hp, DEF_HP_WEIGHTS.earrings);
    const earringsHpMax = split(upgradeBudget.hp, DEF_HP_WEIGHTS.earrings);
    const ringHp = split(budget.hp, DEF_HP_WEIGHTS.ring);
    const ringHpMax = split(upgradeBudget.hp, DEF_HP_WEIGHTS.ring);

    const critBonus = Math.round((0.01 + tierIndex * 0.006) * 1000) / 1000;
    const evasionBonus = Math.round((0.01 + tierIndex * 0.005) * 1000) / 1000;
    const attackSpeedBonus = 1 + tierIndex;
    const critDamageBonus = Math.round((0.05 + tierIndex * 0.02) * 100) / 100;
    const damageReductionBonus = Math.round((0.01 + tierIndex * 0.005) * 1000) / 1000;

    const items: { id: string }[] = [];

    for (const cls of classes) {
      const flavor = CLASS_FLAVOR[cls.name];
      if (!flavor) continue;

      const weapon = await prisma.item.create({
        data: {
          name: `${flavor.weapon} ${tier.itemGenitive}`,
          type: "weapon",
          minLevel: tier.minLevel,
          classId: cls.id,
          baseStats: JSON.stringify({ attack: weaponAttack }),
          maxUpgradeStats: JSON.stringify({ attack: weaponAttackMax }),
          possibleStatRanges: JSON.stringify([
            { stat: "critChance", min: critBonus * 0.5, max: critBonus * 1.5, weight: 1 },
            { stat: "critDamage", min: critDamageBonus * 0.5, max: critDamageBonus * 1.5, weight: 1 },
          ]),
        },
      });
      const armor = await prisma.item.create({
        data: {
          name: `${flavor.armor} ${tier.itemGenitive}`,
          type: "armor",
          minLevel: tier.minLevel,
          classId: cls.id,
          baseStats: JSON.stringify({ defense: armorDef, hp: armorHp }),
          maxUpgradeStats: JSON.stringify({ defense: armorDefMax, hp: armorHpMax }),
          possibleStatRanges: JSON.stringify([
            { stat: "damageReduction", min: damageReductionBonus * 0.5, max: damageReductionBonus * 1.5, weight: 1 },
            { stat: "hp", min: Math.round(armorHp * 0.1), max: Math.round(armorHp * 0.25), weight: 1 },
          ]),
        },
      });
      const helmet = await prisma.item.create({
        data: {
          name: `Hełm ${flavor.genitive} ${tier.itemGenitive}`,
          type: "helmet",
          minLevel: tier.minLevel,
          classId: cls.id,
          baseStats: JSON.stringify({ defense: helmetDef, hp: helmetHp }),
          maxUpgradeStats: JSON.stringify({ defense: helmetDefMax, hp: helmetHpMax }),
          possibleStatRanges: JSON.stringify([
            { stat: "hp", min: Math.round(helmetHp * 0.1), max: Math.round(helmetHp * 0.25), weight: 1 },
            { stat: "defense", min: Math.round(helmetDef * 0.1), max: Math.round(helmetDef * 0.25), weight: 1 },
          ]),
        },
      });
      items.push(weapon, armor, helmet);
    }

    const boots = await prisma.item.create({
      data: {
        name: `Buty ${tier.itemGenitive}`,
        type: "boots",
        minLevel: tier.minLevel,
        baseStats: JSON.stringify({ defense: bootsDef, hp: bootsHp, movementSpeed: BOOTS_MOVEMENT_SPEED_PCT }),
        maxUpgradeStats: JSON.stringify({ defense: bootsDefMax, hp: bootsHpMax, movementSpeed: BOOTS_MOVEMENT_SPEED_PCT }),
        possibleStatRanges: JSON.stringify([
          { stat: "evasion", min: evasionBonus * 0.5, max: evasionBonus * 1.5, weight: 1 },
          { stat: "attackSpeed", min: 0, max: attackSpeedBonus, weight: 1 },
        ]),
      },
    });
    const necklace = await prisma.item.create({
      data: {
        name: `Naszyjnik ${tier.itemGenitive}`,
        type: "necklace",
        minLevel: tier.minLevel,
        baseStats: JSON.stringify({ attack: necklaceAttack, defense: necklaceDef, hp: necklaceHp }),
        maxUpgradeStats: JSON.stringify({ attack: necklaceAttackMax, defense: necklaceDefMax, hp: necklaceHpMax }),
        possibleStatRanges: JSON.stringify([
          { stat: "attack", min: Math.round(necklaceAttack * 0.1), max: Math.round(necklaceAttack * 0.25), weight: 1 },
          { stat: "critChance", min: critBonus * 0.5, max: critBonus * 1.5, weight: 1 },
        ]),
      },
    });
    const earrings = await prisma.item.create({
      data: {
        name: `Kolczyki ${tier.itemGenitive}`,
        type: "earrings",
        minLevel: tier.minLevel,
        baseStats: JSON.stringify({ defense: earringsDef, hp: earringsHp }),
        maxUpgradeStats: JSON.stringify({ defense: earringsDefMax, hp: earringsHpMax }),
        possibleStatRanges: JSON.stringify([
          { stat: "critChance", min: critBonus * 0.5, max: critBonus * 1.5, weight: 1 },
          { stat: "attackSpeed", min: 0, max: attackSpeedBonus, weight: 1 },
        ]),
      },
    });
    const ring = await prisma.item.create({
      data: {
        name: `Pierścień ${tier.itemGenitive}`,
        type: "ring",
        minLevel: tier.minLevel,
        baseStats: JSON.stringify({ attack: ringAttack, defense: ringDef, hp: ringHp }),
        maxUpgradeStats: JSON.stringify({ attack: ringAttackMax, defense: ringDefMax, hp: ringHpMax }),
        possibleStatRanges: JSON.stringify([
          { stat: "evasion", min: evasionBonus * 0.5, max: evasionBonus * 1.5, weight: 1 },
          { stat: "attackSpeed", min: 0, max: attackSpeedBonus, weight: 1 },
        ]),
      },
    });
    items.push(boots, necklace, earrings, ring);

    // Universal upgrade material for this tier + +1..+9 requirements on every equip item.
    const stone = await prisma.item.create({
      data: {
        name: stoneNameForTier(tier),
        type: "material",
        minLevel: tier.minLevel,
        stackable: true,
        maxStack: 999,
      },
    });
    await prisma.itemUpgradeRequirement.createMany({
      data: items.flatMap((item) =>
        Array.from({ length: 9 }, (_, i) => ({
          itemId: item.id,
          targetLevel: i + 1,
          requiredItemId: stone.id,
          requiredQty: (i + 1) * 2,
        })),
      ),
    });

    // Monsters: spread across the tier's level range, each with its own scaled stats.
    const levels = monsterLevelsForTier(tier);
    const names = monsterNamesForTier(tier);
    const monsters = await Promise.all(
      levels.map((level, i) => {
        const stats = monsterStatsForLevel(level);
        return prisma.monster.create({
          data: {
            name: names[i],
            level,
            hp: stats.hp,
            stats: JSON.stringify({ attack: stats.attack, defense: stats.defense }),
            expReward: stats.expReward,
            goldReward: stats.goldReward,
            drops: { create: [{ itemId: stone.id, dropChance: 0.3, minQty: 1, maxQty: 2 }] },
          },
        });
      }),
    );

    console.log(
      `${tier.zoneName} [${tier.minLevel}-${tier.maxLevel}]: ${monsters.length} potworów (poziomy ${levels.join(",")}), ${items.length} itemów + 1 kamień wzmocnienia`,
    );

    await prisma.zone.create({
      data: {
        name: tier.zoneName,
        minLevel: tier.minLevel,
        maxLevel: tier.maxLevel,
        travelTimeSeconds: tier.travelTimeSeconds,
        monsters: { create: monsters.map((m) => ({ monsterId: m.id, spawnWeight: 10, maxCount: 5 })) },
        drops: { create: items.map((item) => ({ itemId: item.id, dropChance: 0.04 })) },
      },
    });
  }

  console.log("Gotowe.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
