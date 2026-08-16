import type {
  CreateZoneInput,
  CreateMonsterInput,
  CreateItemInput,
  CreateCharacterClassInput,
  ItemType,
  StatKey,
  CoreStatKey,
  SkillKind,
  SkillEffectType,
  PotionConfig,
  AdminGrantInput,
  AdminCharacterDto,
  CreateGameEventInput,
} from "@mmo/shared";
import { apiFetch } from "./apiClient";

export interface ZoneDto {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  maxLevel: number;
  travelTimeSeconds: number;
  monsters: {
    id: string;
    monsterId: string;
    spawnWeight: number;
    maxCount: number;
    monster: { id: string; name: string; level: number; hp: number; expReward: number; goldReward: number };
  }[];
  drops: { id: string; itemId: string; dropChance: number; item: { id: string; name: string; type: string } }[];
}

export interface MonsterDto {
  id: string;
  name: string;
  level: number;
  hp: number;
  stats: Partial<Record<StatKey, number>>;
  skills: { name: string; description: string; power: number }[];
  expReward: number;
  goldReward: number;
  drops: { id: string; itemId: string; dropChance: number; minQty: number; maxQty: number; item: { id: string; name: string; type: string } }[];
}

export interface ItemDto {
  id: string;
  name: string;
  type: ItemType;
  minLevel: number;
  stackable: boolean;
  maxStack: number;
  description: string;
  baseStats: Partial<Record<StatKey, number>>;
  maxUpgradeStats: Partial<Record<StatKey, number>>;
  possibleStatRanges: { stat: StatKey; min: number; max: number; weight: number }[];
  classId: string | null;
  upgradeRequirements: { id: string; targetLevel: number; requiredItemId: string; requiredQty: number; requiredItem: { id: string; name: string } }[];
  chestLoot: { id: string; rewardItemId: string; dropChance: number; minQty: number; maxQty: number; rewardItem: { id: string; name: string } }[];
  sellPrice: number;
  potionTrigger: PotionConfig["trigger"] | null;
  potionThresholdPct: number | null;
  potionIntervalSec: number | null;
  potionEffect: PotionConfig["effect"] | null;
  potionMagnitudePct: number | null;
  potionDurationSec: number | null;
}

export interface ClassSkillDto {
  id: string;
  name: string;
  description: string;
  kind: SkillKind;
  scalingStat: CoreStatKey;
  scalingFactor: number;
  maxLevel: number;
  targetStat: StatKey | null;
  effectType: SkillEffectType | null;
  cooldownSeconds: number | null;
}

export interface ClassDto {
  id: string;
  name: string;
  description: string;
  primaryStat: CoreStatKey;
  skills: ClassSkillDto[];
  startingGold: number;
  starterItems: { id: string; itemId: string; quantity: number; item: { id: string; name: string } }[];
}

// Zones
export const listZones = () => apiFetch<ZoneDto[]>("/api/admin/zones");
export const createZone = (input: CreateZoneInput) =>
  apiFetch<ZoneDto>("/api/admin/zones", { method: "POST", body: JSON.stringify(input) });
export const updateZone = (id: string, input: CreateZoneInput) =>
  apiFetch<ZoneDto>(`/api/admin/zones/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteZone = (id: string) =>
  apiFetch<void>(`/api/admin/zones/${id}`, { method: "DELETE" });

// Monsters
export const listMonsters = () => apiFetch<MonsterDto[]>("/api/admin/monsters");
export const createMonster = (input: CreateMonsterInput) =>
  apiFetch<MonsterDto>("/api/admin/monsters", { method: "POST", body: JSON.stringify(input) });
export const updateMonster = (id: string, input: CreateMonsterInput) =>
  apiFetch<MonsterDto>(`/api/admin/monsters/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteMonster = (id: string) =>
  apiFetch<void>(`/api/admin/monsters/${id}`, { method: "DELETE" });

// Items
export const listItems = () => apiFetch<ItemDto[]>("/api/admin/items");
export const createItem = (input: CreateItemInput) =>
  apiFetch<ItemDto>("/api/admin/items", { method: "POST", body: JSON.stringify(input) });
export const updateItem = (id: string, input: CreateItemInput) =>
  apiFetch<ItemDto>(`/api/admin/items/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteItem = (id: string) =>
  apiFetch<void>(`/api/admin/items/${id}`, { method: "DELETE" });

// Classes
export const listClasses = () => apiFetch<ClassDto[]>("/api/admin/classes");
export const createClass = (input: CreateCharacterClassInput) =>
  apiFetch<ClassDto>("/api/admin/classes", { method: "POST", body: JSON.stringify(input) });
export const updateClass = (id: string, input: CreateCharacterClassInput) =>
  apiFetch<ClassDto>(`/api/admin/classes/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteClass = (id: string) =>
  apiFetch<void>(`/api/admin/classes/${id}`, { method: "DELETE" });

// Characters (testing tool)
export const listAllCharacters = () => apiFetch<AdminCharacterDto[]>("/api/admin/characters");
export const grantToCharacter = (characterId: string, input: AdminGrantInput) =>
  apiFetch<{ newLevel: number; levelsGained: number }>(`/api/admin/characters/${characterId}/grant`, {
    method: "POST",
    body: JSON.stringify(input),
  });

// Expeditions (revert tool)
export interface RevertExpeditionResult {
  characterId: string;
  reverted: {
    expGained: number;
    goldGained: number;
    monstersDefeated: number;
    loot: { itemId: string; quantity: number }[];
    levelsGained: number;
  };
  shortfalls: { itemId: string; requested: number; removed: number }[];
  levelBefore: number;
  levelAfter: number;
  expBefore: number;
  expAfter: number;
}
export const revertExpedition = (expeditionId: string) =>
  apiFetch<RevertExpeditionResult>(`/api/admin/expeditions/${expeditionId}/revert`, { method: "POST" });

export const resolveFlaggedExpedition = (expeditionId: string, grant: boolean) =>
  apiFetch<{ granted: boolean; newLevel?: number; leveledUp?: boolean }>(
    `/api/admin/expeditions/${expeditionId}/resolve`,
    { method: "POST", body: JSON.stringify({ grant }) },
  );

// Balance stats
export interface BalanceMonsterStat {
  monsterName: string;
  encounters: number;
  wins: number;
  losses: number;
  winRatePct: number;
  avgDamageTaken: number;
  avgRounds: number;
  avgPotionsUsed: number;
}

export interface BalanceItemStat {
  itemId: string;
  itemName: string;
  totalDropped: number;
  expeditionsWithDrop: number;
  dropsPerExpedition: number;
}

export interface BalanceZoneStat {
  zoneId: string;
  zoneName: string;
  expeditions: number;
  expPerHourCombat: number;
  goldPerHourCombat: number;
  expPerHourRoundTrip: number;
  goldPerHourRoundTrip: number;
}

export interface BalanceStatsDto {
  expeditionsAnalyzed: number;
  byMonster: BalanceMonsterStat[];
  byItem: BalanceItemStat[];
  byZone: BalanceZoneStat[];
}

export const getBalanceStats = () => apiFetch<BalanceStatsDto>("/api/admin/balance-stats");

// Events (time-boxed exp/gold multipliers)
export interface GameEventDto {
  id: string;
  name: string;
  expMultiplier: number;
  goldMultiplier: number;
  startsAt: string;
  endsAt: string;
  bonusDropItemId: string | null;
  bonusDropChance: number | null;
}
export const listEvents = () => apiFetch<GameEventDto[]>("/api/admin/events");
export const createEvent = (input: CreateGameEventInput) =>
  apiFetch<GameEventDto>("/api/admin/events", { method: "POST", body: JSON.stringify(input) });
export const updateEvent = (id: string, input: CreateGameEventInput) =>
  apiFetch<GameEventDto>(`/api/admin/events/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteEvent = (id: string) => apiFetch<void>(`/api/admin/events/${id}`, { method: "DELETE" });
