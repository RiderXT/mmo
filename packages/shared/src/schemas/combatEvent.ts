import { z } from "zod";

/**
 * One entry in an expedition's pre-computed combat log. `t` is elapsed seconds
 * since the expedition started — the whole array is computed once at expedition
 * start (same "decided up front" model as ExpeditionResult) and revealed
 * progressively client-side in sync with the countdown, so it *feels* live
 * without any server-side polling or background worker.
 */
export const CombatEventSchema = z.discriminatedUnion("type", [
  z.object({
    t: z.number(),
    type: z.literal("encounter_start"),
    monsterName: z.string(),
    monsterHp: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("skill_activated"),
    skillName: z.string(),
    effectType: z.enum(["damage", "heal"]),
    power: z.number(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("player_attack"),
    baseAttack: z.number(),
    monsterDefense: z.number(),
    skillBonus: z.number(),
    damagePerRound: z.number(),
    rounds: z.number(),
    crit: z.boolean(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("monster_attack"),
    monsterAttack: z.number(),
    characterDefense: z.number(),
    damagePerRound: z.number(),
    rounds: z.number(),
    evaded: z.boolean(),
  }),
  z.object({
    t: z.number(),
    type: z.literal("encounter_result"),
    won: z.boolean(),
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
  }),
]);
export type CombatEvent = z.infer<typeof CombatEventSchema>;
