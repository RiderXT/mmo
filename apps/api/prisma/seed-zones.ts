/**
 * Balance-baseline content generator for zones spanning levels 1-99, per the design framework
 * worked out with the user: reference-build power curve (a universal 50% primary / 30%
 * vitality / 10%/10% secondary stat-split assumption, since equipment isn't class-restricted)
 * -> monster difficulty targeting a ~1:1.7 roundsToKill:roundsSurvivable ratio -> item stat
 * budget distributed across the 7 equip slots, shaped after the Metin2 reference data (flat
 * early growth, late-tier spike; boots carry movementSpeed as their unique secondary stat).
 *
 * Zones are ordered by minLevel (both here and in listZones()'s orderBy), matching the item
 * sets' own level ordering — keep new tiers in ascending level order when editing this file.
 *
 * movementSpeed on boots is a FLAT constant across every tier (BOOTS_MOVEMENT_SPEED_PCT), not
 * scaled up per tier — by design. Early game should feel like travel takes a while; later
 * stages add dedicated speed items (e.g. a mount/"koń") as the main lever for cutting it down,
 * not ever-better boots. Don't reintroduce per-tier scaling here without revisiting that plan.
 *
 * This is explicitly a FIRST-PASS BASELINE ("baza do dostosowania" per the user) - formulas are
 * simplifications (e.g. monster difficulty is tuned against a character already wearing that
 * zone's own full gear at the zone's minLevel, not modeling gear lag from the previous tier).
 * Safe to re-run after editing TIERS below — existing zones/monsters/items (matched by name)
 * are deleted and recreated rather than skipped, so tuning numbers is just "edit and re-run".
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BOOTS_MOVEMENT_SPEED_PCT = 0.1;

interface Tier {
  zoneName: string;
  monsterName: string;
  minLevel: number;
  maxLevel: number;
  travelTimeSeconds: number;
  itemPrefix: string;
}

const TIERS: Tier[] = [
  {
    zoneName: "Zapomniane Mokradła",
    monsterName: "Bagienny Pełzacz",
    minLevel: 11,
    maxLevel: 25,
    travelTimeSeconds: 60,
    itemPrefix: "Bagienny",
  },
  {
    zoneName: "Krwawy Wąwóz",
    monsterName: "Rozbójnik Wąwozu",
    minLevel: 26,
    maxLevel: 40,
    travelTimeSeconds: 100,
    itemPrefix: "Wąwozowy",
  },
  {
    zoneName: "Popielne Pustkowia",
    monsterName: "Popielny Golem",
    minLevel: 41,
    maxLevel: 55,
    travelTimeSeconds: 150,
    itemPrefix: "Popielny",
  },
  {
    zoneName: "Czarna Twierdza",
    monsterName: "Strażnik Twierdzy",
    minLevel: 56,
    maxLevel: 75,
    travelTimeSeconds: 220,
    itemPrefix: "Twierdzy",
  },
  {
    zoneName: "Otchłań Cieni",
    monsterName: "Cień Otchłani",
    minLevel: 76,
    maxLevel: 99,
    travelTimeSeconds: 300,
    itemPrefix: "Otchłanny",
  },
];

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

/** Deletes a previously-generated tier (by name) so it can be recreated with fresh numbers —
 * clears the FK chain that blocks a plain zone/monster/item delete: characters parked in the
 * zone, expeditions referencing it, then the zone/monster/item rows themselves. */
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

  const monster = await prisma.monster.findFirst({ where: { name: tier.monsterName } });
  if (monster) {
    await prisma.monsterDrop.deleteMany({ where: { monsterId: monster.id } });
    await prisma.monster.delete({ where: { id: monster.id } });
  }

  const items = await prisma.item.findMany({ where: { name: { startsWith: tier.itemPrefix } } });
  for (const item of items) {
    await prisma.inventoryItem.deleteMany({ where: { itemId: item.id } });
    await prisma.item.delete({ where: { id: item.id } });
  }
}

async function main() {
  for (const [index, tier] of TIERS.entries()) {
    await clearTier(tier);

    // Monster difficulty is targeted against a character already fully geared for THIS tier,
    // at the zone's minLevel (see module doc comment for the simplification this implies).
    const nakedAtMin = referenceNakedStats(tier.minLevel);
    const budgetAtMin = gearBudget(nakedAtMin);
    const gearedAtMin = {
      attack: nakedAtMin.attack + budgetAtMin.attack,
      defense: nakedAtMin.defense + budgetAtMin.defense,
      hp: nakedAtMin.hp + budgetAtMin.hp,
    };

    // HP persists across the whole expedition with no passive regen above 0 (only a slow 2%/min
    // trickle once it actually hits 0) — a single-encounter "rounds to kill vs rounds
    // survivable" ratio compounds harshly over ~30 sequential encounters, since every win still
    // chips away roundsToKill-1 rounds of unrecovered damage. Sizing monsterAttack against
    // maxHp/12 (not roundsSurvivable directly) means a character can absorb roughly a dozen
    // full encounters' worth of damage before running dry, which in practice yields a much
    // healthier win rate than a naive single-fight ratio would suggest.
    const targetRoundsToKill = 3;
    const monsterDefense = Math.round(gearedAtMin.attack * 0.25);
    const damagePerRound = gearedAtMin.attack - monsterDefense;
    const monsterHp = Math.round(damagePerRound * targetRoundsToKill);
    const monsterAttack = gearedAtMin.defense + Math.round(gearedAtMin.hp / 12 / (targetRoundsToKill - 1));
    const expReward = Math.round(monsterHp * 0.21);
    const goldReward = Math.round(monsterHp * 0.045);

    // Item budget is computed at the zone's maxLevel (top of the bracket — what a full set
    // should look like once fully "grown into", not just the entry-level minimum).
    const nakedAtMax = referenceNakedStats(tier.maxLevel);
    const budget = gearBudget(nakedAtMax);

    const weaponAttack = split(budget.attack, ATTACK_WEIGHTS.weapon);
    const necklaceAttack = split(budget.attack, ATTACK_WEIGHTS.necklace);
    const ringAttack = split(budget.attack, ATTACK_WEIGHTS.ring);

    const armorDef = split(budget.defense, DEF_HP_WEIGHTS.armor);
    const helmetDef = split(budget.defense, DEF_HP_WEIGHTS.helmet);
    const bootsDef = split(budget.defense, DEF_HP_WEIGHTS.boots);
    const necklaceDef = split(budget.defense, DEF_HP_WEIGHTS.necklace);
    const earringsDef = split(budget.defense, DEF_HP_WEIGHTS.earrings);
    const ringDef = split(budget.defense, DEF_HP_WEIGHTS.ring);

    const armorHp = split(budget.hp, DEF_HP_WEIGHTS.armor);
    const helmetHp = split(budget.hp, DEF_HP_WEIGHTS.helmet);
    const bootsHp = split(budget.hp, DEF_HP_WEIGHTS.boots);
    const necklaceHp = split(budget.hp, DEF_HP_WEIGHTS.necklace);
    const earringsHp = split(budget.hp, DEF_HP_WEIGHTS.earrings);
    const ringHp = split(budget.hp, DEF_HP_WEIGHTS.ring);

    const critBonus = Math.round((0.01 + index * 0.006) * 1000) / 1000;
    const evasionBonus = Math.round((0.01 + index * 0.005) * 1000) / 1000;

    console.log(
      `${tier.zoneName} [${tier.minLevel}-${tier.maxLevel}]: monster hp=${monsterHp} atk=${monsterAttack} def=${monsterDefense}, exp=${expReward} gold=${goldReward}, gear budget atk=${budget.attack} def=${budget.defense} hp=${budget.hp}`,
    );

    const items = await Promise.all([
      prisma.item.create({
        data: {
          name: `${tier.itemPrefix} Miecz`,
          type: "weapon",
          minLevel: tier.minLevel,
          baseStats: JSON.stringify({ attack: weaponAttack }),
          possibleStatRanges: JSON.stringify([
            { stat: "attack", min: Math.round(weaponAttack * 0.1), max: Math.round(weaponAttack * 0.25), weight: 1 },
          ]),
        },
      }),
      prisma.item.create({
        data: {
          name: `${tier.itemPrefix} Zbroja`,
          type: "armor",
          minLevel: tier.minLevel,
          baseStats: JSON.stringify({ defense: armorDef, hp: armorHp }),
          possibleStatRanges: JSON.stringify([
            { stat: "defense", min: Math.round(armorDef * 0.1), max: Math.round(armorDef * 0.25), weight: 1 },
          ]),
        },
      }),
      prisma.item.create({
        data: {
          name: `${tier.itemPrefix} Hełm`,
          type: "helmet",
          minLevel: tier.minLevel,
          baseStats: JSON.stringify({ defense: helmetDef, hp: helmetHp }),
          possibleStatRanges: JSON.stringify([
            { stat: "hp", min: Math.round(helmetHp * 0.1), max: Math.round(helmetHp * 0.25), weight: 1 },
          ]),
        },
      }),
      prisma.item.create({
        data: {
          name: `${tier.itemPrefix} Buty`,
          type: "boots",
          minLevel: tier.minLevel,
          baseStats: JSON.stringify({ defense: bootsDef, hp: bootsHp, movementSpeed: BOOTS_MOVEMENT_SPEED_PCT }),
          possibleStatRanges: JSON.stringify([
            { stat: "defense", min: Math.round(bootsDef * 0.1), max: Math.round(bootsDef * 0.25), weight: 1 },
          ]),
        },
      }),
      prisma.item.create({
        data: {
          name: `${tier.itemPrefix} Naszyjnik`,
          type: "necklace",
          minLevel: tier.minLevel,
          baseStats: JSON.stringify({ attack: necklaceAttack, defense: necklaceDef, hp: necklaceHp }),
          possibleStatRanges: JSON.stringify([
            { stat: "attack", min: Math.round(necklaceAttack * 0.1), max: Math.round(necklaceAttack * 0.25), weight: 1 },
          ]),
        },
      }),
      prisma.item.create({
        data: {
          name: `${tier.itemPrefix} Kolczyki`,
          type: "earrings",
          minLevel: tier.minLevel,
          baseStats: JSON.stringify({ defense: earringsDef, hp: earringsHp, critChance: critBonus }),
          possibleStatRanges: JSON.stringify([
            { stat: "critChance", min: critBonus * 0.5, max: critBonus * 1.5, weight: 1 },
          ]),
        },
      }),
      prisma.item.create({
        data: {
          name: `${tier.itemPrefix} Pierścień`,
          type: "ring",
          minLevel: tier.minLevel,
          baseStats: JSON.stringify({ attack: ringAttack, defense: ringDef, hp: ringHp, evasion: evasionBonus }),
          possibleStatRanges: JSON.stringify([
            { stat: "evasion", min: evasionBonus * 0.5, max: evasionBonus * 1.5, weight: 1 },
          ]),
        },
      }),
    ]);

    const monster = await prisma.monster.create({
      data: {
        name: tier.monsterName,
        level: Math.round((tier.minLevel + tier.maxLevel) / 2),
        hp: monsterHp,
        stats: JSON.stringify({ attack: monsterAttack, defense: monsterDefense }),
        expReward,
        goldReward,
        drops: { create: items.slice(0, 4).map((item) => ({ itemId: item.id, dropChance: 0.15, minQty: 1, maxQty: 1 })) },
      },
    });

    await prisma.zone.create({
      data: {
        name: tier.zoneName,
        minLevel: tier.minLevel,
        maxLevel: tier.maxLevel,
        travelTimeSeconds: tier.travelTimeSeconds,
        monsters: { create: [{ monsterId: monster.id, spawnWeight: 10, maxCount: 5 }] },
        drops: { create: items.map((item) => ({ itemId: item.id, dropChance: 0.05 })) },
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
