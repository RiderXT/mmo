import type { PassiveSkillDto } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export type { PassiveSkillDto };

export interface ReadBookResult {
  success: boolean;
  // Whether the level actually increased this read — for gatherKind-tied skills a successful
  // read can just add progress toward the book gate without leveling up yet.
  leveledUp: boolean;
  newLevel: number;
  skillName: string;
  // Only present for gatherKind-tied skills once past the book gate — see readBook in
  // apps/api's passiveSkills/service.ts.
  pendingBooksRead?: number;
  booksRequiredPerLevel?: number;
}

export const listPassiveSkills = (characterId: string) =>
  apiFetch<PassiveSkillDto[]>(`/api/passive-skills/${characterId}`);

export const readBook = (characterId: string, inventoryItemId: string) =>
  apiFetch<ReadBookResult>(`/api/passive-skills/${characterId}/read-book`, {
    method: "POST",
    body: JSON.stringify({ inventoryItemId }),
  });
