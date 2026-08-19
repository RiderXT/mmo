import type { PassiveSkillDto } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export type { PassiveSkillDto };

export interface ReadBookResult {
  success: boolean;
  newLevel: number;
  skillName: string;
}

export const listPassiveSkills = (characterId: string) =>
  apiFetch<PassiveSkillDto[]>(`/api/passive-skills/${characterId}`);

export const readBook = (characterId: string, inventoryItemId: string) =>
  apiFetch<ReadBookResult>(`/api/passive-skills/${characterId}/read-book`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId }),
  });
