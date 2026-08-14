import { apiFetch } from "./apiClient";
import type { ZoneDto } from "./adminApi";

export const listPlayerZones = () => apiFetch<ZoneDto[]>("/api/zones");
