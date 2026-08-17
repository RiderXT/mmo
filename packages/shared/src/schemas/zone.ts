import { z } from "zod";

export const ZoneMonsterInputSchema = z.object({
  monsterId: z.string(),
  spawnWeight: z.number().int().min(1).max(1000),
  maxCount: z.number().int().min(1).max(50),
});
export type ZoneMonsterInput = z.infer<typeof ZoneMonsterInputSchema>;

export const ZoneDropInputSchema = z.object({
  itemId: z.string(),
  dropChance: z.number().min(0).max(1),
});
export type ZoneDropInput = z.infer<typeof ZoneDropInputSchema>;

export const CreateZoneSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(2000).optional().default(""),
  minLevel: z.number().int().min(1).max(999),
  maxLevel: z.number().int().min(1).max(999),
  // Base one-way travel time from the village, in seconds, before movementSpeed reduction.
  travelTimeSeconds: z.number().int().min(0).max(3600).default(30),
  // Town zones have no monsters/combat — the "walcz" flow is replaced by an NPC list.
  isTown: z.boolean().default(false),
  // Lets a character enter/use this zone even after leveling above maxLevel (e.g. to keep
  // fishing/mining after outgrowing the zone's exp content). Does not bypass minLevel.
  allowRevisitAboveLevel: z.boolean().default(false),
  monsters: z.array(ZoneMonsterInputSchema).default([]),
  drops: z.array(ZoneDropInputSchema).default([]),
}).refine((z) => z.maxLevel >= z.minLevel, {
  message: "maxLevel musi być >= minLevel",
  path: ["maxLevel"],
});
export type CreateZoneInput = z.infer<typeof CreateZoneSchema>;

export const UpdateZoneSchema = CreateZoneSchema;
export type UpdateZoneInput = z.infer<typeof UpdateZoneSchema>;
