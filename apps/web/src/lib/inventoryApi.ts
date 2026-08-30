import type { EquipSlot, ItemType, PotionEffect, PotionTrigger, StatKey } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export interface InventoryItemDto {
  id: string;
  characterId: string;
  itemId: string;
  // null while equipped or sitting in an active potion slot — see apps/api's InventoryItem.slotIndex.
  slotIndex: number | null;
  quantity: number;
  rolledStats: Partial<Record<StatKey, number>>;
  upgradeLevel: number;
  equippedSlot: EquipSlot | null;
  activeSlotIndex: number | null;
  // Player's per-slot override of item.potionThresholdPct — see setPotionThresholdOverride below.
  potionThresholdOverridePct: number | null;
  // Only meaningful for type rod/pickaxe — successful gathers performed with this specific tool
  // since its last upgrade. See gathering.settings.successesPerToolUpgrade / upgradeItem gating.
  gatherSuccessCount: number;
  // Only meaningful for type "book" — see item.bookCooldownSeconds below / readBook / readSkillBook.
  lastReadAt: string | null;
  nextReadBonusPct: number | null;
  item: {
    id: string;
    name: string;
    type: ItemType;
    minLevel: number;
    stackable: boolean;
    maxStack: number;
    description: string;
    baseStats: Partial<Record<StatKey, number>>;
    maxUpgradeStats: Partial<Record<StatKey, number>>;
    classId: string | null;
    class: { id: string; name: string } | null;
    sellPrice: number;
    gridWidth: number;
    // Uploaded artwork (relative /uploads/... path from the API), or null to fall back to the
    // generic per-type placeholder icon — see components/inventory/ItemTypeIcon.tsx.
    imageUrl: string | null;
    // Potion behavior (only meaningful when type === "consumable") — drives the active-slot
    // right-click "Ustaw próg użycia" entry (hp_below/mana_below triggers) and the "Użyj" entry
    // (on_use trigger — see useBuffItem below).
    potionTrigger: PotionTrigger | null;
    potionThresholdPct: number | null;
    // Only meaningful when potionTrigger === "on_use" — which personal buff it grants and for
    // how long. See useBuffItem.
    potionEffect: PotionEffect | null;
    potionDurationSec: number | null;
    // Only meaningful when type === "catalyst" — see AnvilTab's catalyst slots / upgradeItem.
    catalystSuccessChanceBonusPct: number | null;
    // Only meaningful when type === "book" — exactly one of the two is set (mutually exclusive),
    // driving which read endpoint EquipmentTab dispatches to. See readBook (passive) /
    // readSkillBook (class), bookCooldownSeconds gates re-reading (see InventoryItem.lastReadAt).
    bookSkillTypeId: string | null;
    bookClassSkillId: string | null;
    bookCooldownSeconds: number | null;
  };
}

export const listInventory = (characterId: string) =>
  apiFetch<InventoryItemDto[]>(`/api/inventory/${characterId}`);

export const moveItem = (characterId: string, inventoryItemId: string, toSlotIndex: number) =>
  apiFetch<void>(`/api/inventory/${characterId}/move`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId, toSlotIndex }),
  });

export const equipItem = (characterId: string, inventoryItemId: string, equipSlot: EquipSlot) =>
  apiFetch<void>(`/api/inventory/${characterId}/equip`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId, equipSlot }),
  });

export const unequipItem = (characterId: string, inventoryItemId: string) =>
  apiFetch<void>(`/api/inventory/${characterId}/unequip`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId }),
  });

export interface UpgradeItemResultDto {
  success: boolean;
  newLevel: number;
  chance: number;
  catalystBonusPct: number;
  goldCost: number;
  itemDestroyed: boolean;
}

export const upgradeItem = (characterId: string, inventoryItemId: string, catalystInventoryItemIds: string[] = []) =>
  apiFetch<UpgradeItemResultDto>(`/api/inventory/${characterId}/upgrade`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId, catalystInventoryItemIds }),
  });

export const openChest = (characterId: string, inventoryItemId: string) =>
  apiFetch<{ awarded: { itemId: string; quantity: number }[] }>(`/api/inventory/${characterId}/open-chest`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId }),
  });

export const setActiveSlot = (characterId: string, inventoryItemId: string, slotIndex: number) =>
  apiFetch<void>(`/api/inventory/${characterId}/set-active-slot`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId, slotIndex }),
  });

export const clearActiveSlot = (characterId: string, inventoryItemId: string) =>
  apiFetch<void>(`/api/inventory/${characterId}/clear-active-slot`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId }),
  });

export type UseBuffItemResultDto =
  | { effect: "buff_exp" | "buff_gold" | "buff_drop"; multiplier: number; until: string }
  | { effect: "reset_book_cooldown" | "boost_next_book_chance"; targetInventoryItemId: string }
  | { effect: "reset_class_skill_books"; resetToLevel: number };

/** Consumes a potionTrigger "on_use" item — either a personal exp/gold/drop multiplier, or (for
 * the 3 book-utility effects) an action targeting a specific book (targetInventoryItemId) or
 * book-gated class skill (targetClassSkillId) the player picks in UseOnTargetModal first. See the
 * "Użyj" context-menu entry in EquipmentTab. */
export const useBuffItem = (
  characterId: string,
  inventoryItemId: string,
  target?: { targetInventoryItemId?: string; targetClassSkillId?: string },
) =>
  apiFetch<UseBuffItemResultDto>(`/api/inventory/${characterId}/use-buff-item`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId, ...target }),
  });

export const sellItem = (characterId: string, inventoryItemId: string) =>
  apiFetch<{ goldEarned: number }>(`/api/inventory/${characterId}/sell`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId }),
  });

export const discardItem = (characterId: string, inventoryItemId: string) =>
  apiFetch<void>(`/api/inventory/${characterId}/discard`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId }),
  });

/** null clears the override, reverting to the item's admin-configured default threshold. */
export const setPotionThresholdOverride = (
  characterId: string,
  inventoryItemId: string,
  thresholdPct: number | null,
) =>
  apiFetch<void>(`/api/inventory/${characterId}/potion-threshold`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId, thresholdPct }),
  });
