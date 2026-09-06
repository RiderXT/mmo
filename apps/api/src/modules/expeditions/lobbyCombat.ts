import type { ExpeditionResult, CombatRole, RegenSettings } from "@mmo/shared";
import type { LobbyCombatEvent } from "@mmo/shared";
import {
  randomInt,
  pickWeighted,
  type DerivedStats,
  type ActiveSkillDef,
  type PotionSlot,
  type SimZone,
  type SimMonster,
  type EventBonusDrop,
} from "./combat.js";

export interface LobbyMemberBuild {
  characterId: string;
  combatRole: CombatRole;
  stats: DerivedStats;
  activeSkills: ActiveSkillDef[];
  potions: PotionSlot[];
  // Per-character — event multiplier × THIS character's own personal item buffs (see
  // lib/personalBuffs.ts). Unlike classCompositionBonusPct (shared across the whole lobby), these
  // stay per-member since a personal buff belongs to one character, not the group.
  expMultiplier: number;
  goldMultiplier: number;
  dropChanceMultiplier: number;
}

export interface LobbySimulationOutcome {
  eventLog: LobbyCombatEvent[];
  results: Map<string, ExpeditionResult>;
  /** characterId -> (inventoryItemId -> quantity consumed), same shape as solo's potionsConsumed
   * but keyed per member since each has their own active-slot potions. */
  potionsConsumedByMember: Map<string, Map<string, number>>;
}

const DEFAULT_BUFF_DURATION_SECONDS = 60;
const THRESHOLD_POTION_COOLDOWN_SECONDS = 5;
const ROUND_SECONDS = 3;
const MAX_ROUNDS = 3000;
const SKILL_BUFF_DURATION_SECONDS = DEFAULT_BUFF_DURATION_SECONDS;
const POISON_DURATION_ROUNDS = 3;
const POISON_DAMAGE_PCT_OF_MAX_HP = 0.05;

interface MemberState {
  build: LobbyMemberBuild;
  hp: number;
  mana: number;
  alive: boolean;
  result: ExpeditionResult;
  lootMap: Map<string, number>;
  potionsConsumed: Map<string, number>;
  potionRemaining: Map<string, number>;
  potionNextInterval: Map<string, number>;
  potionNextThresholdCheck: Map<string, number>;
  skillNextAvailable: Map<string, number>;
  attackSpeedBuffUntil: number;
  attackSpeedBuffPct: number;
  attackBuffUntil: number;
  attackBuffPct: number;
  defenseBuffUntil: number;
  defenseBuffPct: number;
  critBuffUntil: number;
  critBuffPct: number;
  blockChanceUntil: number;
  blockChancePct: number;
  reflectChanceUntil: number;
  reflectChancePct: number;
  hpHotUntil: number;
  hpHotPerSecond: number;
  manaHotUntil: number;
  manaHotPerSecond: number;
  // Discrete regen ticks, same model as solo combat.ts (see its simulateExpedition comment) —
  // precomputed once per member since they depend on that member's own stats.
  hpRegenIntervalSeconds: number;
  manaRegenIntervalSeconds: number;
  hpRegenTickPct: number;
  manaRegenTickPct: number;
  nextHpRegenTick: number;
  nextManaRegenTick: number;
}

interface SlotState {
  monster: SimMonster | null;
  hp: number;
  poisonRoundsLeft: number;
  poisonDamagePerRound: number;
}

function newMemberState(build: LobbyMemberBuild, regenSettings: RegenSettings): MemberState {
  const hpRegenIntervalSeconds = regenSettings.baseHpRegenIntervalSeconds / (1 + build.stats.hpRegenSpeedPct);
  const manaRegenIntervalSeconds = regenSettings.baseManaRegenIntervalSeconds / (1 + build.stats.manaRegenSpeedPct);
  return {
    build,
    hp: build.stats.maxHp,
    mana: build.stats.maxMana,
    hpRegenIntervalSeconds,
    manaRegenIntervalSeconds,
    hpRegenTickPct: regenSettings.baseHpRegenPct * (1 + build.stats.hpRegenPct),
    manaRegenTickPct: regenSettings.baseManaRegenPct * (1 + build.stats.manaRegenPct),
    nextHpRegenTick: hpRegenIntervalSeconds,
    nextManaRegenTick: manaRegenIntervalSeconds,
    alive: true,
    result: { expGained: 0, goldGained: 0, monstersDefeated: 0, loot: [] },
    lootMap: new Map(),
    potionsConsumed: new Map(),
    potionRemaining: new Map(build.potions.map((p) => [p.inventoryItemId, p.quantity])),
    potionNextInterval: new Map(
      build.potions.filter((p) => p.trigger === "interval").map((p) => [p.inventoryItemId, p.intervalSeconds ?? 600]),
    ),
    potionNextThresholdCheck: new Map(),
    skillNextAvailable: new Map(build.activeSkills.map((s) => [s.id, 0])),
    attackSpeedBuffUntil: 0,
    attackSpeedBuffPct: 0,
    attackBuffUntil: 0,
    attackBuffPct: 0,
    defenseBuffUntil: 0,
    defenseBuffPct: 0,
    critBuffUntil: 0,
    critBuffPct: 0,
    blockChanceUntil: 0,
    blockChancePct: 0,
    reflectChanceUntil: 0,
    reflectChancePct: 0,
    hpHotUntil: 0,
    hpHotPerSecond: 0,
    manaHotUntil: 0,
    manaHotPerSecond: 0,
  };
}

function addLoot(map: Map<string, number>, itemId: string, qty: number) {
  map.set(itemId, (map.get(itemId) ?? 0) + qty);
}

function tryConsumePotion(member: MemberState, p: PotionSlot, t: number, events: LobbyCombatEvent[]) {
  const remaining = member.potionRemaining.get(p.inventoryItemId) ?? 0;
  if (remaining <= 0) return false;
  member.potionRemaining.set(p.inventoryItemId, remaining - 1);
  member.potionsConsumed.set(p.inventoryItemId, (member.potionsConsumed.get(p.inventoryItemId) ?? 0) + 1);

  const buffUntil = t + (p.durationSeconds ?? DEFAULT_BUFF_DURATION_SECONDS);
  let amount = 0;
  switch (p.effect) {
    case "restore_hp": {
      const totalAmount = member.build.stats.maxHp * p.magnitudePct;
      if (p.durationSeconds) {
        member.hpHotUntil = t + p.durationSeconds;
        member.hpHotPerSecond = totalAmount / p.durationSeconds;
        amount = Math.round(totalAmount);
      } else {
        const before = member.hp;
        member.hp = Math.min(member.build.stats.maxHp, member.hp + totalAmount);
        amount = Math.round(member.hp - before);
      }
      break;
    }
    case "restore_mana": {
      const totalAmount = member.build.stats.maxMana * p.magnitudePct;
      if (p.durationSeconds) {
        member.manaHotUntil = t + p.durationSeconds;
        member.manaHotPerSecond = totalAmount / p.durationSeconds;
        amount = Math.round(totalAmount);
      } else {
        const before = member.mana;
        member.mana = Math.min(member.build.stats.maxMana, member.mana + totalAmount);
        amount = Math.round(member.mana - before);
      }
      break;
    }
    case "buff_attack_speed":
      member.attackSpeedBuffUntil = buffUntil;
      member.attackSpeedBuffPct = p.magnitudePct;
      amount = Math.round(p.magnitudePct * 100);
      break;
    case "buff_attack":
      member.attackBuffUntil = buffUntil;
      member.attackBuffPct = p.magnitudePct;
      amount = Math.round(p.magnitudePct * 100);
      break;
    case "buff_defense":
      member.defenseBuffUntil = buffUntil;
      member.defenseBuffPct = p.magnitudePct;
      amount = Math.round(p.magnitudePct * 100);
      break;
  }
  events.push({
    t,
    type: "potion_used",
    actorCharacterId: member.build.characterId,
    itemName: p.itemName,
    effect: p.effect,
    amount,
    playerHpAfter: Math.max(0, Math.round(member.hp)),
    playerManaAfter: Math.max(0, Math.round(member.mana)),
  });
  return true;
}

/**
 * Instant-simulated group fight for a Lobby (see modules/lobbies) — same "computed in full up
 * front, replayed client-side" model as simulateExpedition, but for N members against
 * `monsterConcurrency` (+ lure-added) simultaneously-live monster slots instead of one monster at
 * a time. Deliberately a separate function rather than a generalization of simulateExpedition:
 * solo combat's single hp/mana/buff-timer state becomes N independent copies here, and the
 * single "currentMonster" becomes M independent slots — threading that through the existing
 * function would have made ITS single-character case harder to read for no shared benefit, since
 * nothing else calls solo combat with N=1 through this path.
 *
 * Aggro model: each round, EACH live monster slot independently picks a random currently-alive
 * fighting member ("dps" or "support" — see CombatRoleSchema, both fight identically) to fight
 * this round (a member can be picked by more than one slot the same round — that's intentional,
 * it's what "more monsters attacking the group" means). "lure"-role members are never picked, deal
 * no damage, and take none. If no fighting member is alive, the whole lobby is considered wiped
 * (lure alone can't fight) even if a lure member is still "up".
 */
export function simulateLobbyExpedition(
  zone: SimZone,
  memberBuilds: LobbyMemberBuild[],
  durationMinutes: number,
  monsterConcurrency: number,
  lureExtraMonsterSlotsPerLureMember: number,
  classCompositionBonusPct: number,
  eventBonusDrop: EventBonusDrop | null,
  regenSettings: RegenSettings,
): LobbySimulationOutcome {
  const members = memberBuilds.map((build) => newMemberState(build, regenSettings));
  const lureCount = members.filter((m) => m.build.combatRole === "lure").length;
  const slotCount = Math.max(1, monsterConcurrency + lureExtraMonsterSlotsPerLureMember * lureCount);
  const slots: SlotState[] = Array.from({ length: slotCount }, () => ({ monster: null, hp: 0, poisonRoundsLeft: 0, poisonDamagePerRound: 0 }));

  const events: LobbyCombatEvent[] = [];
  const maxSeconds = Math.max(60, durationMinutes * 60);
  let t = 0;
  let roundsEmitted = 0;

  // "support" fights exactly like "dps" (see CombatRoleSchema comment) — only "lure" is excluded
  // from being targeted/targeting.
  function aliveFightingMembers(): MemberState[] {
    return members.filter((m) => m.alive && m.build.combatRole !== "lure");
  }

  function grantKillRewards(monster: SimMonster, monsterSlotIndex: number) {
    const alive = members.filter((m) => m.alive);
    const rewards: { characterId: string; expGained: number; goldGained: number }[] = [];
    for (const member of alive) {
      const expGained = Math.round(monster.expReward * member.build.expMultiplier * (1 + classCompositionBonusPct));
      const goldGained = Math.round(monster.goldReward * member.build.goldMultiplier * (1 + classCompositionBonusPct));
      member.result.expGained += expGained;
      member.result.goldGained += goldGained;
      rewards.push({ characterId: member.build.characterId, expGained, goldGained });

      for (const drop of monster.drops) {
        if (Math.random() < Math.min(1, drop.dropChance * member.build.dropChanceMultiplier)) {
          const qty = randomInt(drop.minQty, drop.maxQty);
          addLoot(member.lootMap, drop.itemId, qty);
          events.push({ t, type: "loot", actorCharacterId: member.build.characterId, itemId: drop.itemId, quantity: qty });
        }
      }
      for (const zoneDrop of zone.drops) {
        if (Math.random() < Math.min(1, zoneDrop.dropChance * member.build.dropChanceMultiplier)) {
          addLoot(member.lootMap, zoneDrop.itemId, 1);
          events.push({ t, type: "loot", actorCharacterId: member.build.characterId, itemId: zoneDrop.itemId, quantity: 1 });
        }
      }
      if (eventBonusDrop && Math.random() < Math.min(1, eventBonusDrop.dropChance * member.build.dropChanceMultiplier)) {
        addLoot(member.lootMap, eventBonusDrop.itemId, 1);
        events.push({ t, type: "loot", actorCharacterId: member.build.characterId, itemId: eventBonusDrop.itemId, quantity: 1 });
      }
      member.result.monstersDefeated += 1;
    }
    events.push({ t, type: "encounter_result", monsterSlotIndex, monsterId: monster.monsterId, monsterName: monster.name, rewards });
  }

  outer: while (t + ROUND_SECONDS <= maxSeconds && roundsEmitted < MAX_ROUNDS) {
    t += ROUND_SECONDS;

    // Per-member upkeep: potion triggers, mana/HP-over-time regen — same as solo, once per member
    // per round regardless of how many slots end up targeting them.
    for (const member of members) {
      if (!member.alive) continue;
      for (const p of member.build.potions) {
        if ((member.potionRemaining.get(p.inventoryItemId) ?? 0) <= 0) continue;
        const thresholdReady = t >= (member.potionNextThresholdCheck.get(p.inventoryItemId) ?? 0);
        if (thresholdReady && p.trigger === "hp_below" && p.thresholdPct != null && member.hp / member.build.stats.maxHp < p.thresholdPct) {
          if (tryConsumePotion(member, p, t, events)) {
            member.potionNextThresholdCheck.set(p.inventoryItemId, t + THRESHOLD_POTION_COOLDOWN_SECONDS);
          }
        } else if (
          thresholdReady &&
          p.trigger === "mana_below" &&
          p.thresholdPct != null &&
          member.build.stats.maxMana > 0 &&
          member.mana / member.build.stats.maxMana < p.thresholdPct
        ) {
          if (tryConsumePotion(member, p, t, events)) {
            member.potionNextThresholdCheck.set(p.inventoryItemId, t + THRESHOLD_POTION_COOLDOWN_SECONDS);
          }
        } else if (p.trigger === "interval") {
          const next = member.potionNextInterval.get(p.inventoryItemId) ?? Infinity;
          if (t >= next && tryConsumePotion(member, p, t, events)) {
            member.potionNextInterval.set(p.inventoryItemId, t + (p.intervalSeconds ?? 600));
          }
        }
      }

      if (t >= member.nextHpRegenTick) {
        member.hp = Math.min(member.build.stats.maxHp, member.hp + member.build.stats.maxHp * member.hpRegenTickPct);
        member.nextHpRegenTick += member.hpRegenIntervalSeconds;
      }
      if (t >= member.nextManaRegenTick) {
        member.mana = Math.min(member.build.stats.maxMana, member.mana + member.build.stats.maxMana * member.manaRegenTickPct);
        member.nextManaRegenTick += member.manaRegenIntervalSeconds;
      }
      if (t <= member.hpHotUntil) member.hp = Math.min(member.build.stats.maxHp, member.hp + member.hpHotPerSecond * ROUND_SECONDS);
      if (t <= member.manaHotUntil) member.mana = Math.min(member.build.stats.maxMana, member.mana + member.manaHotPerSecond * ROUND_SECONDS);
    }

    if (aliveFightingMembers().length === 0) {
      events.push({ t, type: "lobby_wiped" });
      break outer;
    }

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex];

      if (!slot.monster) {
        slot.monster = pickWeighted(zone.monsters, (m) => m.spawnWeight);
        if (!slot.monster) continue; // defensive — caller guarantees a non-empty pool
        slot.hp = slot.monster.hp;
        slot.poisonRoundsLeft = 0;
        slot.poisonDamagePerRound = 0;
        events.push({
          t,
          type: "encounter_start",
          monsterSlotIndex: slotIndex,
          monsterId: slot.monster.monsterId,
          monsterName: slot.monster.name,
          monsterLevel: slot.monster.level,
          monsterMaxHp: slot.monster.hp,
        });
      }

      const candidates = aliveFightingMembers();
      if (candidates.length === 0) {
        events.push({ t, type: "lobby_wiped" });
        break outer;
      }
      const member = candidates[Math.floor(Math.random() * candidates.length)];
      const monster = slot.monster;

      let burstDamage = 0;
      let monsterStunnedThisRound = false;
      for (const skill of member.build.activeSkills) {
        const nextAt = member.skillNextAvailable.get(skill.id) ?? 0;
        if (t < nextAt || member.mana < skill.manaCost) continue;
        member.mana -= skill.manaCost;
        member.skillNextAvailable.set(skill.id, t + skill.cooldownSeconds);

        let success: boolean | undefined;
        const buffDuration = skill.durationSeconds ?? SKILL_BUFF_DURATION_SECONDS;
        switch (skill.effectType) {
          case "damage":
            burstDamage += skill.power;
            break;
          case "heal":
            member.hp = Math.min(member.build.stats.maxHp, member.hp + skill.power);
            break;
          case "attack_speed":
            member.attackSpeedBuffUntil = t + buffDuration;
            member.attackSpeedBuffPct = skill.power / 100;
            break;
          case "defense":
            member.defenseBuffUntil = t + buffDuration;
            member.defenseBuffPct = skill.power / 100;
            break;
          case "crit":
            member.critBuffUntil = t + buffDuration;
            member.critBuffPct = Math.min(1, Math.max(0, skill.power / 100));
            break;
          case "block_chance":
            member.blockChanceUntil = t + buffDuration;
            member.blockChancePct = Math.min(1, Math.max(0, skill.power / 100));
            break;
          case "reflect":
            member.reflectChanceUntil = t + buffDuration;
            member.reflectChancePct = Math.min(1, Math.max(0, skill.power / 100));
            break;
          case "stun":
            success = Math.random() < Math.min(1, Math.max(0, skill.power / 100));
            if (success) monsterStunnedThisRound = true;
            break;
          case "poison":
            success = Math.random() < Math.min(1, Math.max(0, skill.power / 100));
            if (success) {
              slot.poisonRoundsLeft = POISON_DURATION_ROUNDS;
              slot.poisonDamagePerRound = monster.hp * POISON_DAMAGE_PCT_OF_MAX_HP;
            }
            break;
        }

        events.push({
          t,
          type: "skill_activated",
          actorCharacterId: member.build.characterId,
          skillName: skill.name,
          effectType: skill.effectType,
          power: Math.round(skill.power),
          success,
          playerHpAfter: Math.max(0, Math.round(member.hp)),
          playerManaAfter: Math.max(0, Math.round(member.mana)),
        });
      }

      if (slot.poisonRoundsLeft > 0) {
        slot.hp -= slot.poisonDamagePerRound;
        slot.poisonRoundsLeft -= 1;
      }

      const stats = member.build.stats;
      const effectiveAttack = stats.attack * (1 + (t <= member.attackBuffUntil ? member.attackBuffPct : 0));
      const speedMultiplier = (stats.attackSpeed * (1 + (t <= member.attackSpeedBuffUntil ? member.attackSpeedBuffPct : 0))) / 10;
      const effectiveDefense = stats.defense * (1 + (t <= member.defenseBuffUntil ? member.defenseBuffPct : 0));
      const effectiveCritChance = Math.min(0.95, stats.critChance + (t <= member.critBuffUntil ? member.critBuffPct : 0));

      const crit = Math.random() < effectiveCritChance;
      const playerDamage = Math.max(1, effectiveAttack - monster.defense) * (crit ? stats.critDamage : 1) * speedMultiplier + burstDamage;
      slot.hp -= playerDamage;

      let monsterDamage = 0;
      let monsterEvaded = false;
      let monsterBlocked = false;
      let reflectedDamage = 0;
      // The killing blow doesn't get countered — the monster only hits back if it survived and
      // isn't stunned, mirroring solo combat.ts.
      if (slot.hp > 0 && !monsterStunnedThisRound) {
        monsterEvaded = Math.random() < stats.evasion;
        if (!monsterEvaded) {
          const blockChance = t <= member.blockChanceUntil ? member.blockChancePct : 0;
          monsterBlocked = blockChance > 0 && Math.random() < blockChance;
        }
        if (!monsterEvaded && !monsterBlocked) {
          monsterDamage = Math.max(0, monster.attack - effectiveDefense) * (1 - stats.damageReduction);
          member.hp -= monsterDamage;
          const reflectChance = t <= member.reflectChanceUntil ? member.reflectChancePct : 0;
          if (reflectChance > 0 && Math.random() < reflectChance) {
            reflectedDamage = monsterDamage;
            slot.hp -= reflectedDamage;
          }
        }
      }

      events.push({
        t,
        type: "round",
        monsterSlotIndex: slotIndex,
        actorCharacterId: member.build.characterId,
        playerDamage: Math.round(playerDamage),
        playerCrit: crit,
        monsterHpAfter: Math.max(0, Math.round(slot.hp)),
        monsterDamage: Math.round(monsterDamage),
        monsterEvaded,
        monsterStunned: monsterStunnedThisRound,
        monsterBlocked,
        reflectedDamage: Math.round(reflectedDamage),
        playerHpAfter: Math.max(0, Math.round(member.hp)),
      });
      roundsEmitted += 1;

      if (member.hp <= 0 && member.alive) {
        member.alive = false;
        events.push({ t, type: "character_died", actorCharacterId: member.build.characterId });
      }

      if (slot.hp <= 0) {
        grantKillRewards(monster, slotIndex);
        slot.monster = null;
      }

      if (roundsEmitted >= MAX_ROUNDS) break outer;
    }
  }

  if (t + ROUND_SECONDS > maxSeconds || roundsEmitted >= MAX_ROUNDS) {
    events.push({ t, type: "fight_time_limit_reached" });
  }

  const results = new Map<string, ExpeditionResult>();
  const potionsConsumedByMember = new Map<string, Map<string, number>>();
  for (const member of members) {
    results.set(member.build.characterId, {
      ...member.result,
      loot: Array.from(member.lootMap.entries()).map(([itemId, quantity]) => ({ itemId, quantity })),
    });
    potionsConsumedByMember.set(member.build.characterId, member.potionsConsumed);
  }

  return { eventLog: events, results, potionsConsumedByMember };
}
