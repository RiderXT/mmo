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
  CreateChangelogEntryInput,
  UpdateChangelogEntryInput,
  TicketStatus,
  ReplyToTicketInput,
} from "@mmo/shared";
import { apiFetch, API_URL, ApiError } from "./apiClient";
import { useAuthStore } from "../store/authStore";

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
    monster: {
      id: string;
      name: string;
      level: number;
      hp: number;
      expReward: number;
      goldReward: number;
      drops: {
        id: string;
        dropChance: number;
        minQty: number;
        maxQty: number;
        item: { id: string; name: string; type: ItemType; imageUrl: string | null };
      }[];
    };
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
  catalystSuccessChanceBonusPct: number | null;
  imageUrl: string | null;
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
  imageUrl: string | null;
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
  durationSeconds: number | null;
  category: SkillCategory;
  nodes: SkillTreeNodeDto[];
  imageUrl: string | null;
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

// Multipart upload — deliberately NOT going through apiFetch, which always forces a JSON
// Content-Type; a browser-built FormData needs its own auto-generated multipart boundary header.
export const uploadItemImage = async (id: string, file: File): Promise<ItemDto> => {
  const { accessToken } = useAuthStore.getState();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/admin/items/${id}/image`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(body.error ?? res.statusText, res.status);
  }
  return res.json();
};

// Classes
export const listClasses = () => apiFetch<ClassDto[]>("/api/admin/classes");
export const createClass = (input: CreateCharacterClassInput) =>
  apiFetch<ClassDto>("/api/admin/classes", { method: "POST", body: JSON.stringify(input) });
export const updateClass = (id: string, input: CreateCharacterClassInput) =>
  apiFetch<ClassDto>(`/api/admin/classes/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteClass = (id: string) =>
  apiFetch<void>(`/api/admin/classes/${id}`, { method: "DELETE" });

// Multipart uploads — same reasoning as uploadItemImage above (FormData needs its own
// auto-generated boundary header, apiFetch always forces JSON). Both return the whole parent
// class so the admin form can refresh its state directly.
export const uploadClassSkillImage = async (skillId: string, file: File): Promise<ClassDto> => {
  const { accessToken } = useAuthStore.getState();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/admin/classes/skills/${skillId}/image`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(body.error ?? res.statusText, res.status);
  }
  return res.json();
};

export const uploadSkillNodeImage = async (nodeId: string, file: File): Promise<ClassDto> => {
  const { accessToken } = useAuthStore.getState();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/admin/classes/nodes/${nodeId}/image`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(body.error ?? res.statusText, res.status);
  }
  return res.json();
};

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

// Server load — per-module request stats + process/system resource samples (see
// apps/api/src/lib/serverLoad.ts). In-memory on the server, resets on API restart.
export interface ServerLoadModuleStat {
  module: string;
  count: number;
  avgMs: number;
  maxMs: number;
  errorCount: number;
  errorRatePct: number;
  totalMs: number;
}
export interface ServerLoadSystemSample {
  t: number;
  rssMb: number;
  heapUsedMb: number;
  eventLoopDelayP50Ms: number;
  eventLoopDelayP99Ms: number;
  processCpuPercent: number;
  systemLoadavg1m: number;
  systemFreeMemPercent: number;
}
export interface ServerLoadErrorEntry {
  t: number;
  module: string;
  method: string;
  path: string;
  statusCode: number;
  message?: string;
}
export interface ServerLoadSnapshotDto {
  modules: ServerLoadModuleStat[];
  timelineByModule: Record<string, { minuteStartMs: number; count: number; totalMs: number; errorCount: number }[]>;
  recentErrors: ServerLoadErrorEntry[];
  systemSamples: ServerLoadSystemSample[];
  latest: ServerLoadSystemSample | null;
  cpuCount: number;
  processUptimeSeconds: number;
}
export const getServerLoad = () => apiFetch<ServerLoadSnapshotDto>("/api/admin/server-load");
export const resetServerLoad = () => apiFetch<void>("/api/admin/server-load/reset", { method: "POST" });

// Bots — admin-triggered playtesting/load-test runs (see apps/api/scripts/bot/).
export interface BotRunDto {
  id: string;
  name: string;
  className: string;
  targetLevel: number;
  status: "running" | "completed" | "failed" | "stopped";
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
}
export interface BotRunLogDto extends BotRunDto {
  logLines: string[];
}
export interface LaunchBotsInput {
  count: number;
  className: string;
  targetLevel: number;
  maxMinutes: number;
}
export const launchBots = (input: LaunchBotsInput) =>
  apiFetch<BotRunDto[]>("/api/admin/bots/launch", { method: "POST", body: JSON.stringify(input) });
export const listBotRuns = () => apiFetch<BotRunDto[]>("/api/admin/bots");
export const getBotLog = (id: string) => apiFetch<BotRunLogDto>(`/api/admin/bots/${id}/log`);
export const stopBot = (id: string) => apiFetch<void>(`/api/admin/bots/${id}/stop`, { method: "POST" });

// Accounts — admin listing + hard delete (immediate, unlike the 30-day player self-service
// request flow in modules/account).
export interface AdminUserDto {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  lastSeenAt: string | null;
  deletionRequestedAt: string | null;
  characterCount: number;
}
export const listUsers = () => apiFetch<AdminUserDto[]>("/api/admin/users");
export const deleteUserAccount = (id: string) => apiFetch<void>(`/api/admin/users/${id}`, { method: "DELETE" });

// Changelog — admin CRUD. Manually maintained (see docs/architecture.md), not auto-generated
// from git — an entry only shows up once an admin adds it here.
export interface ChangelogEntryDto {
  id: string;
  title: string;
  body: string;
  authorUserId: string;
  createdAt: string;
}
export const listChangelogEntriesAdmin = () => apiFetch<ChangelogEntryDto[]>("/api/admin/changelog");
export const createChangelogEntry = (input: CreateChangelogEntryInput) =>
  apiFetch<ChangelogEntryDto>("/api/admin/changelog", { method: "POST", body: JSON.stringify(input) });
export const updateChangelogEntry = (id: string, input: UpdateChangelogEntryInput) =>
  apiFetch<ChangelogEntryDto>(`/api/admin/changelog/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const deleteChangelogEntry = (id: string) =>
  apiFetch<void>(`/api/admin/changelog/${id}`, { method: "DELETE" });

// Support tickets — admin side. Player side lives in lib/supportApi.ts.
export interface SupportTicketReplyDto {
  id: string;
  body: string;
  authorEmail: string;
  isAdminReply: boolean;
  createdAt: string;
}
export interface SupportTicketAdminDto {
  id: string;
  subject: string;
  body: string;
  status: TicketStatus;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
  replies: SupportTicketReplyDto[];
}
export const listAllTickets = (status?: TicketStatus) =>
  apiFetch<SupportTicketAdminDto[]>(`/api/admin/support${status ? `?status=${status}` : ""}`);
export const replyToTicketAsAdmin = (ticketId: string, input: ReplyToTicketInput) =>
  apiFetch<SupportTicketReplyDto>(`/api/admin/support/${ticketId}/replies`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updateTicketStatus = (ticketId: string, status: TicketStatus) =>
  apiFetch<SupportTicketAdminDto>(`/api/admin/support/${ticketId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
