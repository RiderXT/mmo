import type { GatherSessionDto, GatherKind, GatheringSettings } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export type { GatherSessionDto };

export const getActiveGathering = (characterId: string) =>
  apiFetch<GatherSessionDto | null>(`/api/gathering/${characterId}/active`);

export const startGathering = (characterId: string, kind: GatherKind, targetId: string) =>
  apiFetch<GatherSessionDto>("/api/gathering/start", {
    method: "POST",
    body: JSON.stringify({ characterId, kind, targetId }),
  });

export const stopGathering = (characterId: string) =>
  apiFetch<void>(`/api/gathering/${characterId}/stop`, { method: "POST" });

export const getGatheringSettings = () => apiFetch<GatheringSettings>("/api/settings/gathering-settings");
