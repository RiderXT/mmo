import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = "admin@mmo.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} już istnieje, pomijam.`);
    return;
  }

  const passwordHash = await argon2.hash("ChangeMe123!", { type: argon2.argon2id });
  await prisma.user.create({ data: { email, passwordHash, role: "admin" } });
  console.log(`Utworzono konto admina: ${email} / ChangeMe123! (zmień hasło w produkcji!)`);
}

async function seedClasses() {
  const count = await prisma.characterClass.count();
  if (count > 0) {
    console.log("Klasy postaci już istnieją, pomijam.");
    return;
  }

  const classes = [
    {
      name: "Wojownik",
      description: "Silny wojownik walczący w zwarciu, wykorzystujący siłę i witalność.",
      primaryStat: "strength",
      skills: [
        { name: "Furia Bitewna", kind: "passive", scalingStat: "strength", scalingFactor: 0.6, targetStat: "attack" },
        { name: "Żelazna Skóra", kind: "passive", scalingStat: "vitality", scalingFactor: 0.4, targetStat: "defense" },
        { name: "Refleks Wojownika", kind: "passive", scalingStat: "dexterity", scalingFactor: 0.01, targetStat: "evasion" },
        { name: "Krytyczne Uderzenie", kind: "passive", scalingStat: "strength", scalingFactor: 0.005, targetStat: "critChance" },
        { name: "Cios Mocy", kind: "active", scalingStat: "strength", scalingFactor: 2, effectType: "damage", cooldownSeconds: 30, baseManaCost: 25 },
        { name: "Okrzyk Bojowy", kind: "active", scalingStat: "vitality", scalingFactor: 1, effectType: "heal", cooldownSeconds: 60, baseManaCost: 40 },
      ],
    },
    {
      name: "Strażnik",
      description: "Niewzruszony obrońca, wysoka witalność i odporność na obrażenia.",
      primaryStat: "vitality",
      skills: [
        { name: "Tarcza", kind: "passive", scalingStat: "vitality", scalingFactor: 0.6, targetStat: "defense" },
        { name: "Wytrzymałość", kind: "passive", scalingStat: "vitality", scalingFactor: 2, targetStat: "hp" },
        { name: "Opancerzenie", kind: "passive", scalingStat: "vitality", scalingFactor: 0.01, targetStat: "damageReduction" },
        { name: "Kontratak", kind: "passive", scalingStat: "strength", scalingFactor: 0.3, targetStat: "attack" },
        { name: "Uderzenie Tarczą", kind: "active", scalingStat: "vitality", scalingFactor: 1.5, effectType: "damage", cooldownSeconds: 45, baseManaCost: 30 },
        { name: "Samoleczenie", kind: "active", scalingStat: "vitality", scalingFactor: 1.5, effectType: "heal", cooldownSeconds: 40, baseManaCost: 30 },
      ],
    },
    {
      name: "Łotrzyk",
      description: "Zwinny i precyzyjny, opiera się na zręczności i krytykach.",
      primaryStat: "dexterity",
      skills: [
        { name: "Zwinność", kind: "passive", scalingStat: "dexterity", scalingFactor: 0.015, targetStat: "evasion" },
        { name: "Celność", kind: "passive", scalingStat: "dexterity", scalingFactor: 0.008, targetStat: "critChance" },
        { name: "Szybkie Ręce", kind: "passive", scalingStat: "dexterity", scalingFactor: 0.5, targetStat: "attackSpeed" },
        { name: "Skrytobójstwo", kind: "passive", scalingStat: "dexterity", scalingFactor: 0.05, targetStat: "critDamage" },
        { name: "Cios w Plecy", kind: "active", scalingStat: "dexterity", scalingFactor: 2.5, effectType: "damage", cooldownSeconds: 25, baseManaCost: 20 },
        { name: "Szybka Regeneracja", kind: "active", scalingStat: "dexterity", scalingFactor: 1, effectType: "heal", cooldownSeconds: 50, baseManaCost: 35 },
      ],
    },
    {
      name: "Mag",
      description: "Włada magią, potężne zaklęcia ofensywne skalowane inteligencją.",
      primaryStat: "intelligence",
      skills: [
        { name: "Moc Umysłu", kind: "passive", scalingStat: "intelligence", scalingFactor: 0.5, targetStat: "attack" },
        { name: "Rezerwy Many", kind: "passive", scalingStat: "intelligence", scalingFactor: 3, targetStat: "maxMana" },
        { name: "Osłona Magiczna", kind: "passive", scalingStat: "intelligence", scalingFactor: 0.008, targetStat: "damageReduction" },
        { name: "Precyzja Zaklęć", kind: "passive", scalingStat: "intelligence", scalingFactor: 0.006, targetStat: "critChance" },
        { name: "Ognista Kula", kind: "active", scalingStat: "intelligence", scalingFactor: 3, effectType: "damage", cooldownSeconds: 20, baseManaCost: 20 },
        { name: "Uzdrowienie", kind: "active", scalingStat: "intelligence", scalingFactor: 2, effectType: "heal", cooldownSeconds: 35, baseManaCost: 25 },
      ],
    },
  ] as const;

  for (const cls of classes) {
    await prisma.characterClass.create({
      data: {
        name: cls.name,
        description: cls.description,
        primaryStat: cls.primaryStat,
        skills: { create: cls.skills.map((s) => ({ ...s })) },
      },
    });
  }
  console.log(`Utworzono ${classes.length} klasy postaci po 6 umiejętności każda.`);
}

async function seedPassiveSkills() {
  const skills = [
    {
      name: "Rybak",
      description: "Rośnie z doświadczenia zdobywanego podczas łowienia. Podnosi szansę i szybkość połowu.",
      gatherKind: "fishing",
    },
    {
      name: "Górnik",
      description: "Rośnie z doświadczenia zdobywanego podczas wydobycia. Podnosi szansę i szybkość wydobycia.",
      gatherKind: "mining",
    },
  ] as const;

  for (const skill of skills) {
    const existing = await prisma.passiveSkillType.findUnique({ where: { name: skill.name } });
    if (existing) {
      console.log(`Umiejętność pasywna "${skill.name}" już istnieje, pomijam.`);
      continue;
    }
    await prisma.passiveSkillType.create({
      data: {
        name: skill.name,
        description: skill.description,
        maxLevel: 50,
        gatherKind: skill.gatherKind,
        chanceBonusPerLevel: 0.01,
        speedBonusPerLevel: 0.005,
        xpPerLevel: 50,
        xpPerGatherAction: 5,
        bookGateFromLevel: 10,
        booksRequiredPerLevel: 2,
      },
    });
    console.log(`Utworzono umiejętność pasywną "${skill.name}".`);
  }
}

async function seedWorldContent() {
  const count = await prisma.zone.count();
  if (count > 0) {
    console.log("Zawartość świata (krainy/itemy/potwory) już istnieje, pomijam.");
    return;
  }

  const sword = await prisma.item.create({
    data: {
      name: "Żelazny Miecz",
      type: "weapon",
      minLevel: 1,
      baseStats: JSON.stringify({ attack: 8 }),
      possibleStatRanges: JSON.stringify([{ stat: "attack", min: 1, max: 5, weight: 1 }]),
    },
  });

  const armor = await prisma.item.create({
    data: {
      name: "Skórzana Zbroja",
      type: "armor",
      minLevel: 1,
      baseStats: JSON.stringify({ defense: 5, hp: 10 }),
      possibleStatRanges: JSON.stringify([{ stat: "defense", min: 1, max: 3, weight: 1 }]),
    },
  });

  const fang = await prisma.item.create({
    data: { name: "Wilczy Kieł", type: "material", minLevel: 1, stackable: true, maxStack: 99 },
  });

  await prisma.itemUpgradeRequirement.create({
    data: { itemId: sword.id, targetLevel: 1, requiredItemId: fang.id, requiredQty: 3 },
  });

  await prisma.item.create({
    data: {
      name: "Mikstura Życia",
      type: "consumable",
      minLevel: 1,
      stackable: true,
      maxStack: 20,
      potionTrigger: "hp_below",
      potionThresholdPct: 0.3,
      potionEffect: "restore_hp",
      potionMagnitudePct: 0.3,
    },
  });

  await prisma.item.create({
    data: {
      name: "Mikstura Many",
      type: "consumable",
      minLevel: 1,
      stackable: true,
      maxStack: 20,
      potionTrigger: "mana_below",
      potionThresholdPct: 0.3,
      potionEffect: "restore_mana",
      potionMagnitudePct: 0.3,
    },
  });

  await prisma.item.create({
    data: {
      name: "Eliksir Szybkości",
      type: "consumable",
      minLevel: 1,
      stackable: true,
      maxStack: 20,
      potionTrigger: "interval",
      potionIntervalSec: 600,
      potionEffect: "buff_attack_speed",
      potionMagnitudePct: 0.2,
      potionDurationSec: 60,
    },
  });

  const wolf = await prisma.monster.create({
    data: {
      name: "Szary Wilk",
      level: 3,
      hp: 120,
      stats: JSON.stringify({ attack: 8, defense: 2 }),
      expReward: 25,
      goldReward: 5,
      drops: { create: [{ itemId: fang.id, dropChance: 0.5, minQty: 1, maxQty: 2 }] },
    },
  });

  await prisma.zone.create({
    data: {
      name: "Wilcze Uroczysko",
      minLevel: 1,
      maxLevel: 10,
      travelTimeSeconds: 30,
      monsters: { create: [{ monsterId: wolf.id, spawnWeight: 10, maxCount: 5 }] },
      drops: { create: [{ itemId: sword.id, dropChance: 0.01 }] },
    },
  });

  console.log("Utworzono przykładową zawartość świata: itemy, potiony, potwora i krainę.");
}

/**
 * Bez tego świeżo zasiana baza (nowe wdrożenie) nie ma żadnej krainy `isTown:true` — AnvilTab.tsx
 * i NpcTab.tsx sprawdzają `currentZone?.isTown` przez `zones.find(z => z.id === character.currentZoneId)`,
 * więc bez realnej krainy-miasta Kowadło/NPC są nieosiągalne dla każdego gracza (zgłoszone i
 * potwierdzone w docs/architecture.md, notatka przy Etapie "restyling kowalstwa"). Osobno od
 * `seedWorldContent()` (i nie gated za `zone.count() > 0`) żeby dało się bezpiecznie douruchomić
 * na już zasianej bazie (dev.db albo produkcja), której brakuje samego miasta.
 */
async function seedTownZone() {
  const existing = await prisma.zone.findFirst({ where: { isTown: true } });
  if (existing) {
    console.log(`Kraina-miasto już istnieje (${existing.name}), pomijam.`);
    return;
  }

  await prisma.zone.create({
    data: {
      name: "Miasto",
      minLevel: 1,
      maxLevel: 1,
      travelTimeSeconds: 20,
      isTown: true,
    },
  });
  console.log("Utworzono krainę-miasto startowe (Kowadło/NPC dostępne od razu po utworzeniu postaci).");
}

async function main() {
  await seedAdmin();
  await seedClasses();
  await seedPassiveSkills();
  await seedWorldContent();
  await seedTownZone();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
