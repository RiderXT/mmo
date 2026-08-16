import { INVENTORY_GRID_COLS, INVENTORY_GRID_SLOTS_PER_TAB, inventoryOccupiedRange } from "@mmo/shared";
import type { InventoryItemDto } from "./inventoryApi";

export { INVENTORY_GRID_COLS, INVENTORY_GRID_SLOTS_PER_TAB };

export interface GridCell {
  slotIndex: number;
  item: InventoryItemDto | null;
  width: number;
}

/** Lays out one tab page (INVENTORY_GRID_SLOTS_PER_TAB cells) of the equipment grid: expands
 * each placed item into its item.gridWidth footprint and skips the cell(s) a preceding wide
 * item already consumed, so weapon/armor (gridWidth 2) render spanning two columns instead of
 * as two separate slots. Mirrors the backend's inventoryOccupiedRange so what's rendered here
 * always matches what the server considers occupied. */
export function layoutGridTab(byGridSlot: Map<number, InventoryItemDto>, tabOffset: number): GridCell[] {
  const cells: GridCell[] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < INVENTORY_GRID_SLOTS_PER_TAB; i++) {
    if (consumed.has(i)) continue;
    const slotIndex = tabOffset + i;
    const item = byGridSlot.get(slotIndex);
    if (item) {
      const width = item.item.gridWidth ?? 1;
      const range = inventoryOccupiedRange(i, width) ?? [i];
      for (const cell of range) consumed.add(cell);
      cells.push({ slotIndex, item, width: range.length });
    } else {
      cells.push({ slotIndex, item: null, width: 1 });
    }
  }
  return cells;
}

