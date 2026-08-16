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

export interface CombatStatsDto {
  maxHp: number;
  maxMana: number;
  attack: number;
  defense: number;
  attackSpeed: number;
  critChance: number;
  critDamage: number;
  evasion: number;
  damageReduction: number;
  movementSpeedPct: number;
}

export const getCombatStats = (characterId: string) =>
  apiFetch<CombatStatsDto>(`/api/characters/${characterId}/combat-stats`);

export interface StatContribution {
  base: number;
  equipment: number;
  passive: number;
  total: number;
}

export type CombatStatsBreakdownDto = Record<keyof CombatStatsDto, StatContribution>;

export const getCombatStatsBreakdown = (characterId: string) =>
  apiFetch<CombatStatsBreakdownDto>(`/api/characters/${characterId}/combat-stats/breakdown`);

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
