import type { StatKey } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export interface CharacterProfileDto {
  id: string;
  name: string;
  level: number;
  classId: string | null;
  className: string | null;
  createdAt: string;
  online: boolean;
  lastSeenAt: string | null;
  zoneName: string | null;
  zoneMinLevel: number | null;
  zoneMaxLevel: number | null;
  core: { strength: number; vitality: number; dexterity: number; intelligence: number };
  derived: {
    attack: number;
    defense: number;
    evasion: number;
    attackSpeed: number;
    critChance: number;
    critDamage: number;
    damageReduction: number;
    movementSpeedPct: number;
  };
  equippedCount: number;
  totalEquipSlots: number;
  equipmentBonuses: { stat: StatKey; value: number }[];
  skills: { name: string; level: number; maxLevel: number }[];
  monstersKilled: number;
  chestsOpened: number;
}

export const getCharacterProfile = (characterName: string) =>
  apiFetch<CharacterProfileDto>(`/api/profile/${encodeURIComponent(characterName)}`);
