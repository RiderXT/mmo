import type { StatBlock, StatKey, CoreStatKey, ExpeditionResult, CombatEvent } from "@mmo/shared";

export interface CharacterCoreStats {
  strength: number;
  vitality: number;
  dexterity: number;
  intelligence: number;
}

export interface DerivedStats {
  maxHp: number;
  maxMana: number;
  attack: number;
  defense: number;
  attackSpeed: number;
  critChance: number;
  critDamage: number;
  evasion: number;
  damageReduction: number;
  /** Out-of-combat only: shortens travel time to/from a zone. See startExpedition in service.ts. */
  movementSpeedPct: number;
}

export interface PassiveSkillBonus {
  scalingStat: CoreStatKey;
  scalingFactor: number;
  targetStat: StatKey;
  level: number;
}

export interface ActiveSkillDef {
  id: string;
  name: string;
  power: number; // scalingFactor * coreStat * level, precomputed by the caller
  manaCost: number;
  effectType: "damage" | "heal";
  cooldownSeconds: number;
}

export interface PotionSlot {
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  trigger: "hp_below" | "mana_below" | "interval";
  thresholdPct: number | null;
  intervalSeconds: number | null;
  effect: "restore_hp" | "restore_mana" | "buff_attack_speed" | "buff_attack" | "buff_defense";
  magnitudePct: number;
  durationSeconds: number | null;
}

export interface SimMonster {
  monsterId: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  expReward: number;
  goldReward: number;
  spawnWeight: number;
  drops: { itemId: string; dropChance: number; minQty: number; maxQty: number }[];
}

export interface SimZone {
  monsters: SimMonster[];
  drops: { itemId: string; dropChance: number }[];
}

export interface SimulationOutcome {
  result: ExpeditionResult;
  /** inventoryItemId -> quantity consumed, to be decremented from inventory at expedition start. */
  potionsConsumed: Map<string, number>;
  /** Full timeline, revealed progressively client-side in sync with the countdown. */
  events: CombatEvent[];
}

/**
 * Derived combat stats from base allocated stats + summed equipment stats + passive skill
 * bonuses (scalingFactor × relevant core stat × invested skill level). Formulas are a
 * deliberately simple starting point for balance — see docs/architecture.md.
 */
export function computeDerivedStats(
  core: CharacterCoreStats,
  equipmentStats: StatBlock[],
  passiveSkills: PassiveSkillBonus[],
): DerivedStats {
  const sumEquip = (key: StatKey) => equipmentStats.reduce((sum, s) => sum + (s[key] ?? 0), 0);
  const sumPassive = (key: StatKey) =>
    passiveSkills
      .filter((p) => p.targetStat === key)
      .reduce((sum, p) => sum + p.scalingFactor * core[p.scalingStat] * p.level, 0);
  const bonus = (key: StatKey) => sumEquip(key) + sumPassive(key);

  return {
    maxHp: Math.max(1, Math.round(50 + core.vitality * 10 + bonus("hp"))),
    maxMana: Math.max(0, Math.round(20 + core.intelligence * 5 + bonus("maxMana"))),
    attack: Math.max(1, Math.round(5 + core.strength * 2 + core.dexterity * 0.5 + bonus("attack"))),
    defense: Math.max(0, Math.round(2 + core.vitality * 1 + bonus("defense"))),
    attackSpeed: Math.max(1, Math.round(10 + core.dexterity * 0.3 + bonus("attackSpeed"))),
    critChance: Math.min(0.75, Math.max(0, 0.05 + core.dexterity * 0.002 + bonus("critChance"))),
    critDamage: Math.max(1, 1.5 + bonus("critDamage")),
    evasion: Math.min(0.6, Math.max(0, 0.02 + core.dexterity * 0.001 + bonus("evasion"))),
    damageReduction: Math.min(0.7, Math.max(0, bonus("damageReduction"))),
    // Equipment/passive-skill only — no core-stat baseline, unlike attackSpeed.
    movementSpeedPct: Math.min(0.75, Math.max(0, bonus("movementSpeed"))),
  };
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeighted<T>(items: T[], weight: (item: T) => number): T | null {
  if (items.length === 0) return null;
  const totalWeight = items.reduce((sum, item) => sum + weight(item), 0);
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= weight(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

const PASSIVE_REGEN_PER_MINUTE = 0.02; // 2% of maxHp, recovered on minutes with no fight (hp was 0)
const MANA_REGEN_PER_SECOND_PCT = 0.001; // 0.1% of maxMana per second
const DEFAULT_BUFF_DURATION_SECONDS = 60;
const THRESHOLD_POTION_COOLDOWN_SECONDS = 5;

/**
 * Deterministic combat simulation for one full expedition. HP/mana persist across the whole
 * expedition (not reset per encounter) so threshold-based potions are meaningful. One
 * encounter is resolved per minute of expedition duration, using a "rounds to kill vs rounds
 * survivable" comparison rather than a full per-round loop — cheap and deterministic while
 * still reflecting the character's build (stats, equipment, skills, potions).
 */
export function simulateExpedition(
  zone: SimZone,
  stats: DerivedStats,
  activeSkills: ActiveSkillDef[],
  potions: PotionSlot[],
  durationMinutes: number,
): SimulationOutcome {
  let hp = stats.maxHp;
  let mana = stats.maxMana;
  let expGained = 0;
  let goldGained = 0;
  let monstersDefeated = 0;

  const events: CombatEvent[] = [];
  const lootMap = new Map<string, number>();
  const potionsConsumed = new Map<string, number>();
  const potionRemaining = new Map(potions.map((p) => [p.inventoryItemId, p.quantity]));
  const potionNextInterval = new Map(
    potions.filter((p) => p.trigger === "interval").map((p) => [p.inventoryItemId, p.intervalSeconds ?? 600]),
  );
  // Short reuse cooldown for threshold-triggered potions so a sustained dip below the
  // threshold doesn't chug the whole stack one-per-second — sip, wait, re-check.
  const potionNextThresholdCheck = new Map<string, number>();
  const skillNextAvailable = new Map(activeSkills.map((s) => [s.id, 0]));

  let attackSpeedBuffUntil = 0;
  let attackSpeedBuffPct = 0;
  let attackBuffUntil = 0;
  let attackBuffPct = 0;
  let defenseBuffUntil = 0;
  let defenseBuffPct = 0;

  function tryConsumePotion(p: PotionSlot, second: number): boolean {
    const remaining = potionRemaining.get(p.inventoryItemId) ?? 0;
    if (remaining <= 0) return false;
    potionRemaining.set(p.inventoryItemId, remaining - 1);
    potionsConsumed.set(p.inventoryItemId, (potionsConsumed.get(p.inventoryItemId) ?? 0) + 1);

    const buffUntil = second + (p.durationSeconds ?? DEFAULT_BUFF_DURATION_SECONDS);
    switch (p.effect) {
      case "restore_hp":
        hp = Math.min(stats.maxHp, hp + stats.maxHp * p.magnitudePct);
        break;
      case "restore_mana":
        mana = Math.min(stats.maxMana, mana + stats.maxMana * p.magnitudePct);
        break;
      case "buff_attack_speed":
        attackSpeedBuffUntil = buffUntil;
        attackSpeedBuffPct = p.magnitudePct;
        break;
      case "buff_attack":
        attackBuffUntil = buffUntil;
        attackBuffPct = p.magnitudePct;
        break;
      case "buff_defense":
        defenseBuffUntil = buffUntil;
        defenseBuffPct = p.magnitudePct;
        break;
    }
    events.push({ t: second, type: "potion_used", itemName: p.itemName, effect: p.effect });
    return true;
  }

  const addLoot = (itemId: string, qty: number) => lootMap.set(itemId, (lootMap.get(itemId) ?? 0) + qty);
  const totalSeconds = Math.max(60, durationMinutes * 60);

  for (let second = 1; second <= totalSeconds; second++) {
    for (const p of potions) {
      if ((potionRemaining.get(p.inventoryItemId) ?? 0) <= 0) continue;
      const thresholdReady = second >= (potionNextThresholdCheck.get(p.inventoryItemId) ?? 0);
      if (thresholdReady && p.trigger === "hp_below" && p.thresholdPct != null && hp / stats.maxHp < p.thresholdPct) {
        if (tryConsumePotion(p, second)) {
          potionNextThresholdCheck.set(p.inventoryItemId, second + THRESHOLD_POTION_COOLDOWN_SECONDS);
        }
      } else if (
        thresholdReady &&
        p.trigger === "mana_below" &&
        p.thresholdPct != null &&
        stats.maxMana > 0 &&
        mana / stats.maxMana < p.thresholdPct
      ) {
        if (tryConsumePotion(p, second)) {
          potionNextThresholdCheck.set(p.inventoryItemId, second + THRESHOLD_POTION_COOLDOWN_SECONDS);
        }
      } else if (p.trigger === "interval") {
        const next = potionNextInterval.get(p.inventoryItemId) ?? Infinity;
        if (second >= next && tryConsumePotion(p, second)) {
          potionNextInterval.set(p.inventoryItemId, second + (p.intervalSeconds ?? 600));
        }
      }
    }

    mana = Math.min(stats.maxMana, mana + stats.maxMana * MANA_REGEN_PER_SECOND_PCT);

    if (second % 60 !== 0) continue;

    if (hp <= 0) {
      hp = Math.min(stats.maxHp, hp + stats.maxHp * PASSIVE_REGEN_PER_MINUTE);
      continue;
    }

    const monster = pickWeighted(zone.monsters, (m) => m.spawnWeight);
    if (!monster) continue;

    events.push({ t: second, type: "encounter_start", monsterName: monster.name, monsterHp: monster.hp });

    let burstDamage = 0;
    for (const skill of activeSkills) {
      const nextAt = skillNextAvailable.get(skill.id) ?? 0;
      if (second < nextAt || mana < skill.manaCost) continue;
      mana -= skill.manaCost;
      skillNextAvailable.set(skill.id, second + skill.cooldownSeconds);
      if (skill.effectType === "damage") burstDamage += skill.power;
      else hp = Math.min(stats.maxHp, hp + skill.power);
      events.push({
        t: second,
        type: "skill_activated",
        skillName: skill.name,
        effectType: skill.effectType,
        power: Math.round(skill.power),
      });
    }

    const effectiveAttack = stats.attack * (1 + (second <= attackBuffUntil ? attackBuffPct : 0));
    const speedMultiplier =
      (stats.attackSpeed * (1 + (second <= attackSpeedBuffUntil ? attackSpeedBuffPct : 0))) / 10;
    const effectiveDefense = stats.defense * (1 + (second <= defenseBuffUntil ? defenseBuffPct : 0));

    const crit = Math.random() < stats.critChance;
    const characterDamage =
      Math.max(1, effectiveAttack - monster.defense) * (crit ? stats.critDamage : 1) * speedMultiplier +
      burstDamage;

    const monsterHits = Math.random() >= stats.evasion;
    const effectiveMonsterDamage = monsterHits
      ? Math.max(0, monster.attack - effectiveDefense) * (1 - stats.damageReduction)
      : 0;

    const roundsToKill = Math.max(1, Math.ceil(monster.hp / characterDamage));
    const roundsSurvivable = effectiveMonsterDamage > 0 ? Math.ceil(hp / effectiveMonsterDamage) : Infinity;
    const won = roundsToKill <= roundsSurvivable;
    const monsterRoundsLanded = won ? Math.max(0, roundsToKill - 1) : roundsSurvivable;

    events.push({
      t: second,
      type: "player_attack",
      baseAttack: Math.round(effectiveAttack),
      monsterDefense: monster.defense,
      skillBonus: Math.round(burstDamage),
      damagePerRound: Math.round(characterDamage),
      rounds: won ? roundsToKill : roundsSurvivable,
      crit,
    });
    events.push({
      t: second,
      type: "monster_attack",
      monsterAttack: monster.attack,
      characterDefense: Math.round(effectiveDefense),
      damagePerRound: Math.round(effectiveMonsterDamage),
      rounds: monsterRoundsLanded,
      evaded: !monsterHits,
    });

    if (won) {
      hp = Math.max(1, hp - effectiveMonsterDamage * monsterRoundsLanded);
      monstersDefeated += 1;
      expGained += monster.expReward;
      goldGained += monster.goldReward;
      for (const drop of monster.drops) {
        if (Math.random() < drop.dropChance) {
          const qty = randomInt(drop.minQty, drop.maxQty);
          addLoot(drop.itemId, qty);
          events.push({ t: second, type: "loot", itemId: drop.itemId, quantity: qty });
        }
      }
      for (const zoneDrop of zone.drops) {
        if (Math.random() < zoneDrop.dropChance) {
          addLoot(zoneDrop.itemId, 1);
          events.push({ t: second, type: "loot", itemId: zoneDrop.itemId, quantity: 1 });
        }
      }
    } else {
      hp = Math.max(0, hp - effectiveMonsterDamage * roundsSurvivable);
    }

    events.push({
      t: second,
      type: "encounter_result",
      won,
      monsterName: monster.name,
      expGained: won ? monster.expReward : 0,
      goldGained: won ? monster.goldReward : 0,
    });
  }

  return {
    result: {
      expGained,
      goldGained,
      monstersDefeated,
      loot: Array.from(lootMap.entries()).map(([itemId, quantity]) => ({ itemId, quantity })),
    },
    potionsConsumed,
    events,
  };
}
