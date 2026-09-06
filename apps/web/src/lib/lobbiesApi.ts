import type { LobbyCombatEvent, CombatRole } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export interface LobbyMemberDto {
  characterId: string;
  name: string;
  level: number;
  classId: string | null;
  className: string | null;
  combatRole: CombatRole;
  ready: boolean;
  isLeader: boolean;
}

export interface LobbyDto {
  id: string;
  zoneId: string;
  status: "forming" | "in_progress" | "completed" | "disbanded";
  maxMembers: number;
  leaderCharacterId: string;
  members: LobbyMemberDto[];
  activeLobbyExpeditionId: string | null;
}

export interface StartLobbyExpeditionResult {
  id: string;
  lobbyId: string;
  zoneId: string;
  status: string;
  startedAt: string;
  endsAt: string;
  classCompositionBonusPct: number;
  events: LobbyCombatEvent[];
}

export interface LobbyExpeditionDto {
  id: string;
  lobbyId: string;
  zoneId: string;
  status: string;
  startedAt: string;
  endsAt: string;
  classCompositionBonusPct: number;
  myResultStatus: "in_progress" | "claimed" | "flagged";
  events: LobbyCombatEvent[];
}

export interface LobbyRewardLoot {
  itemId: string;
  quantity: number;
}

export interface LobbyClaimResult {
  result: {
    expGained: number;
    goldGained: number;
    monstersDefeated: number;
    loot: LobbyRewardLoot[];
  };
  leveledUp: boolean;
  newLevel: number;
}

export const listOpenLobbiesInZone = (zoneId: string, characterId: string) =>
  apiFetch<LobbyDto[]>(`/api/lobbies/zone/${zoneId}?characterId=${characterId}`);

export const getActiveLobby = (characterId: string) => apiFetch<LobbyDto | null>(`/api/lobbies/active/${characterId}`);

export const createLobby = (characterId: string, zoneId: string) =>
  apiFetch<LobbyDto>("/api/lobbies", { method: "POST", body: JSON.stringify({ characterId, zoneId }) });

export const joinLobby = (lobbyId: string, characterId: string) =>
  apiFetch<LobbyDto>(`/api/lobbies/${lobbyId}/join`, { method: "POST", body: JSON.stringify({ characterId }) });

export const leaveLobby = (lobbyId: string, characterId: string) =>
  apiFetch<{ ok: true }>(`/api/lobbies/${lobbyId}/leave`, { method: "POST", body: JSON.stringify({ characterId }) });

export const kickLobbyMember = (lobbyId: string, characterId: string, targetCharacterId: string) =>
  apiFetch<{ ok: true }>(`/api/lobbies/${lobbyId}/kick`, {
    method: "POST",
    body: JSON.stringify({ characterId, targetCharacterId }),
  });

export const setLobbyReady = (lobbyId: string, characterId: string, ready: boolean) =>
  apiFetch<LobbyDto>(`/api/lobbies/${lobbyId}/ready`, { method: "POST", body: JSON.stringify({ characterId, ready }) });

export const startLobbyExpedition = (lobbyId: string, characterId: string, selectedMonsterIds: string[] = []) =>
  apiFetch<StartLobbyExpeditionResult>(`/api/lobbies/${lobbyId}/start`, {
    method: "POST",
    body: JSON.stringify({ characterId, selectedMonsterIds }),
  });

export const getLobbyExpedition = (lobbyExpeditionId: string, characterId: string) =>
  apiFetch<LobbyExpeditionDto>(`/api/lobbies/expeditions/${lobbyExpeditionId}?characterId=${characterId}`);

export const claimLobbyExpeditionReward = (lobbyExpeditionId: string, characterId: string) =>
  apiFetch<LobbyClaimResult>(`/api/lobbies/expeditions/${lobbyExpeditionId}/claim`, {
    method: "POST",
    body: JSON.stringify({ characterId }),
  });

export const getLobbySettings = () => apiFetch<{ maxMembers: number }>("/api/settings/lobby-settings");
