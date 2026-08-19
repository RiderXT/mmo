import { z } from "zod";
import { GatherKindSchema, GatherPhaseSchema } from "./enums.js";

// Same shape as ZoneDropInput/ChestLootInput — a %chance table row.
export const FishingDropInputSchema = z.object({
  itemId: z.string(),
  dropChance: z.number().min(0).max(1),
  minQty: z.number().int().min(1).max(999),
  maxQty: z.number().int().min(1).max(999),
});
export type FishingDropInput = z.infer<typeof FishingDropInputSchema>;

export const MiningDropInputSchema = FishingDropInputSchema;
export type MiningDropInput = z.infer<typeof MiningDropInputSchema>;

export const CreateFishingSpotSchema = z.object({
  zoneId: z.string(),
  name: z.string().trim().min(2).max(60).default("Łowisko"),
  // null = fallback to the Settings-configured default range.
  minCatchSeconds: z.number().int().min(1).max(3600).nullable().optional(),
  maxCatchSeconds: z.number().int().min(1).max(3600).nullable().optional(),
  drops: z.array(FishingDropInputSchema).default([]),
});
export type CreateFishingSpotInput = z.infer<typeof CreateFishingSpotSchema>;
export const UpdateFishingSpotSchema = CreateFishingSpotSchema;
export type UpdateFishingSpotInput = z.infer<typeof UpdateFishingSpotSchema>;

export const CreateMineSchema = z.object({
  zoneId: z.string(),
  name: z.string().trim().min(2).max(60).default("Kopalnia"),
  minExtractSeconds: z.number().int().min(1).max(3600).nullable().optional(),
  maxExtractSeconds: z.number().int().min(1).max(3600).nullable().optional(),
  minSearchSeconds: z.number().int().min(1).max(3600).nullable().optional(),
  maxSearchSeconds: z.number().int().min(1).max(3600).nullable().optional(),
  drops: z.array(MiningDropInputSchema).default([]),
});
export type CreateMineInput = z.infer<typeof CreateMineSchema>;
export const UpdateMineSchema = CreateMineSchema;
export type UpdateMineInput = z.infer<typeof UpdateMineSchema>;

export const StartGatheringSchema = z.object({
  characterId: z.string(),
  kind: GatherKindSchema,
  targetId: z.string(), // fishingSpotId or mineId, matching `kind`
});
export type StartGatheringInput = z.infer<typeof StartGatheringSchema>;

export const GatherSessionSchema = z.object({
  id: z.string(),
  characterId: z.string(),
  kind: GatherKindSchema,
  fishingSpotId: z.string().nullable(),
  mineId: z.string().nullable(),
  phase: GatherPhaseSchema,
  phaseEndsAt: z.string(),
  totalGathered: z.number().int(),
});
export type GatherSessionDto = z.infer<typeof GatherSessionSchema>;

// Object-shaped Settings value, same override convention as ItemUpgradeLevelConfig.goldCost
// falling back to defaultUpgradeGoldCost.
export const DurationRangeSchema = z
  .object({
    minSeconds: z.number().int().min(1).max(3600),
    maxSeconds: z.number().int().min(1).max(3600),
  })
  .refine((v) => v.maxSeconds >= v.minSeconds, {
    message: "maxSeconds musi być >= minSeconds",
    path: ["maxSeconds"],
  });
export type DurationRange = z.infer<typeof DurationRangeSchema>;

export const GatheringSettingsSchema = z.object({
  fishing: DurationRangeSchema,
  miningExtract: DurationRangeSchema,
  miningSearch: DurationRangeSchema,
  // Hard cap on how many phase-cycles a single lazy-resolve call will retroactively credit for
  // an unattended session — protects against unbounded AFK catch-up. See modules/gathering.
  maxCyclesPerResolve: z.number().int().min(1).max(10000),
  // Successful gathers required (per rod/pickaxe instance, via InventoryItem.gatherSuccessCount)
  // before the anvil will allow upgrading that tool to its next level. See upgradeItem in
  // modules/inventory/service.ts.
  successesPerToolUpgrade: z.number().int().min(1).max(100000).default(100),
});
export type GatheringSettings = z.infer<typeof GatheringSettingsSchema>;
