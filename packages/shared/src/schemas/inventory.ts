import { z } from "zod";
import { EquipSlotSchema, StatBlockSchema } from "./enums.js";

const ACTIVE_SLOT_COUNT = 6;

// Grid geometry shared by client (rendering) and server (multi-cell placement/collision for
// Item.gridWidth > 1 — weapon/armor stack 2 cells vertically) — must stay identical on both sides
// or a 2-tall item could be validated against one grid shape and rendered against another.
const INVENTORY_GRID_COLS = 5;
const INVENTORY_GRID_ROWS = 7;
const INVENTORY_GRID_SLOTS_PER_TAB = INVENTORY_GRID_COLS * INVENTORY_GRID_ROWS;

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

export const OpenChestSchema = z.object({
  inventoryItemId: z.string(),
});
export type OpenChestInput = z.infer<typeof OpenChestSchema>;

export const SellItemSchema = z.object({
  inventoryItemId: z.string(),
});
export type SellItemInput = z.infer<typeof SellItemSchema>;

export const DiscardItemSchema = z.object({
  inventoryItemId: z.string(),
});
export type DiscardItemInput = z.infer<typeof DiscardItemSchema>;

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

export { ACTIVE_SLOT_COUNT, INVENTORY_GRID_COLS, INVENTORY_GRID_ROWS, INVENTORY_GRID_SLOTS_PER_TAB };

/** Cells occupied by an item of `height` (Item.gridWidth — number of grid cells, stacked
 * vertically) starting at `slotIndex` (tab-relative or absolute — works either way since the
 * boundary check below is done modulo one tab's worth of cells). Returns null if placing it here
 * would spill past this tab's last row into the next tab's first row, which is invalid
 * regardless of whether those cells are otherwise free. */
export function inventoryOccupiedRange(slotIndex: number, height: number): number[] | null {
  const localRow = Math.floor((slotIndex % INVENTORY_GRID_SLOTS_PER_TAB) / INVENTORY_GRID_COLS);
  if (localRow + height > INVENTORY_GRID_ROWS) return null;
  const cells: number[] = [];
  for (let h = 0; h < height; h++) {
    cells.push(slotIndex + h * INVENTORY_GRID_COLS);
  }
  return cells;
}
