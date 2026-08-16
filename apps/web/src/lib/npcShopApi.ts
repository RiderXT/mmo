import { apiFetch } from "./apiClient";

export interface BuyFromNpcResultDto {
  itemId: string;
  quantity: number;
  totalPrice: number;
}

export interface NpcShopItemPublicDto {
  id: string;
  itemId: string;
  goldPrice: number;
  stock: number | null;
  item: { id: string; name: string; type: string };
}

export interface NpcPublicDto {
  id: string;
  name: string;
  kind: string;
  shopItems: NpcShopItemPublicDto[];
}

export const listNpcsForZone = (zoneId: string) => apiFetch<NpcPublicDto[]>(`/api/npc-shop/zone/${zoneId}`);

export const buyFromNpc = (characterId: string, npcShopItemId: string, quantity = 1) =>
  apiFetch<BuyFromNpcResultDto>(`/api/npc-shop/${characterId}/buy`, {
    method: "POST",
    body: JSON.stringify({ npcShopItemId, quantity }),
  });
