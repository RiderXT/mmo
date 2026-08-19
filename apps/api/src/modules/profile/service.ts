import { prisma } from "../../lib/prismaClient.js";
import { isOnline } from "../../lib/presence.js";
import { gatherCombatBuild } from "../expeditions/service.js";
import { computeDerivedStats } from "../expeditions/combat.js";
import { EquipSlotSchema, type StatKey } from "@mmo/shared";

export class ProfileError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

const TOTAL_EQUIP_SLOTS = EquipSlotSchema.options.length;

/** Public, read-only character sheet — unlike getCharacter/getCharacterCombatStats this has no
 * ownership check: any authenticated player can view any character's profile (needed so Ranking
 * and Znajomi can link out to other players' characters).
 *
 * Looked up by Character.name (already @unique in schema.prisma) rather than id, so profile URLs
 * read as /profile/<nazwa-postaci> instead of a bare cuid. */
export async function getCharacterProfile(characterName: string) {
  const character = await prisma.character.findUnique({
    where: { name: characterName },
    include: {
      user: { select: { lastSeenAt: true } },
      class: { select: { id: true, name: true } },
      currentZone: { select: { name: true, minLevel: true, maxLevel: true } },
    },
  });
  if (!character) throw new ProfileError("Nie znaleziono postaci", 404);
  const characterId = character.id;

  const [{ core, equipmentStats, passiveSkills }, equippedCount, skills] = await Promise.all([
    gatherCombatBuild(characterId),
    prisma.inventoryItem.count({ where: { characterId, equippedSlot: { not: null } } }),
    prisma.characterSkill.findMany({
      where: { characterId, level: { gt: 0 } },
      include: { classSkill: { select: { name: true, maxLevel: true } } },
      orderBy: { classSkill: { name: "asc" } },
    }),
  ]);

  const derived = computeDerivedStats(core, equipmentStats, passiveSkills);

  const equipmentBonuses = new Map<StatKey, number>();
  for (const stats of equipmentStats) {
    for (const [key, value] of Object.entries(stats) as [StatKey, number][]) {
      if (!value) continue;
      equipmentBonuses.set(key, (equipmentBonuses.get(key) ?? 0) + value);
    }
  }

  return {
    id: character.id,
    name: character.name,
    level: character.level,
    classId: character.classId,
    className: character.class?.name ?? null,
    createdAt: character.createdAt.toISOString(),
    online: isOnline(character.user.lastSeenAt),
    lastSeenAt: character.user.lastSeenAt?.toISOString() ?? null,
    zoneName: character.currentZone?.name ?? null,
    zoneMinLevel: character.currentZone?.minLevel ?? null,
    zoneMaxLevel: character.currentZone?.maxLevel ?? null,
    core: {
      strength: character.strength,
      vitality: character.vitality,
      dexterity: character.dexterity,
      intelligence: character.intelligence,
    },
    derived: {
      attack: derived.attack,
      defense: derived.defense,
      evasion: derived.evasion,
      attackSpeed: derived.attackSpeed,
      critChance: derived.critChance,
      critDamage: derived.critDamage,
      damageReduction: derived.damageReduction,
      movementSpeedPct: derived.movementSpeedPct,
    },
    equippedCount,
    totalEquipSlots: TOTAL_EQUIP_SLOTS,
    equipmentBonuses: Array.from(equipmentBonuses.entries()).map(([stat, value]) => ({ stat, value })),
    skills: skills.map((s) => ({ name: s.classSkill.name, level: s.level, maxLevel: s.classSkill.maxLevel })),
    monstersKilled: character.monstersKilled,
    chestsOpened: character.chestsOpened,
  };
}
