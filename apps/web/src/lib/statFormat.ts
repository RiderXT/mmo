import type { StatKey } from "@mmo/shared";

export const STAT_LABELS: Record<StatKey, string> = {
  attack: "Atak",
  defense: "Obrona",
  hp: "Zdrowie",
  maxMana: "Mana",
  critChance: "Szansa na trafienie krytyczne",
  critDamage: "Obrażenia krytyczne",
  attackSpeed: "Szybkość ataku",
  evasion: "Unik",
  damageReduction: "Redukcja obrażeń",
  movementSpeed: "Prędkość ruchu",
};

/**
 * How a stat's raw number should be shown. "flat" stats (attack/defense/hp/maxMana/
 * attackSpeed) are plain additive integers in computeDerivedStats — round to a whole number.
 * "percent" stats (critChance/evasion/damageReduction/movementSpeed) are 0-1 fractions used
 * directly as probabilities/multipliers — show as a whole-number percentage. critDamage is a
 * multiplier starting at 1.5 in DerivedStats, but an individual ITEM's raw contribution is a
 * small bonus added to that base, so showing it as "+X%" (of extra crit damage) is the correct
 * per-item interpretation — do not confuse with DerivedStats.critDamage itself.
 */
export const STAT_FORMAT: Record<StatKey, "flat" | "percent"> = {
  attack: "flat",
  defense: "flat",
  hp: "flat",
  maxMana: "flat",
  attackSpeed: "flat",
  critChance: "percent",
  critDamage: "percent",
  evasion: "percent",
  damageReduction: "percent",
  movementSpeed: "percent",
};

/** Formats a single stat value as a whole number, in Polish, sign-prefixed for item bonuses. */
export function formatStatValue(stat: StatKey, value: number): string {
  if (STAT_FORMAT[stat] === "percent") {
    const pct = Math.round(value * 100);
    return `${pct >= 0 ? "+" : ""}${pct}%`;
  }
  const flat = Math.round(value);
  return `${flat >= 0 ? "+" : ""}${flat}`;
}

/** Short inline hint for admin stat-value inputs — explains the raw number format (a "percent"
 * stat is stored/edited as a 0-1 fraction, not a whole percentage) right where it's entered,
 * since the same StatKey editor is reused for very different-looking numbers (attack: 12,
 * critChance: 0.02). */
export function statHint(stat: StatKey): string {
  return STAT_FORMAT[stat] === "percent" ? "ułamek 0–1, np. 0.02 = 2%" : "liczba całkowita";
}

/** CombatStatsDto (the character's final derived stats) uses slightly different key names than
 * StatKey ("maxHp" not "hp", "movementSpeedPct" not "movementSpeed") — map each to its StatKey
 * so the "Postać" tab's breakdown table can reuse STAT_LABELS/STAT_FORMAT instead of duplicating
 * them under a second set of keys. */
export const COMBAT_STAT_TO_STAT_KEY = {
  maxHp: "hp",
  maxMana: "maxMana",
  attack: "attack",
  defense: "defense",
  attackSpeed: "attackSpeed",
  critChance: "critChance",
  critDamage: "critDamage",
  evasion: "evasion",
  damageReduction: "damageReduction",
  movementSpeedPct: "movementSpeed",
} as const satisfies Record<string, StatKey>;

/** Formats a raw base/equipment/passive/total value from the stat breakdown — unlike
 * formatStatValue (always sign-prefixed, for item tooltips), zero values print as "0"/"0%"
 * without a "+" so a stat with no equipment contribution doesn't look like a typo. */
export function formatBreakdownValue(combatStatKey: keyof typeof COMBAT_STAT_TO_STAT_KEY, value: number): string {
  const statKey = COMBAT_STAT_TO_STAT_KEY[combatStatKey];
  if (STAT_FORMAT[statKey] === "percent") {
    const pct = Math.round(value * 100);
    return pct > 0 ? `+${pct}%` : `${pct}%`;
  }
  const flat = Math.round(value);
  return flat > 0 ? `+${flat}` : `${flat}`;
}

export const TYPE_LABELS: Record<string, string> = {
  weapon: "Broń",
  armor: "Zbroja",
  helmet: "Hełm",
  boots: "Buty",
  shield: "Tarcza",
  necklace: "Naszyjnik",
  earrings: "Kolczyki",
  ring: "Pierścień",
  consumable: "Konsumpcyjny",
  material: "Materiał",
  quest: "Zadaniowy",
  chest: "Skrzynia",
  rod: "Wędka",
  pickaxe: "Kilof",
  bait: "Przynęta",
  book: "Książka",
  catalyst: "Ulepszacz",
};
