import type { StatBlock, StatKey, CoreStatKey, ExpeditionResult, CombatEvent } from "@mmo/shared";

/**
 * Interpolates an item's stats between +0 (base) and +9 (maxUpgradeStats) by its current
 * upgrade level. A stat present in `base` but missing from `max` doesn't grow with upgrades
 * (e.g. a random-rolled bonus stat that isn't part of the item's own refine progression) —
 * random `rolledStats` are never passed through this function, only the item's base stats.
 *
 * Deliberately NOT rounded here — StatKey mixes large integer stats (attack/defense/hp) with
 * small fractional ones (movementSpeed, critChance, evasion, ...); rounding unconditionally
 * would floor e.g. 0.1 movementSpeed to 0. computeDerivedStats already rounds each derived
 * stat appropriately once all contributions (equipment + passives + core) are summed.
 */
export function interpolateUpgrade(base: StatBlock, max: StatBlock, level: number): StatBlock {
  const t = Math.min(9, Math.max(0, level)) / 9;
  const keys = new Set([...Object.keys(base), ...Object.keys(max)]) as Set<StatKey>;
  const result: StatBlock = {};
  for (const key of keys) {
    const b = base[key] ?? 0;
    const m = max[key] ?? b;
    result[key] = b + (m - b) * t;
  }
  return result;
}

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
  // 1 + sum of unlocked "magnitude" tree-node percentages for this skill (see gatherCombatBuild).
  magnitudeMultiplier: number;
}

export interface ActiveSkillDef {
  id: string;
  name: string;
  power: number; // scalingFactor * coreStat * magnitudeMultiplier, precomputed by the caller
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
  level: number;
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
      .reduce((sum, p) => sum + p.scalingFactor * core[p.scalingStat] * p.magnitudeMultiplier, 0);
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

export interface StatContribution {
  base: number;
  equipment: number;
  passive: number;
  total: number;
}

export type DerivedStatsBreakdown = Record<keyof DerivedStats, StatContribution>;

function contribution(base: number, equipment: number, passive: number, clamp: (raw: number) => number): StatContribution {
  return { base, equipment, passive, total: clamp(base + equipment + passive) };
}

/** Same formulas/clamping as computeDerivedStats, but keeping the base/equipment/passive
 * components separate instead of collapsing them into one number — used by the "Postać" tab's
 * stat breakdown (see docs/architecture.md "Etap 20"). `total` here always equals the
 * corresponding field from computeDerivedStats for the same inputs. */
export function computeDerivedStatsBreakdown(
  core: CharacterCoreStats,
  equipmentStats: StatBlock[],
  passiveSkills: PassiveSkillBonus[],
): DerivedStatsBreakdown {
  const sumEquip = (key: StatKey) => equipmentStats.reduce((sum, s) => sum + (s[key] ?? 0), 0);
  const sumPassive = (key: StatKey) =>
    passiveSkills
      .filter((p) => p.targetStat === key)
      .reduce((sum, p) => sum + p.scalingFactor * core[p.scalingStat] * p.magnitudeMultiplier, 0);

  return {
    maxHp: contribution(50 + core.vitality * 10, sumEquip("hp"), sumPassive("hp"), (v) => Math.max(1, Math.round(v))),
    maxMana: contribution(
      20 + core.intelligence * 5,
      sumEquip("maxMana"),
      sumPassive("maxMana"),
      (v) => Math.max(0, Math.round(v)),
    ),
    attack: contribution(
      5 + core.strength * 2 + core.dexterity * 0.5,
      sumEquip("attack"),
      sumPassive("attack"),
      (v) => Math.max(1, Math.round(v)),
    ),
    defense: contribution(2 + core.vitality * 1, sumEquip("defense"), sumPassive("defense"), (v) => Math.max(0, Math.round(v))),
    attackSpeed: contribution(
      10 + core.dexterity * 0.3,
      sumEquip("attackSpeed"),
      sumPassive("attackSpeed"),
      (v) => Math.max(1, Math.round(v)),
    ),
    critChance: contribution(
      0.05 + core.dexterity * 0.002,
      sumEquip("critChance"),
      sumPassive("critChance"),
      (v) => Math.min(0.75, Math.max(0, v)),
    ),
    critDamage: contribution(1.5, sumEquip("critDamage"), sumPassive("critDamage"), (v) => Math.max(1, v)),
    evasion: contribution(
      0.02 + core.dexterity * 0.001,
      sumEquip("evasion"),
      sumPassive("evasion"),
      (v) => Math.min(0.6, Math.max(0, v)),
    ),
    damageReduction: contribution(0, sumEquip("damageReduction"), sumPassive("damageReduction"), (v) =>
      Math.min(0.7, Math.max(0, v)),
    ),
    // Equipment/passive-skill only — no core-stat baseline, unlike attackSpeed.
    movementSpeedPct: contribution(0, sumEquip("movementSpeed"), sumPassive("movementSpeed"), (v) =>
      Math.min(0.75, Math.max(0, v)),
    ),
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

const MANA_REGEN_PER_SECOND_PCT = 0.001; // 0.1% of maxMana per second
const DEFAULT_BUFF_DURATION_SECONDS = 60;
const THRESHOLD_POTION_COOLDOWN_SECONDS = 5;
// One round = one exchange of blows (player hits, monster hits back if it survived) — ticks
// every ROUND_SECONDS of simulated time, so the client can reveal it as a visibly live event.
const ROUND_SECONDS = 3;
// Independent hard safety cap on event count, on top of the duration-minutes cap below — a
// character strong enough to never die must not be able to generate an unbounded eventLog just
// because an admin later raises the duration-minutes setting. ~2.5h of simulated fighting.
const MAX_ROUNDS = 3000;

/**
 * Deterministic combat simulation for one full expedition. HP/mana persist across the whole
 * expedition (not reset per encounter). Combat runs round-by-round (see ROUND_SECONDS) — crit
 * and evasion are re-rolled every round rather than once per (formerly aggregated) encounter —
 * until the character dies (`character_died`, terminal) or a safety time/round limit is hit
 * (`fight_time_limit_reached`, terminal) — whichever comes first. `durationMinutes` is a safety
 * cap, not a guaranteed length: most fights end in death well before it.
 */
export interface EventBonusDrop {
  itemId: string;
  dropChance: number;
}

export function simulateExpedition(
  zone: SimZone,
  stats: DerivedStats,
  activeSkills: ActiveSkillDef[],
  potions: PotionSlot[],
  durationMinutes: number,
  expMultiplier = 1,
  goldMultiplier = 1,
  eventBonusDrop: EventBonusDrop | null = null,
  dropChanceMultiplier = 1,
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
  // threshold doesn't chug the whole stack round after round — sip, wait, re-check.
  const potionNextThresholdCheck = new Map<string, number>();
  const skillNextAvailable = new Map(activeSkills.map((s) => [s.id, 0]));

  let attackSpeedBuffUntil = 0;
  let attackSpeedBuffPct = 0;
  let attackBuffUntil = 0;
  let attackBuffPct = 0;
  let defenseBuffUntil = 0;
  let defenseBuffPct = 0;
  // Heal-over-time state for restore_hp/restore_mana potions configured with durationSeconds —
  // same "buff until timestamp" pattern as the buffs above, but adding a per-second amount
  // instead of a percentage multiplier.
  let hpHotUntil = 0;
  let hpHotPerSecond = 0;
  let manaHotUntil = 0;
  let manaHotPerSecond = 0;

  function tryConsumePotion(p: PotionSlot, t: number): boolean {
    const remaining = potionRemaining.get(p.inventoryItemId) ?? 0;
    if (remaining <= 0) return false;
    potionRemaining.set(p.inventoryItemId, remaining - 1);
    potionsConsumed.set(p.inventoryItemId, (potionsConsumed.get(p.inventoryItemId) ?? 0) + 1);

    const buffUntil = t + (p.durationSeconds ?? DEFAULT_BUFF_DURATION_SECONDS);
    let amount = 0;
    switch (p.effect) {
      case "restore_hp": {
        const totalAmount = stats.maxHp * p.magnitudePct;
        if (p.durationSeconds) {
          hpHotUntil = t + p.durationSeconds;
          hpHotPerSecond = totalAmount / p.durationSeconds;
          amount = Math.round(totalAmount);
        } else {
          const before = hp;
          hp = Math.min(stats.maxHp, hp + totalAmount);
          amount = Math.round(hp - before);
        }
        break;
      }
      case "restore_mana": {
        const totalAmount = stats.maxMana * p.magnitudePct;
        if (p.durationSeconds) {
          manaHotUntil = t + p.durationSeconds;
          manaHotPerSecond = totalAmount / p.durationSeconds;
          amount = Math.round(totalAmount);
        } else {
          const before = mana;
          mana = Math.min(stats.maxMana, mana + totalAmount);
          amount = Math.round(mana - before);
        }
        break;
      }
      case "buff_attack_speed":
        attackSpeedBuffUntil = buffUntil;
        attackSpeedBuffPct = p.magnitudePct;
        amount = Math.round(p.magnitudePct * 100);
        break;
      case "buff_attack":
        attackBuffUntil = buffUntil;
        attackBuffPct = p.magnitudePct;
        amount = Math.round(p.magnitudePct * 100);
        break;
      case "buff_defense":
        defenseBuffUntil = buffUntil;
        defenseBuffPct = p.magnitudePct;
        amount = Math.round(p.magnitudePct * 100);
        break;
    }
    events.push({
      t,
      type: "potion_used",
      itemName: p.itemName,
      effect: p.effect,
      amount,
      playerHpAfter: Math.max(0, Math.round(hp)),
      playerManaAfter: Math.max(0, Math.round(mana)),
    });
    return true;
  }

  const addLoot = (itemId: string, qty: number) => lootMap.set(itemId, (lootMap.get(itemId) ?? 0) + qty);
  const maxSeconds = Math.max(60, durationMinutes * 60);

  let t = 0;
  let roundsEmitted = 0;
  let currentMonster: SimMonster | null = null;
  let monsterHp = 0;

  while (t + ROUND_SECONDS <= maxSeconds && roundsEmitted < MAX_ROUNDS) {
    t += ROUND_SECONDS;

    for (const p of potions) {
      if ((potionRemaining.get(p.inventoryItemId) ?? 0) <= 0) continue;
      const thresholdReady = t >= (potionNextThresholdCheck.get(p.inventoryItemId) ?? 0);
      if (thresholdReady && p.trigger === "hp_below" && p.thresholdPct != null && hp / stats.maxHp < p.thresholdPct) {
        if (tryConsumePotion(p, t)) {
          potionNextThresholdCheck.set(p.inventoryItemId, t + THRESHOLD_POTION_COOLDOWN_SECONDS);
        }
      } else if (
        thresholdReady &&
        p.trigger === "mana_below" &&
        p.thresholdPct != null &&
        stats.maxMana > 0 &&
        mana / stats.maxMana < p.thresholdPct
      ) {
        if (tryConsumePotion(p, t)) {
          potionNextThresholdCheck.set(p.inventoryItemId, t + THRESHOLD_POTION_COOLDOWN_SECONDS);
        }
      } else if (p.trigger === "interval") {
        const next = potionNextInterval.get(p.inventoryItemId) ?? Infinity;
        if (t >= next && tryConsumePotion(p, t)) {
          potionNextInterval.set(p.inventoryItemId, t + (p.intervalSeconds ?? 600));
        }
      }
    }

    mana = Math.min(stats.maxMana, mana + stats.maxMana * MANA_REGEN_PER_SECOND_PCT * ROUND_SECONDS);
    if (t <= hpHotUntil) hp = Math.min(stats.maxHp, hp + hpHotPerSecond * ROUND_SECONDS);
    if (t <= manaHotUntil) mana = Math.min(stats.maxMana, mana + manaHotPerSecond * ROUND_SECONDS);

    if (!currentMonster) {
      currentMonster = pickWeighted(zone.monsters, (m) => m.spawnWeight);
      if (!currentMonster) break; // defensive — buildAndSimulate already guarantees a non-empty pool
      monsterHp = currentMonster.hp;
      events.push({
        t,
        type: "encounter_start",
        monsterId: currentMonster.monsterId,
        monsterName: currentMonster.name,
        monsterLevel: currentMonster.level,
        monsterMaxHp: currentMonster.hp,
      });
    }

    let burstDamage = 0;
    for (const skill of activeSkills) {
      const nextAt = skillNextAvailable.get(skill.id) ?? 0;
      if (t < nextAt || mana < skill.manaCost) continue;
      mana -= skill.manaCost;
      skillNextAvailable.set(skill.id, t + skill.cooldownSeconds);
      if (skill.effectType === "damage") burstDamage += skill.power;
      else hp = Math.min(stats.maxHp, hp + skill.power);
      events.push({
        t,
        type: "skill_activated",
        skillName: skill.name,
        effectType: skill.effectType,
        power: Math.round(skill.power),
        playerHpAfter: Math.max(0, Math.round(hp)),
        playerManaAfter: Math.max(0, Math.round(mana)),
      });
    }

    const effectiveAttack = stats.attack * (1 + (t <= attackBuffUntil ? attackBuffPct : 0));
    const speedMultiplier = (stats.attackSpeed * (1 + (t <= attackSpeedBuffUntil ? attackSpeedBuffPct : 0))) / 10;
    const effectiveDefense = stats.defense * (1 + (t <= defenseBuffUntil ? defenseBuffPct : 0));

    const crit = Math.random() < stats.critChance;
    const playerDamage =
      Math.max(1, effectiveAttack - currentMonster.defense) * (crit ? stats.critDamage : 1) * speedMultiplier +
      burstDamage;
    monsterHp -= playerDamage;

    let monsterDamage = 0;
    let monsterEvaded = false;
    if (monsterHp > 0) {
      // The killing blow doesn't get countered — the monster only hits back if it survived.
      monsterEvaded = Math.random() < stats.evasion;
      monsterDamage = monsterEvaded
        ? 0
        : Math.max(0, currentMonster.attack - effectiveDefense) * (1 - stats.damageReduction);
      hp -= monsterDamage;
    }

    events.push({
      t,
      type: "round",
      playerDamage: Math.round(playerDamage),
      playerCrit: crit,
      monsterHpAfter: Math.max(0, Math.round(monsterHp)),
      monsterDamage: Math.round(monsterDamage),
      monsterEvaded,
      playerHpAfter: Math.max(0, Math.round(hp)),
    });
    roundsEmitted += 1;

    if (hp <= 0) {
      events.push({ t, type: "character_died" });
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

    if (monsterHp <= 0) {
      monstersDefeated += 1;
      const expReward = Math.round(currentMonster.expReward * expMultiplier);
      const goldReward = Math.round(currentMonster.goldReward * goldMultiplier);
      expGained += expReward;
      goldGained += goldReward;
      for (const drop of currentMonster.drops) {
        if (Math.random() < Math.min(1, drop.dropChance * dropChanceMultiplier)) {
          const qty = randomInt(drop.minQty, drop.maxQty);
          addLoot(drop.itemId, qty);
          events.push({ t, type: "loot", itemId: drop.itemId, quantity: qty });
        }
      }
      for (const zoneDrop of zone.drops) {
        if (Math.random() < Math.min(1, zoneDrop.dropChance * dropChanceMultiplier)) {
          addLoot(zoneDrop.itemId, 1);
          events.push({ t, type: "loot", itemId: zoneDrop.itemId, quantity: 1 });
        }
      }
      // Event bonus drop (see docs/architecture.md "Etap 19") — same chance, same item, on
      // every kill in every zone while an event configures one, independent of that zone's own
      // drop table.
      if (eventBonusDrop && Math.random() < Math.min(1, eventBonusDrop.dropChance * dropChanceMultiplier)) {
        addLoot(eventBonusDrop.itemId, 1);
        events.push({ t, type: "loot", itemId: eventBonusDrop.itemId, quantity: 1 });
      }
      events.push({
        t,
        type: "encounter_result",
        monsterId: currentMonster.monsterId,
        monsterName: currentMonster.name,
        expGained: expReward,
        goldGained: goldReward,
      });
      currentMonster = null;
    }
  }

  events.push({ t, type: "fight_time_limit_reached" });
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
