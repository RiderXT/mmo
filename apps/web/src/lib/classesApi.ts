import { apiFetch } from "./apiClient";
import type { ClassDto } from "./adminApi";

export const listPlayerClasses = () => apiFetch<ClassDto[]>("/api/classes");
export const getPlayerClass = (id: string) => apiFetch<ClassDto>(`/api/classes/${id}`);
