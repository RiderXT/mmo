import { z } from "zod";

/**
 * One entry in an expedition's pre-computed combat log. `t` is elapsed seconds
 * since the expedition started — the whole array is computed once at expedition
 * start (same "decided up front" model as ExpeditionResult) and revealed
 * progressively client-side in sync with the countdown, so it *feels* live
 * without any server-side polling or background worker.
 *
 * Etap 10: combat runs round-by-round (one exchange of blows per "round", not one
 * event per whole encounter) until the character dies or a safety time limit is
 * hit — see combat.ts. `*HpAfter`/`*ManaAfter` fields carry the running value
 * directly so the client never has to recompute deltas from prior events.
 */
export const CombatEventSchema = z.discriminatedUnion("type", [
  z.object({
    t: z.number(),
    type: z.literal("encounter_start"),
    monsterId: z.string(),
    monsterName: z.string(),
    monsterLevel: z.number(),
    monsterMaxHp: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("round"),
    playerDamage: z.number(),
    playerCrit: z.boolean(),
    monsterHpAfter: z.number(),
    monsterDamage: z.number(),
    monsterEvaded: z.boolean(),
    playerHpAfter: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("skill_activated"),
    skillName: z.string(),
    effectType: z.enum(["damage", "heal"]),
    power: z.number(),
    playerHpAfter: z.number(),
    playerManaAfter: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("encounter_result"),
    monsterId: z.string(),
    monsterName: z.string(),
    expGained: z.number(),
    goldGained: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("loot"),
    itemId: z.string(),
    quantity: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("potion_used"),
    itemName: z.string(),
    effect: z.string(),
    amount: z.number(),
    playerHpAfter: z.number(),
    playerManaAfter: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("character_died"),
  }),
  z.object({
    t: z.number(),
    type: z.literal("fight_time_limit_reached"),
  }),
]);
export type CombatEvent = z.infer<typeof CombatEventSchema>;
