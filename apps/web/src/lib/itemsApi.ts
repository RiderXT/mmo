import { apiFetch } from "./apiClient";
import type { ItemDto } from "./adminApi";

export const listPlayerItems = () => apiFetch<ItemDto[]>("/api/items");
