import type { CombatEvent, BattleTacticsInput } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export interface ExpeditionDto {
  id: string;
  characterId: string;
  zoneId: string;
  status: "in_progress" | "completed" | "claimed" | "flagged";
  startedAt: string;
  arrivedAt: string;
  fightEndsAt: string;
  endsAt: string;
  result: null;
  events: CombatEvent[];
  // Snapshot of the character's active item slots at the moment this fight was simulated — the
  // whole fight (incl. potion consumption) is resolved atomically at start, so live inventory
  // already reflects the post-fight state for the entire time this screen is open. Use this,
  // not a live inventory query, to show what was actually equipped for THIS fight.
  potionSlotsSnapshot: { slotIndex: number; itemId: string; quantity: number }[];
}

export interface ExpeditionLoot {
  itemId: string;
  quantity: number;
}

export interface ExpeditionClaimResult {
  result: {
    expGained: number;
    goldGained: number;
    monstersDefeated: number;
    loot: ExpeditionLoot[];
  };
  leveledUp: boolean;
  newLevel: number;
  // Loot that couldn't fit in the backpack (full inventory) — dropped, not lost with the rest of
  // the reward. See addLootToInventory's allowPartial mode.
  overflowLoot: ExpeditionLoot[];
}

export const getActiveExpedition = (characterId: string) =>
  apiFetch<ExpeditionDto | null>(`/api/expeditions/${characterId}/active`);

export const startExpedition = (
  characterId: string,
  zoneId: string,
  selectedMonsterIds: string[] = [],
  tactics?: BattleTacticsInput,
) =>
  apiFetch<ExpeditionDto>("/api/expeditions/start", {
    method: "POST",
    body: JSON.stringify({ characterId, zoneId, selectedMonsterIds, tactics }),
  });

export const claimExpedition = (expeditionId: string) =>
  apiFetch<ExpeditionClaimResult>(`/api/expeditions/${expeditionId}/claim`, { method: "POST" });

export const leaveExpedition = (expeditionId: string) =>
  apiFetch<ExpeditionClaimResult>(`/api/expeditions/${expeditionId}/leave`, { method: "POST" });

export const getExpeditionDuration = () =>
  apiFetch<{ minutes: number }>("/api/settings/expedition-duration");

export const getFlaggedCount = (characterId: string) =>
  apiFetch<{ count: number }>(`/api/expeditions/${characterId}/flagged-count`);
