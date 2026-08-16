import { apiFetch } from "./apiClient";

export interface RankingEntryDto {
  id: string;
  name: string;
  level: number;
  exp: number;
  classId: string | null;
  className: string | null;
  online: boolean;
}

export const listRanking = (classId?: string) =>
  apiFetch<RankingEntryDto[]>(`/api/ranking${classId ? `?classId=${classId}` : ""}`);
