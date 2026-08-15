import { prisma } from "../../../lib/prismaClient.js";
import type { CombatEvent } from "@mmo/shared";

/** Splits a full expedition event log into one array per encounter, cut at each
 * encounter_start boundary — lets us compute per-encounter damage/rounds/potion usage without
 * a new logging mechanism, since eventLog already has everything needed. */
function splitIntoEncounters(events: CombatEvent[]): CombatEvent[][] {
  const encounters: CombatEvent[][] = [];
  let current: CombatEvent[] = [];
  for (const event of events) {
    if (event.type === "encounter_start") {
      if (current.length) encounters.push(current);
      current = [];
    }
    current.push(event);
  }
  if (current.length) encounters.push(current);
  return encounters;
}

interface MonsterAgg {
  monsterName: string;
  encounters: number;
  wins: number;
  losses: number;
  totalDamageTaken: number;
  totalRounds: number;
  totalPotionsUsed: number;
}

interface ItemDropAgg {
  itemId: string;
  totalDropped: number;
  expeditionsWithDrop: number;
}

interface ZoneAgg {
  zoneId: string;
  zoneName: string;
  expeditions: number;
  totalExpGained: number;
  totalGoldGained: number;
  totalCombatHours: number;
  totalRoundTripHours: number;
}

export async function computeBalanceStats() {
  const expeditions = await prisma.expedition.findMany({
    where: { status: "claimed", eventLog: { not: null } },
    include: { zone: { select: { id: true, name: true } } },
  });

  const monsterMap = new Map<string, MonsterAgg>();
  const itemDropMap = new Map<string, ItemDropAgg>();
  const zoneMap = new Map<string, ZoneAgg>();

  for (const expedition of expeditions) {
    const events = JSON.parse(expedition.eventLog!) as CombatEvent[];

    const zoneAgg = zoneMap.get(expedition.zoneId) ?? {
      zoneId: expedition.zoneId,
      zoneName: expedition.zone.name,
      expeditions: 0,
      totalExpGained: 0,
      totalGoldGained: 0,
      totalCombatHours: 0,
      totalRoundTripHours: 0,
    };
    zoneAgg.expeditions += 1;
    zoneAgg.totalCombatHours += Math.max(0, (expedition.fightEndsAt.getTime() - expedition.arrivedAt.getTime()) / 3_600_000);
    zoneAgg.totalRoundTripHours += Math.max(0, (expedition.endsAt.getTime() - expedition.startedAt.getTime()) / 3_600_000);
    zoneMap.set(expedition.zoneId, zoneAgg);

    const expeditionDroppedItems = new Set<string>();

    for (const event of events) {
      if (event.type === "encounter_result") {
        zoneAgg.totalExpGained += event.expGained;
        zoneAgg.totalGoldGained += event.goldGained;
      } else if (event.type === "loot") {
        const agg = itemDropMap.get(event.itemId) ?? { itemId: event.itemId, totalDropped: 0, expeditionsWithDrop: 0 };
        agg.totalDropped += event.quantity;
        itemDropMap.set(event.itemId, agg);
        expeditionDroppedItems.add(event.itemId);
      }
    }
    for (const itemId of expeditionDroppedItems) {
      itemDropMap.get(itemId)!.expeditionsWithDrop += 1;
    }

    for (const encounter of splitIntoEncounters(events)) {
      const start = encounter.find((e) => e.type === "encounter_start");
      if (!start || start.type !== "encounter_start" || !start.monsterId) continue; // skip pre-Etap-10 logs, which lack monsterId

      // Etap 10: encounters no longer end in a per-encounter "loss" — combat continues until
      // the character dies (character_died, terminal for the whole expedition) or the monster
      // does (encounter_result). A chunk with neither is the in-progress final encounter of an
      // expedition that hit its safety time limit mid-fight — not a completed encounter, skip.
      const won = encounter.some((e) => e.type === "encounter_result");
      const died = encounter.some((e) => e.type === "character_died");
      if (!won && !died) continue;

      const agg = monsterMap.get(start.monsterId) ?? {
        monsterName: start.monsterName,
        encounters: 0,
        wins: 0,
        losses: 0,
        totalDamageTaken: 0,
        totalRounds: 0,
        totalPotionsUsed: 0,
      };
      agg.encounters += 1;
      if (won) agg.wins += 1;
      if (died) agg.losses += 1;

      for (const event of encounter) {
        if (event.type === "round") {
          agg.totalDamageTaken += event.monsterDamage;
          agg.totalRounds += 1;
        } else if (event.type === "potion_used") {
          agg.totalPotionsUsed += 1;
        }
      }
      monsterMap.set(start.monsterId, agg);
    }
  }

  const itemIds = [...itemDropMap.keys()];
  const items = itemIds.length ? await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } }) : [];
  const itemNameById = new Map(items.map((i) => [i.id, i.name]));

  const byMonster = [...monsterMap.values()]
    .map((m) => ({
      monsterName: m.monsterName,
      encounters: m.encounters,
      wins: m.wins,
      losses: m.losses,
      winRatePct: m.encounters ? Math.round((m.wins / m.encounters) * 1000) / 10 : 0,
      avgDamageTaken: m.encounters ? Math.round(m.totalDamageTaken / m.encounters) : 0,
      avgRounds: m.encounters ? Math.round((m.totalRounds / m.encounters) * 10) / 10 : 0,
      avgPotionsUsed: m.encounters ? Math.round((m.totalPotionsUsed / m.encounters) * 100) / 100 : 0,
    }))
    .sort((a, b) => a.monsterName.localeCompare(b.monsterName));

  const byItem = [...itemDropMap.values()]
    .map((i) => ({
      itemId: i.itemId,
      itemName: itemNameById.get(i.itemId) ?? i.itemId,
      totalDropped: i.totalDropped,
      expeditionsWithDrop: i.expeditionsWithDrop,
      dropsPerExpedition: expeditions.length ? Math.round((i.totalDropped / expeditions.length) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => b.totalDropped - a.totalDropped);

  const byZone = [...zoneMap.values()]
    .map((z) => ({
      zoneId: z.zoneId,
      zoneName: z.zoneName,
      expeditions: z.expeditions,
      expPerHourCombat: z.totalCombatHours > 0 ? Math.round(z.totalExpGained / z.totalCombatHours) : 0,
      goldPerHourCombat: z.totalCombatHours > 0 ? Math.round(z.totalGoldGained / z.totalCombatHours) : 0,
      expPerHourRoundTrip: z.totalRoundTripHours > 0 ? Math.round(z.totalExpGained / z.totalRoundTripHours) : 0,
      goldPerHourRoundTrip: z.totalRoundTripHours > 0 ? Math.round(z.totalGoldGained / z.totalRoundTripHours) : 0,
    }))
    .sort((a, b) => a.zoneName.localeCompare(b.zoneName));

  return { expeditionsAnalyzed: expeditions.length, byMonster, byItem, byZone };
}
