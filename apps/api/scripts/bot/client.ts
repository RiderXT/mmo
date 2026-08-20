/** Thin typed HTTP client for the bot — talks to the REAL running API exactly like a browser
 * would (Bearer token, JSON bodies), no direct DB/service-function access. That's deliberate:
 * the whole point of the bot is to exercise the actual HTTP+auth+DB path a real player hits, so
 * it catches real bugs and real server load, not just service-layer logic. */

export interface Character {
  id: string;
  userId: string;
  name: string;
  level: number;
  exp: number;
  gold: number;
  classId: string | null;
  strength: number;
  vitality: number;
  dexterity: number;
  intelligence: number;
  unspentStatPoints: number;
  unspentSkillPoints: number;
  currentZoneId: string | null;
  activeExpeditionId: string | null;
  travelDestinationZoneId: string | null;
  travelArrivesAt: string | null;
}

export interface ClassSkillNode {
  id: string;
  classSkillId: string;
  name: string;
  maxLevel: number;
  pointCost: number;
  requiresNodeId: string | null;
}

export interface ClassSkill {
  id: string;
  name: string;
  kind: "passive" | "active";
  unlockCost: number;
  nodes: ClassSkillNode[];
}

export interface CharacterClass {
  id: string;
  name: string;
  primaryStat: "strength" | "vitality" | "dexterity" | "intelligence";
  startingGold: number;
  skills: ClassSkill[];
}

export interface Monster {
  id: string;
  name: string;
  level: number;
}

export interface Zone {
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number;
  isTown: boolean;
  allowRevisitAboveLevel: number | null;
  monsters: { monster: Monster }[];
}

export interface NpcShopItem {
  id: string;
  itemId: string;
  goldPrice: number;
  stock: number | null;
  item: { id: string; name: string; type: string };
}

export interface Npc {
  id: string;
  name: string;
  kind: string;
  shopItems: NpcShopItem[];
}

export interface UpgradeRequirement {
  targetLevel: number;
  requiredItemId: string;
  requiredQty: number;
}

export interface Item {
  id: string;
  name: string;
  type: string;
  stackable: boolean;
  classId: string | null;
  upgradeRequirements: UpgradeRequirement[];
}

export interface InventoryItem {
  id: string;
  itemId: string;
  quantity: number;
  slotIndex: number | null;
  equippedSlot: string | null;
  activeSlotIndex: number | null;
  upgradeLevel: number;
}

export interface ExpeditionEvent {
  type: string;
  t: number;
  [key: string]: unknown;
}

export interface ActiveExpedition {
  id: string;
  zoneId: string;
  status: string;
  endsAt: string;
  events: ExpeditionEvent[];
  potionSlotsSnapshot: { slotIndex: number; itemId: string; quantity: number }[];
}

export interface ExpeditionClaimResult {
  result: { expGained: number; goldGained: number; monstersDefeated: number; loot: { itemId: string; quantity: number }[] };
  leveledUp: boolean;
  newLevel: number;
  overflowLoot: { itemId: string; quantity: number }[];
}

export interface UpgradeResult {
  success: boolean;
  newLevel: number;
  chance: number;
  goldCost: number;
  itemDestroyed: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export class GameClient {
  private accessToken: string | null = null;
  private credentials: { email: string; password: string } | null = null;

  constructor(private baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit, retrying = false): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 401 && this.credentials && !retrying) {
      // Access token expired (15min TTL) — re-login once and retry the same call.
      await this.login(this.credentials.email, this.credentials.password);
      return this.request<T>(path, init, true);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { error?: string });
      throw new ApiError(body.error ?? res.statusText, res.status);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async register(email: string, password: string): Promise<void> {
    const data = await this.request<{ accessToken: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.accessToken = data.accessToken;
    this.credentials = { email, password };
  }

  async login(email: string, password: string): Promise<void> {
    const data = await this.request<{ accessToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.accessToken = data.accessToken;
    this.credentials = { email, password };
  }

  listClasses() {
    return this.request<CharacterClass[]>("/api/classes");
  }

  createCharacter(name: string, classId: string) {
    return this.request<Character>("/api/characters", {
      method: "POST",
      body: JSON.stringify({ name, classId }),
    });
  }

  getCharacter(characterId: string) {
    return this.request<Character>(`/api/characters/${characterId}`);
  }

  allocateStat(characterId: string, stat: "strength" | "vitality" | "dexterity" | "intelligence") {
    return this.request<Character>(`/api/characters/${characterId}/allocate-stat`, {
      method: "POST",
      body: JSON.stringify({ stat }),
    });
  }

  unlockSkill(characterId: string, classSkillId: string) {
    return this.request<unknown>(`/api/characters/${characterId}/unlock-skill`, {
      method: "POST",
      body: JSON.stringify({ classSkillId }),
    });
  }

  unlockNode(characterId: string, nodeId: string) {
    return this.request<unknown>(`/api/characters/${characterId}/unlock-node`, {
      method: "POST",
      body: JSON.stringify({ nodeId }),
    });
  }

  getCharacterSkills(characterId: string) {
    return this.request<{ classSkillId: string; unlocked: boolean }[]>(`/api/characters/${characterId}/skills`);
  }

  getCharacterSkillNodes(characterId: string) {
    return this.request<{ nodeId: string; level: number }[]>(`/api/characters/${characterId}/skill-nodes`);
  }

  listZones() {
    return this.request<Zone[]>("/api/zones");
  }

  startTravel(characterId: string, destinationZoneId: string | null) {
    return this.request<{ travelArrivesAt: string }>("/api/travel/start", {
      method: "POST",
      body: JSON.stringify({ characterId, destinationZoneId }),
    });
  }

  listNpcsForZone(zoneId: string) {
    return this.request<Npc[]>(`/api/npc-shop/zone/${zoneId}`);
  }

  buyFromNpc(characterId: string, npcShopItemId: string, quantity = 1) {
    return this.request<{ itemId: string; quantity: number; totalPrice: number }>(`/api/npc-shop/${characterId}/buy`, {
      method: "POST",
      body: JSON.stringify({ npcShopItemId, quantity }),
    });
  }

  listItems() {
    return this.request<Item[]>("/api/items");
  }

  getInventory(characterId: string) {
    return this.request<InventoryItem[]>(`/api/inventory/${characterId}`);
  }

  equipItem(characterId: string, inventoryItemId: string, equipSlot: string) {
    return this.request<void>(`/api/inventory/${characterId}/equip`, {
      method: "POST",
      body: JSON.stringify({ inventoryItemId, equipSlot }),
    });
  }

  setActiveSlot(characterId: string, inventoryItemId: string, slotIndex: number) {
    return this.request<void>(`/api/inventory/${characterId}/set-active-slot`, {
      method: "POST",
      body: JSON.stringify({ inventoryItemId, slotIndex }),
    });
  }

  upgradeItem(characterId: string, inventoryItemId: string, catalystInventoryItemIds: string[] = []) {
    return this.request<UpgradeResult>(`/api/inventory/${characterId}/upgrade`, {
      method: "POST",
      body: JSON.stringify({ inventoryItemId, catalystInventoryItemIds }),
    });
  }

  startExpedition(characterId: string, zoneId: string, selectedMonsterIds: string[] = []) {
    return this.request<{ id: string }>("/api/expeditions/start", {
      method: "POST",
      body: JSON.stringify({ characterId, zoneId, selectedMonsterIds }),
    });
  }

  getActiveExpedition(characterId: string) {
    return this.request<ActiveExpedition | null>(`/api/expeditions/${characterId}/active`);
  }

  claimExpedition(expeditionId: string) {
    return this.request<ExpeditionClaimResult>(`/api/expeditions/${expeditionId}/claim`, { method: "POST" });
  }
}
