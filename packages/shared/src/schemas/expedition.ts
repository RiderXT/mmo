import { z } from "zod";
import { ExpeditionStatusSchema } from "./enums.js";

// Player-chosen overrides for THIS fight only, layered on top of the admin's base per-item
// potion config — the admin still controls the potion's own trigger/threshold/effect, this
// only lets the player raise the hp_below/mana_below thresholds and/or sit out specific active
// skills.
export const BattleTacticsSchema = z.object({
  hpThresholdOverridePct: z.number().min(0).max(1).optional(),
  manaThresholdOverridePct: z.number().min(0).max(1).optional(),
  disabledSkillIds: z.array(z.string()).default([]),
});
export type BattleTacticsInput = z.infer<typeof BattleTacticsSchema>;

export const StartExpeditionSchema = z.object({
  characterId: z.string(),
  zoneId: z.string(),
  durationMinutes: z.number().int().min(1).max(720).optional(),
  selectedMonsterIds: z.array(z.string()).default([]), // empty = whole zone pool
  tactics: BattleTacticsSchema.optional(),
});
export type StartExpeditionInput = z.infer<typeof StartExpeditionSchema>;

export const ClaimExpeditionSchema = z.object({
  expeditionId: z.string(),
});
export type ClaimExpeditionInput = z.infer<typeof ClaimExpeditionSchema>;

export const ExpeditionLootSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int(),
  rolledStats: z.record(z.string(), z.number()).optional(),
});
export type ExpeditionLoot = z.infer<typeof ExpeditionLootSchema>;

export const ExpeditionResultSchema = z.object({
  expGained: z.number().int(),
  goldGained: z.number().int(),
  loot: z.array(ExpeditionLootSchema),
  monstersDefeated: z.number().int(),
});
export type ExpeditionResult = z.infer<typeof ExpeditionResultSchema>;

export const ExpeditionSchema = z.object({
  id: z.string(),
  characterId: z.string(),
  zoneId: z.string(),
  status: ExpeditionStatusSchema,
  startedAt: z.string(),
  endsAt: z.string(),
  result: ExpeditionResultSchema.nullable(),
});
export type Expedition = z.infer<typeof ExpeditionSchema>;
