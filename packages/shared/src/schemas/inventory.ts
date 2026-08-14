import { z } from "zod";
import { EquipSlotSchema, StatBlockSchema } from "./enums.js";

const ACTIVE_SLOT_COUNT = 6;

export const MoveItemSchema = z.object({
  inventoryItemId: z.string(),
  toSlotIndex: z.number().int().min(0).max(9999),
});
export type MoveItemInput = z.infer<typeof MoveItemSchema>;

export const EquipItemSchema = z.object({
  inventoryItemId: z.string(),
  equipSlot: EquipSlotSchema,
});
export type EquipItemInput = z.infer<typeof EquipItemSchema>;

export const UnequipItemSchema = z.object({
  inventoryItemId: z.string(),
});
export type UnequipItemInput = z.infer<typeof UnequipItemSchema>;

export const UpgradeItemSchema = z.object({
  inventoryItemId: z.string(),
});
export type UpgradeItemInput = z.infer<typeof UpgradeItemSchema>;

export const SetActiveSlotSchema = z.object({
  inventoryItemId: z.string(),
  slotIndex: z.number().int().min(0).max(ACTIVE_SLOT_COUNT - 1),
});
export type SetActiveSlotInput = z.infer<typeof SetActiveSlotSchema>;

export const ClearActiveSlotSchema = z.object({
  inventoryItemId: z.string(),
});
export type ClearActiveSlotInput = z.infer<typeof ClearActiveSlotSchema>;

export const InventoryItemSchema = z.object({
  id: z.string(),
  characterId: z.string(),
  itemId: z.string(),
  slotIndex: z.number().int(),
  quantity: z.number().int(),
  rolledStats: StatBlockSchema,
  upgradeLevel: z.number().int(),
  equippedSlot: EquipSlotSchema.nullable(),
  activeSlotIndex: z.number().int().nullable(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export { ACTIVE_SLOT_COUNT };
