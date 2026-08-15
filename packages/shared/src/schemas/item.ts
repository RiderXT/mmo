import { z } from "zod";
import { ItemTypeSchema, StatKeySchema, PotionTriggerSchema, PotionEffectSchema } from "./enums.js";

export const StatRangeSchema = z.object({
  stat: StatKeySchema,
  min: z.number(),
  max: z.number(),
  weight: z.number().min(0).max(1000).default(1),
});
export type StatRange = z.infer<typeof StatRangeSchema>;

export const UpgradeRequirementInputSchema = z.object({
  targetLevel: z.number().int().min(1).max(50),
  requiredItemId: z.string(),
  requiredQty: z.number().int().min(1).max(999),
});
export type UpgradeRequirementInput = z.infer<typeof UpgradeRequirementInputSchema>;

// Only meaningful when type === "chest" — what can come out when the chest is opened.
export const ChestLootInputSchema = z.object({
  rewardItemId: z.string(),
  dropChance: z.number().min(0).max(1),
  minQty: z.number().int().min(1).max(999),
  maxQty: z.number().int().min(1).max(999),
});
export type ChestLootInput = z.infer<typeof ChestLootInputSchema>;

// Only meaningful when type === "consumable" and the item sits in an active-item slot.
export const PotionConfigSchema = z.object({
  trigger: PotionTriggerSchema,
  thresholdPct: z.number().min(0).max(1).optional(), // for hp_below / mana_below
  intervalSeconds: z.number().int().min(1).max(3600).optional(), // for interval
  effect: PotionEffectSchema,
  magnitudePct: z.number().min(0).max(5).default(0.3),
  durationSeconds: z.number().int().min(0).max(3600).optional(), // for buff_* effects
});
export type PotionConfig = z.infer<typeof PotionConfigSchema>;

export const CreateItemSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    type: ItemTypeSchema,
    minLevel: z.number().int().min(1).max(999),
    stackable: z.boolean().default(false),
    maxStack: z.number().int().min(1).max(9999).default(1),
    description: z.string().trim().max(2000).optional().default(""),
    baseStats: z.record(StatKeySchema, z.number()).default({}),
    // Stats at +9 — interpolated with baseStats (+0) by InventoryItem.upgradeLevel. A key
    // present in baseStats but absent here means that stat doesn't grow with upgrades.
    maxUpgradeStats: z.record(StatKeySchema, z.number()).default({}),
    possibleStatRanges: z.array(StatRangeSchema).default([]),
    // null/omitted = usable by any class. Only meaningful for weapon/armor/helmet.
    classId: z.string().nullable().optional(),
    upgradeRequirements: z.array(UpgradeRequirementInputSchema).default([]),
    // Only meaningful when type === "chest".
    chestLoot: z.array(ChestLootInputSchema).default([]),
    potion: PotionConfigSchema.optional(),
    // Gold for selling one unit via the inventory context menu. 0 = not sellable.
    sellPrice: z.number().int().min(0).max(999999).default(0),
  })
  .refine((val) => val.stackable || val.maxStack === 1, {
    message: "Przedmiot niestakujący się musi mieć maxStack = 1",
    path: ["maxStack"],
  })
  .refine((val) => val.type !== "consumable" || !!val.potion, {
    message: "Przedmiot typu consumable musi mieć skonfigurowane działanie potionu",
    path: ["potion"],
  });
export type CreateItemInput = z.infer<typeof CreateItemSchema>;

export const UpdateItemSchema = CreateItemSchema;
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
