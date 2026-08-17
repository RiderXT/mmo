import type { EquipSlot, ItemType, StatKey } from "@mmo/shared";
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
  goldCost: number;
  itemDestroyed: boolean;
}

export const upgradeItem = (characterId: string, inventoryItemId: string) =>
  apiFetch<UpgradeItemResultDto>(`/api/inventory/${characterId}/upgrade`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId }),
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
