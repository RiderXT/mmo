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

// "Narzędzia zbieractwa" (rod/pickaxe) are shown as their own section in EquipmentTab, separate
// from the main gear doll — the profile's "EKWIPUNEK — X/Y SLOTÓW" stat should match that same
// grouping and only count the 8 traditional gear slots, not the 2 gathering-tool slots.
const CORE_EQUIP_SLOTS = EquipSlotSchema.options.filter((slot) => slot !== "rod" && slot !== "pickaxe");
const TOTAL_EQUIP_SLOTS = CORE_EQUIP_SLOTS.length;

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
      user: { select: { lastSeenAt: true, hideOnlineStatus: true } },
      class: { select: { id: true, name: true } },
      currentZone: { select: { name: true, minLevel: true, maxLevel: true } },
    },
  });
  if (!character) throw new ProfileError("Nie znaleziono postaci", 404);
  const characterId = character.id;

  const [{ core, equipmentStats, passiveSkills }, equippedCount, skills] = await Promise.all([
    gatherCombatBuild(characterId),
    prisma.inventoryItem.count({ where: { characterId, equippedSlot: { in: CORE_EQUIP_SLOTS } } }),
    prisma.characterSkill.findMany({
      where: { characterId, level: { gt: 0 } },
      include: { classSkill: { select: { name: true } } },
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
    // hideOnlineStatus hides both the derived online flag AND the raw timestamp it's derived
    // from — exposing lastSeenAt while just zeroing "online" would defeat the point of the toggle.
    online: character.user.hideOnlineStatus ? false : isOnline(character.user.lastSeenAt),
    lastSeenAt: character.user.hideOnlineStatus ? null : (character.user.lastSeenAt?.toISOString() ?? null),
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
    skills: skills.map((s) => ({ name: s.classSkill.name })),
    monstersKilled: character.monstersKilled,
    chestsOpened: character.chestsOpened,
  };
}
