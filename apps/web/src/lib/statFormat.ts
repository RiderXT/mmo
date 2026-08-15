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

export const TYPE_LABELS: Record<string, string> = {
  weapon: "Broń",
  armor: "Zbroja",
  helmet: "Hełm",
  boots: "Buty",
  necklace: "Naszyjnik",
  earrings: "Kolczyki",
  ring: "Pierścień",
  consumable: "Konsumpcyjny",
  material: "Materiał",
  quest: "Zadaniowy",
  chest: "Skrzynia",
};
