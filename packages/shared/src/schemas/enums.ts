import { z } from "zod";

export const RoleSchema = z.enum(["player", "moderator", "admin"]);
export type Role = z.infer<typeof RoleSchema>;

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevelSchema>;

// Item type maps 1:1 onto an equip slot (except consumable/material/quest/bait, which aren't equippable).
export const ItemTypeSchema = z.enum([
  "weapon",
  "armor",
  "helmet",
  "boots",
  "shield",
  "necklace",
  "earrings",
  "ring",
  "consumable",
  "material",
  "quest",
  "chest",
  "rod", // wędka — see modules/gathering
  "pickaxe", // kilof — see modules/gathering
  "bait", // przynęta/eliksir — carried in an active slot, not consumed, see modules/gathering
  "catalyst", // ulepszacz kowadła — opcjonalny bonus do szansy powodzenia, see modules/inventory upgradeItem
  "book", // książka umiejętności — consumed on a successful/failed read, see modules/passiveSkills
]);
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const EquipSlotSchema = z.enum([
  "weapon",
  "armor",
  "helmet",
  "boots",
  "shield",
  "necklace",
  "earrings",
  "ring",
  "rod",
  "pickaxe",
]);
export type EquipSlot = z.infer<typeof EquipSlotSchema>;

export const GatherKindSchema = z.enum(["fishing", "mining"]);
export type GatherKind = z.infer<typeof GatherKindSchema>;

export const GatherPhaseSchema = z.enum(["catching", "extracting", "searching"]);
export type GatherPhase = z.infer<typeof GatherPhaseSchema>;

export const ExpeditionStatusSchema = z.enum(["in_progress", "completed", "claimed", "flagged"]);
export type ExpeditionStatus = z.infer<typeof ExpeditionStatusSchema>;

// Combat/equipment stats — base stats, item bonuses, and passive skill bonuses all add into these.
export const StatKeySchema = z.enum([
  "attack",
  "defense",
  "hp",
  "maxMana",
  "critChance",
  "critDamage",
  "attackSpeed",
  "evasion",
  "damageReduction",
  // Out-of-combat only: shortens travel time to/from a zone. Equipment/passive-skill only, no
  // core-stat baseline (unlike attackSpeed) — see computeDerivedStats in combat.ts.
  "movementSpeed",
]);
export type StatKey = z.infer<typeof StatKeySchema>;

export const StatBlockSchema = z.record(StatKeySchema, z.number());
export type StatBlock = z.infer<typeof StatBlockSchema>;

// The 4 allocatable character resources classes are built around.
export const CoreStatKeySchema = z.enum(["strength", "vitality", "dexterity", "intelligence"]);
export type CoreStatKey = z.infer<typeof CoreStatKeySchema>;

export const SkillKindSchema = z.enum(["passive", "active"]);
export type SkillKind = z.infer<typeof SkillKindSchema>;

export const SkillEffectTypeSchema = z.enum(["damage", "heal"]);
export type SkillEffectType = z.infer<typeof SkillEffectTypeSchema>;

// Groups ClassSkill entries into player-facing skill-tree tabs (see SkillsPanel.tsx).
export const SkillCategorySchema = z.enum(["combat", "survival", "tactics"]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

// "on_use" is consumed immediately on player action (see ItemContextMenu "Użyj"/inventory
// useBuffItem), not during simulated combat like the other triggers — no threshold/interval.
export const PotionTriggerSchema = z.enum(["hp_below", "mana_below", "interval", "on_use"]);
export type PotionTrigger = z.infer<typeof PotionTriggerSchema>;

export const PotionEffectSchema = z.enum([
  "restore_hp",
  "restore_mana",
  "buff_attack_speed",
  "buff_attack",
  "buff_defense",
  // Personal, time-limited multipliers applied on top of any active event multiplier — see
  // lib/personalBuffs.ts. magnitudePct/durationSeconds (already on PotionConfigSchema) drive both.
  "buff_exp",
  "buff_gold",
  "buff_drop",
]);
export type PotionEffect = z.infer<typeof PotionEffectSchema>;
