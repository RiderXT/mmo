import type { Character, CreateCharacterInput, CoreStatKey } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export const listCharacters = () => apiFetch<Character[]>("/api/characters");
export const getCharacter = (id: string) => apiFetch<Character>(`/api/characters/${id}`);
export const createCharacter = (input: CreateCharacterInput) =>
  apiFetch<Character>("/api/characters", { method: "POST", body: JSON.stringify(input) });

export const allocateStat = (characterId: string, stat: CoreStatKey) =>
  apiFetch<Character>(`/api/characters/${characterId}/allocate-stat`, {
    method: "POST",
    body: JSON.stringify({ stat }),
  });

export interface CharacterSkillDto {
  id: string;
  characterId: string;
  classSkillId: string;
  level: number;
}

export const allocateSkill = (characterId: string, classSkillId: string) =>
  apiFetch<CharacterSkillDto>(`/api/characters/${characterId}/allocate-skill`, {
    method: "POST",
    body: JSON.stringify({ classSkillId }),
  });

export const getCharacterSkills = (characterId: string) =>
  apiFetch<CharacterSkillDto[]>(`/api/characters/${characterId}/skills`);
