import type { GatheringSettings, LobbySettings, RegenSettings } from "@mmo/shared";
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

export const getLobbySettingsAdmin = () => apiFetch<LobbySettings>("/api/admin/settings/lobby-settings");

export const setLobbySettingsAdmin = (input: LobbySettings) =>
  apiFetch<LobbySettings>("/api/admin/settings/lobby-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const getRegenSettingsAdmin = () => apiFetch<RegenSettings>("/api/admin/settings/regen-settings");

export const setRegenSettingsAdmin = (input: RegenSettings) =>
  apiFetch<RegenSettings>("/api/admin/settings/regen-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const getBotsMaxConcurrentSetting = () => apiFetch<{ count: number }>("/api/admin/settings/bots-max-concurrent");

export const setBotsMaxConcurrentSetting = (count: number) =>
  apiFetch<{ count: number }>("/api/admin/settings/bots-max-concurrent", {
    method: "PUT",
    body: JSON.stringify({ count }),
  });
