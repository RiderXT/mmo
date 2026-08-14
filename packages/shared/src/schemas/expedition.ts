import { z } from "zod";
import { ExpeditionStatusSchema } from "./enums.js";

export const StartExpeditionSchema = z.object({
  characterId: z.string(),
  zoneId: z.string(),
  durationMinutes: z.number().int().min(1).max(720).optional(),
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
