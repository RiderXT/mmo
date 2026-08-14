import { apiFetch } from "./apiClient";

export const getExpeditionDurationSetting = () =>
  apiFetch<{ minutes: number }>("/api/settings/expedition-duration");

export const setExpeditionDurationSetting = (minutes: number) =>
  apiFetch<{ minutes: number }>("/api/admin/settings/expedition-duration", {
    method: "PUT",
    body: JSON.stringify({ minutes }),
  });
