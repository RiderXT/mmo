import { apiFetch } from "./apiClient";

export const getAppVersion = () => apiFetch<{ version: string }>("/api/version");
