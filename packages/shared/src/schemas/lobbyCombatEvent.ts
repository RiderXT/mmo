import { z } from "zod";
import { SkillEffectTypeSchema } from "./enums.js";

/**
 * Same "pre-computed once at start, replayed client-side" model as CombatEventSchema, for a
 * Lobby's group fight (see modules/lobbies, lobbyCombat.ts). Kept as a SEPARATE schema rather than
 * extending CombatEventSchema so no existing single-actor consumer (CombatLog.tsx, admin
 * expedition review) needs to change: every variant here carries `actorCharacterId` (whose
 * damage/hp/mana this event is about — a "lure" member never appears as the actor of a `round`),
 * and the monster-facing variants carry `monsterSlotIndex` (which of the `monsterConcurrency` +
 * lure-added concurrent monster slots this event belongs to), since several monsters fight
 * simultaneously instead of the solo one-at-a-time loop.
 */
export const LobbyCombatEventSchema = z.discriminatedUnion("type", [
  z.object({
    t: z.number(),
    type: z.literal("encounter_start"),
    monsterSlotIndex: z.number().int(),
    monsterId: z.string(),
    monsterName: z.string(),
    monsterLevel: z.number(),
    monsterMaxHp: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("round"),
    monsterSlotIndex: z.number().int(),
    actorCharacterId: z.string(),
    playerDamage: z.number(),
    playerCrit: z.boolean(),
    monsterHpAfter: z.number(),
    monsterDamage: z.number(),
    monsterEvaded: z.boolean(),
    monsterStunned: z.boolean().optional(),
    monsterBlocked: z.boolean().optional(),
    reflectedDamage: z.number().optional(),
    playerHpAfter: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("skill_activated"),
    actorCharacterId: z.string(),
    skillName: z.string(),
    effectType: SkillEffectTypeSchema,
    power: z.number(),
    success: z.boolean().optional(),
    playerHpAfter: z.number(),
    playerManaAfter: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("encounter_result"),
    monsterSlotIndex: z.number().int(),
    monsterId: z.string(),
    monsterName: z.string(),
    // One entry per surviving member — see lobbyCombat.ts's "full reward to every survivor,
    // no division" rule. Already includes the class-composition + group-combat-skill bonuses.
    rewards: z.array(z.object({ characterId: z.string(), expGained: z.number(), goldGained: z.number() })),
  }),
  z.object({
    t: z.number(),
    type: z.literal("loot"),
    actorCharacterId: z.string(),
    itemId: z.string(),
    quantity: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("potion_used"),
    actorCharacterId: z.string(),
    itemName: z.string(),
    effect: z.string(),
    amount: z.number(),
    playerHpAfter: z.number(),
    playerManaAfter: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("character_died"),
    actorCharacterId: z.string(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("lobby_wiped"),
  }),
  z.object({
    t: z.number(),
    type: z.literal("fight_time_limit_reached"),
  }),
]);
export type LobbyCombatEvent = z.infer<typeof LobbyCombatEventSchema>;
