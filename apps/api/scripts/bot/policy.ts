import { GameClient, ApiError, type Character, type Zone, type CharacterClass } from "./client.js";
import { BotReport } from "./report.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const THINK_DELAY_MS = 250; // small pause between unrelated actions — not a real constraint, just avoids hammering the server in a tight sync loop for no reason.
const ACTIVE_POTION_SLOT = 0;
const MIN_POTIONS_TO_CARRY = 5;
const POTIONS_TO_BUY = 10;

export interface BotOptions {
  baseUrl: string;
  botName: string;
  className: string; // must match a CharacterClass.name exactly
  targetLevel: number;
  maxWallClockMs: number;
  maxExpeditions: number;
}

function pickWildZone(zones: Zone[], level: number): Zone | null {
  const eligible = zones.filter(
    (z) => !z.isTown && level >= z.minLevel && (level <= z.maxLevel || (z.allowRevisitAboveLevel !== null && level >= z.allowRevisitAboveLevel)),
  );
  if (eligible.length === 0) return null;
  // Prefer the toughest zone the character still qualifies for — better exp/gold rate than
  // sitting in a zone far below current level.
  return eligible.sort((a, b) => b.minLevel - a.minLevel)[0];
}

function pickTownZone(zones: Zone[]): Zone | null {
  return zones.find((z) => z.isTown) ?? null;
}

async function waitForTravel(client: GameClient, characterId: string): Promise<Character> {
  for (;;) {
    const character = await client.getCharacter(characterId);
    if (!character.travelArrivesAt) return character;
    const remainingMs = new Date(character.travelArrivesAt).getTime() - Date.now();
    await sleep(Math.max(200, Math.min(remainingMs + 200, 5000)));
  }
}

async function ensureInZone(client: GameClient, report: BotReport, characterId: string, zoneId: string, character: Character): Promise<Character> {
  if (character.currentZoneId === zoneId) return character;
  await client.startTravel(characterId, zoneId);
  report.log("travel", `Podróż do strefy ${zoneId}`);
  const arrived = await waitForTravel(client, characterId);
  return arrived;
}

async function spendStatPoints(client: GameClient, report: BotReport, character: Character, cls: CharacterClass): Promise<Character> {
  let current = character;
  while (current.unspentStatPoints > 0) {
    current = await client.allocateStat(current.id, cls.primaryStat);
    await sleep(THINK_DELAY_MS);
  }
  return current;
}

async function spendSkillPoints(client: GameClient, report: BotReport, character: Character, cls: CharacterClass): Promise<Character> {
  let current = character;
  let spentSomething = true;
  // Loop until either out of points or a full pass finds nothing affordable/available — nodes
  // unlock progressively (parent must be unlocked, prerequisites satisfied), so one pass isn't
  // always enough to spend everything in a single tick.
  while (current.unspentSkillPoints > 0 && spentSomething) {
    spentSomething = false;
    const [skillState, nodeState] = await Promise.all([
      client.getCharacterSkills(current.id),
      client.getCharacterSkillNodes(current.id),
    ]);
    const unlockedSkillIds = new Set(skillState.filter((s) => s.unlocked).map((s) => s.classSkillId));
    const nodeLevels = new Map(nodeState.map((n) => [n.nodeId, n.level]));

    // First priority: unlock a new root ClassSkill if affordable (opens up its node tree).
    const affordableSkill = cls.skills.find((s) => !unlockedSkillIds.has(s.id) && s.unlockCost <= current.unspentSkillPoints);
    if (affordableSkill) {
      try {
        await client.unlockSkill(current.id, affordableSkill.id);
        report.log("skill", `Odblokowano umiejętność: ${affordableSkill.name}`);
        current = await client.getCharacter(current.id);
        spentSomething = true;
        await sleep(THINK_DELAY_MS);
        continue;
      } catch (err) {
        report.recordError(current.level, `Nie udało się odblokować umiejętności ${affordableSkill.name}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Second priority: invest in any tree node whose parent skill is unlocked, whose prerequisite
    // (if any) is already at level >= 1, and that isn't maxed yet.
    for (const skill of cls.skills) {
      if (!unlockedSkillIds.has(skill.id)) continue;
      const affordableNode = skill.nodes.find((n) => {
        const level = nodeLevels.get(n.id) ?? 0;
        if (level >= n.maxLevel) return false;
        if (n.requiresNodeId && (nodeLevels.get(n.requiresNodeId) ?? 0) < 1) return false;
        return n.pointCost <= current.unspentSkillPoints;
      });
      if (affordableNode) {
        try {
          await client.unlockNode(current.id, affordableNode.id);
          report.log("skill", `Zainwestowano w węzeł: ${affordableNode.name}`);
          current = await client.getCharacter(current.id);
          spentSomething = true;
          await sleep(THINK_DELAY_MS);
          break;
        } catch (err) {
          report.recordError(current.level, `Nie udało się zainwestować w węzeł ${affordableNode.name}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }
  return current;
}

async function equipStarterGear(client: GameClient, report: BotReport, characterId: string) {
  const EQUIPPABLE = new Set(["weapon", "armor", "helmet", "boots", "shield", "necklace", "earrings", "ring", "rod", "pickaxe"]);
  const [inventory, items] = await Promise.all([client.getInventory(characterId), client.listItems()]);
  const itemFor = (id: string) => items.find((i) => i.id === id);
  const equippedSlots = new Set(inventory.filter((i) => i.equippedSlot).map((i) => i.equippedSlot));
  for (const inv of inventory) {
    if (inv.equippedSlot) continue;
    const item = itemFor(inv.itemId);
    if (!item || !EQUIPPABLE.has(item.type)) continue;
    if (equippedSlots.has(item.type)) continue; // keep whatever's already worn — no stat comparison in v1
    try {
      await client.equipItem(characterId, inv.id, item.type);
      report.log("equip", `Założono: ${item.name}`);
      equippedSlots.add(item.type);
      await sleep(THINK_DELAY_MS);
    } catch (err) {
      report.log("equip_skip", `Pominięto ${item.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function shopForPotions(client: GameClient, report: BotReport, character: Character, zones: Zone[]) {
  const town = pickTownZone(zones);
  if (!town) return character;
  let current = await ensureInZone(client, report, character.id, town.id, character);

  const inventory = await client.getInventory(current.id);
  const items = await client.listItems();
  const hasActivePotion = inventory.some((i) => i.activeSlotIndex === ACTIVE_POTION_SLOT);
  const ownedPotionQty = inventory
    .filter((i) => items.find((it) => it.id === i.itemId)?.type === "consumable")
    .reduce((sum, i) => sum + i.quantity, 0);

  if (ownedPotionQty >= MIN_POTIONS_TO_CARRY && hasActivePotion) return current;

  const npcs = await client.listNpcsForZone(town.id);
  const potionEntry = npcs.flatMap((n) => n.shopItems).find((s) => s.item.type === "consumable" && (s.stock === null || s.stock > 0));
  if (!potionEntry) {
    report.log("shop_skip", "Brak mikstur na sprzedaż w tym mieście");
    return current;
  }

  const affordableQty = Math.min(POTIONS_TO_BUY, Math.floor(current.gold / potionEntry.goldPrice));
  if (affordableQty > 0) {
    try {
      const bought = await client.buyFromNpc(current.id, potionEntry.id, affordableQty);
      report.recordGoldSpent(current.level, bought.totalPrice);
      report.log("buy", `Kupiono ${bought.quantity}x ${potionEntry.item.name} za ${bought.totalPrice}g`);
      current = await client.getCharacter(current.id);
    } catch (err) {
      report.recordError(current.level, `Nie udało się kupić mikstur: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (!hasActivePotion) {
    const freshInventory = await client.getInventory(current.id);
    const potionStack = freshInventory.find((i) => items.find((it) => it.id === i.itemId)?.id === potionEntry.itemId && !i.activeSlotIndex);
    if (potionStack) {
      try {
        await client.setActiveSlot(current.id, potionStack.id, ACTIVE_POTION_SLOT);
        report.log("equip_potion", `Umieszczono ${potionEntry.item.name} w aktywnym slocie`);
      } catch (err) {
        report.recordError(current.level, `Nie udało się ustawić aktywnego slotu: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  await sleep(THINK_DELAY_MS);
  return current;
}

async function tryUpgradeEquipped(client: GameClient, report: BotReport, character: Character) {
  const [inventory, items] = await Promise.all([client.getInventory(character.id), client.listItems()]);
  const ownedQtyByItemId = new Map<string, number>();
  for (const inv of inventory) ownedQtyByItemId.set(inv.itemId, (ownedQtyByItemId.get(inv.itemId) ?? 0) + inv.quantity);

  for (const inv of inventory.filter((i) => i.equippedSlot)) {
    const item = items.find((i) => i.id === inv.itemId);
    if (!item) continue;
    const targetLevel = inv.upgradeLevel + 1;
    const requirements = item.upgradeRequirements.filter((r) => r.targetLevel === targetLevel);
    if (requirements.length === 0) continue;
    const hasAllMaterials = requirements.every((r) => (ownedQtyByItemId.get(r.requiredItemId) ?? 0) >= r.requiredQty);
    if (!hasAllMaterials) continue;

    try {
      const result = await client.upgradeItem(character.id, inv.id);
      report.recordUpgradeAttempt(result.success);
      report.recordGoldSpent(character.level, result.goldCost);
      report.log(
        "upgrade",
        `${item.name}: próba ulepszenia do +${targetLevel} — ${result.success ? "sukces" : "porażka (przedmiot zniszczony)"} (koszt ${result.goldCost}g, szansa ${Math.round(result.chance * 100)}%)`,
      );
    } catch (err) {
      report.recordError(character.level, `Nie udało się ulepszyć ${item.name}: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(THINK_DELAY_MS);
  }
}

async function runExpeditionCycle(client: GameClient, report: BotReport, character: Character, zones: Zone[]): Promise<Character> {
  const zone = pickWildZone(zones, character.level);
  if (!zone) {
    report.recordError(character.level, `Brak dostępnej krainy dla poziomu ${character.level}`);
    return character;
  }
  let current = await ensureInZone(client, report, character.id, zone.id, character);

  // Deliberately conservative: only fight monsters at or below the character's own level.
  // Tried allowing +2 levels during dev of this tool and it flipped most fights into 0-win
  // losses (wasting potions/gold for zero exp) — a real signal about the early difficulty curve,
  // but bad for THIS bot's own job of measuring steady progression. If a run's report shows a
  // lot of "BRAK ZWYCIĘSTW" anyway, that's the zone's own monster mix being harder than its
  // minLevel suggests, worth a look on its own.
  const eligibleMonsterIds = zone.monsters
    .map((m) => m.monster)
    .filter((m) => m.level <= current.level)
    .map((m) => m.id);
  const selectedMonsterIds =
    eligibleMonsterIds.length > 0
      ? eligibleMonsterIds
      : [zone.monsters.slice().sort((a, b) => a.monster.level - b.monster.level)[0]?.monster.id].filter(Boolean);

  const inventoryBefore = await client.getInventory(current.id);
  const potionsBefore = inventoryBefore
    .filter((i) => i.activeSlotIndex !== null)
    .reduce((sum, i) => sum + i.quantity, 0);

  const started = await client.startExpedition(current.id, zone.id, selectedMonsterIds as string[]);
  report.recordExpedition(current.level);
  report.log("expedition_start", `Walka w: ${zone.name} (${selectedMonsterIds.length} typów potworów)`);

  for (;;) {
    const active = await client.getActiveExpedition(current.id);
    if (!active || active.status !== "in_progress") break;
    const remainingMs = new Date(active.endsAt).getTime() - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.max(300, Math.min(remainingMs + 300, 10000)));
  }

  const levelDuringFight = current.level;
  // The wait-loop above trusts its OWN clock to decide "endsAt has passed" (active.endsAt vs
  // Date.now()) — against a real server there can be enough clock skew between this machine and
  // the API host that the bot decides it's time a beat before the server's own check agrees,
  // and claimExpedition 409s with "Ekspedycja jeszcze trwa". A few short retries absorbs that
  // instead of crashing the whole run over what's really just a race with the wall clock.
  let claimResult: Awaited<ReturnType<typeof client.claimExpedition>> | null = null;
  for (let attempt = 0; attempt < 5 && claimResult === null; attempt++) {
    try {
      claimResult = await client.claimExpedition(started.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && attempt < 4) {
        await sleep(500);
        continue;
      }
      throw err;
    }
  }
  if (!claimResult) throw new Error("Nie udało się odebrać nagrody z ekspedycji po kilku próbach");
  report.recordGoldEarned(levelDuringFight, claimResult.result.goldGained);
  report.log(
    "expedition_claim",
    `Pokonano ${claimResult.result.monstersDefeated} potworów, +${claimResult.result.expGained} exp, +${claimResult.result.goldGained} złota` +
      (claimResult.result.monstersDefeated === 0 ? " (BRAK ZWYCIĘSTW — możliwy problem z balansem/wyborem potworów)" : ""),
  );
  if (claimResult.result.monstersDefeated === 0) {
    report.recordError(levelDuringFight, `Ekspedycja bez żadnego zwycięstwa w strefie ${zone.name}`, { zoneId: zone.id });
  }

  current = await client.getCharacter(current.id);

  const inventoryAfter = await client.getInventory(current.id);
  const potionsAfter = inventoryAfter.filter((i) => i.activeSlotIndex !== null).reduce((sum, i) => sum + i.quantity, 0);
  const potionsConsumed = Math.max(0, potionsBefore - potionsAfter);
  if (potionsConsumed > 0) report.recordPotionsConsumed(levelDuringFight, potionsConsumed);

  if (claimResult.leveledUp) {
    report.log("level_up", `Awans na poziom ${claimResult.newLevel}`);
  }

  return current;
}

export async function runBot(options: BotOptions): Promise<BotReport> {
  const client = new GameClient(options.baseUrl);
  const email = `${options.botName.toLowerCase()}@bot.test.local`;
  const password = "BotPassword123";

  try {
    await client.register(email, password);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      await client.login(email, password);
    } else {
      throw err;
    }
  }

  const classes = await client.listClasses();
  const cls = classes.find((c) => c.name === options.className);
  if (!cls) throw new Error(`Nie znaleziono klasy "${options.className}". Dostępne: ${classes.map((c) => c.name).join(", ")}`);

  let character = await client.createCharacter(options.botName, cls.id);

  const report = new BotReport(options.botName, cls.name);
  report.enterLevel(character.level);
  report.log("start", `Utworzono postać "${character.name}" klasy ${cls.name}, cel: poziom ${options.targetLevel}`);

  const zones = await client.listZones();
  let expeditionsRun = 0;

  while (character.level < options.targetLevel) {
    if (Date.now() - report.startedAt > options.maxWallClockMs) {
      report.log("stop", `Przerwano — przekroczono limit czasu (${options.maxWallClockMs}ms)`);
      break;
    }
    if (expeditionsRun >= options.maxExpeditions) {
      report.log("stop", `Przerwano — przekroczono limit ekspedycji (${options.maxExpeditions})`);
      break;
    }

    character = await spendStatPoints(client, report, character, cls);
    character = await spendSkillPoints(client, report, character, cls);
    await equipStarterGear(client, report, character.id);
    character = await shopForPotions(client, report, character, zones);
    await tryUpgradeEquipped(client, report, character);

    const levelBefore = character.level;
    character = await runExpeditionCycle(client, report, character, zones);
    expeditionsRun += 1;

    if (character.level > levelBefore) {
      report.leaveLevel(levelBefore);
      report.enterLevel(character.level);
    }
  }

  report.leaveLevel(character.level);
  report.log("finish", `Zakończono na poziomie ${character.level} po ${expeditionsRun} ekspedycjach`);
  return report;
}
