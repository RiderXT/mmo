import type { GameLogEntry } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export interface LogsFilter {
  module?: string;
  level?: string;
  search?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface LogsResponse {
  total: number;
  page: number;
  pageSize: number;
  entries: GameLogEntry[];
}

export function fetchLogs(filter: LogsFilter) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return apiFetch<LogsResponse>(`/api/admin/logs?${params.toString()}`);
}

export function fetchLogModules() {
  return apiFetch<string[]>("/api/admin/logs/modules");
}
