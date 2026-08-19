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
  CreateNpcInput,
  NpcKind,
  CreateFishingSpotInput,
  CreateMineInput,
  CreatePassiveSkillTypeInput,
  GatherKind,
  SkillCategory,
} from "@mmo/shared";
import { apiFetch } from "./apiClient";

export interface ZoneDto {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  maxLevel: number;
  travelTimeSeconds: number;
  isTown: boolean;
  allowRevisitAboveLevel: boolean;
  monsters: {
    id: string;
    monsterId: string;
    spawnWeight: number;
    maxCount: number;
    monster: { id: string; name: string; level: number; hp: number; expReward: number; goldReward: number };
  }[];
  drops: { id: string; itemId: string; dropChance: number; item: { id: string; name: string; type: string } }[];
  npcs: { id: string; name: string; kind: string }[];
  fishingSpot: { id: string; name: string } | null;
  mine: { id: string; name: string } | null;
}

export interface NpcShopItemDto {
  id: string;
  itemId: string;
  goldPrice: number;
  stock: number | null;
  item: { id: string; name: string; type: string };
}

export interface NpcDto {
  id: string;
  zoneId: string;
  name: string;
  kind: NpcKind;
  zone: { id: string; name: string; isTown: boolean };
  shopItems: NpcShopItemDto[];
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
  upgradeLevelConfigs: { id: string; targetLevel: number; successChance: number; goldCost: number | null }[];
  chestLoot: { id: string; rewardItemId: string; dropChance: number; minQty: number; maxQty: number; rewardItem: { id: string; name: string } }[];
  sellPrice: number;
  gridWidth: number;
  potionTrigger: PotionConfig["trigger"] | null;
  potionThresholdPct: number | null;
  potionIntervalSec: number | null;
  potionEffect: PotionConfig["effect"] | null;
  potionMagnitudePct: number | null;
  potionDurationSec: number | null;
  gatherSpeedBonusPctMax: number | null;
  gatherChanceBonusPctMax: number | null;
  baitChanceBonusPct: number | null;
  bookSkillTypeId: string | null;
  bookSuccessChance: number | null;
}

export interface SkillTreeNodeDto {
  id: string;
  classSkillId: string;
  name: string;
  description: string;
  effect: "magnitude" | "cost" | "cooldown";
  magnitudePct: number;
  pointCost: number;
  maxLevel: number;
  requiresNodeId: string | null;
}

export interface ClassSkillDto {
  id: string;
  name: string;
  description: string;
  kind: SkillKind;
  scalingStat: CoreStatKey;
  scalingFactor: number;
  unlockCost: number;
  targetStat: StatKey | null;
  effectType: SkillEffectType | null;
  cooldownSeconds: number | null;
  baseManaCost: number | null;
  category: SkillCategory;
  nodes: SkillTreeNodeDto[];
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

export interface FlaggedExpeditionDto {
  id: string;
  characterId: string;
  characterName: string;
  zoneId: string;
  zoneName: string;
  startedAt: string;
  result: { expGained: number; goldGained: number; monstersDefeated: number; loot: { itemId: string; quantity: number }[] };
}
export const listFlaggedExpeditions = () => apiFetch<FlaggedExpeditionDto[]>("/api/admin/expeditions");

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

// NPCs (town shop merchants)
export const listNpcs = () => apiFetch<NpcDto[]>("/api/admin/npcs");
export const createNpc = (input: CreateNpcInput) =>
  apiFetch<NpcDto>("/api/admin/npcs", { method: "POST", body: JSON.stringify(input) });
export const updateNpc = (id: string, input: CreateNpcInput) =>
  apiFetch<NpcDto>(`/api/admin/npcs/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteNpc = (id: string) => apiFetch<void>(`/api/admin/npcs/${id}`, { method: "DELETE" });

// Fishing spots
export interface FishingSpotDto {
  id: string;
  zoneId: string;
  name: string;
  minCatchSeconds: number | null;
  maxCatchSeconds: number | null;
  zone: { id: string; name: string };
  drops: {
    id: string;
    itemId: string;
    dropChance: number;
    minQty: number;
    maxQty: number;
    item: { id: string; name: string; type: string };
  }[];
}
export const listFishingSpots = () => apiFetch<FishingSpotDto[]>("/api/admin/fishing-spots");
export const createFishingSpot = (input: CreateFishingSpotInput) =>
  apiFetch<FishingSpotDto>("/api/admin/fishing-spots", { method: "POST", body: JSON.stringify(input) });
export const updateFishingSpot = (id: string, input: CreateFishingSpotInput) =>
  apiFetch<FishingSpotDto>(`/api/admin/fishing-spots/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteFishingSpot = (id: string) => apiFetch<void>(`/api/admin/fishing-spots/${id}`, { method: "DELETE" });

// Mines
export interface MineDto {
  id: string;
  zoneId: string;
  name: string;
  minExtractSeconds: number | null;
  maxExtractSeconds: number | null;
  minSearchSeconds: number | null;
  maxSearchSeconds: number | null;
  zone: { id: string; name: string };
  drops: {
    id: string;
    itemId: string;
    dropChance: number;
    minQty: number;
    maxQty: number;
    item: { id: string; name: string; type: string };
  }[];
}
export const listMines = () => apiFetch<MineDto[]>("/api/admin/mines");
export const createMine = (input: CreateMineInput) =>
  apiFetch<MineDto>("/api/admin/mines", { method: "POST", body: JSON.stringify(input) });
export const updateMine = (id: string, input: CreateMineInput) =>
  apiFetch<MineDto>(`/api/admin/mines/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteMine = (id: string) => apiFetch<void>(`/api/admin/mines/${id}`, { method: "DELETE" });

// Passive skill types
export interface PassiveSkillTypeDto {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  gatherKind: GatherKind | null;
  chanceBonusPerLevel: number;
  speedBonusPerLevel: number;
  xpPerLevel: number;
  xpPerGatherAction: number;
  bookGateFromLevel: number | null;
  booksRequiredPerLevel: number;
}
export const listPassiveSkillTypes = () => apiFetch<PassiveSkillTypeDto[]>("/api/admin/passive-skills");
export const createPassiveSkillType = (input: CreatePassiveSkillTypeInput) =>
  apiFetch<PassiveSkillTypeDto>("/api/admin/passive-skills", { method: "POST", body: JSON.stringify(input) });
export const updatePassiveSkillType = (id: string, input: CreatePassiveSkillTypeInput) =>
  apiFetch<PassiveSkillTypeDto>(`/api/admin/passive-skills/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deletePassiveSkillType = (id: string) =>
  apiFetch<void>(`/api/admin/passive-skills/${id}`, { method: "DELETE" });
