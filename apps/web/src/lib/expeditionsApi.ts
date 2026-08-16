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
