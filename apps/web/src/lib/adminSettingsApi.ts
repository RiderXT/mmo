import type { GatheringSettings } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export const getExpeditionDurationSetting = () =>
  apiFetch<{ minutes: number }>("/api/settings/expedition-duration");

export const setExpeditionDurationSetting = (minutes: number) =>
  apiFetch<{ minutes: number }>("/api/admin/settings/expedition-duration", {
    method: "PUT",
    body: JSON.stringify({ minutes }),
  });

export const getGatheringSettingsAdmin = () => apiFetch<GatheringSettings>("/api/settings/gathering-settings");

export const setGatheringSettingsAdmin = (input: GatheringSettings) =>
  apiFetch<GatheringSettings>("/api/admin/settings/gathering-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const getBotsMaxConcurrentSetting = () => apiFetch<{ count: number }>("/api/admin/settings/bots-max-concurrent");

export const setBotsMaxConcurrentSetting = (count: number) =>
  apiFetch<{ count: number }>("/api/admin/settings/bots-max-concurrent", {
    method: "PUT",
    body: JSON.stringify({ count }),
  });
