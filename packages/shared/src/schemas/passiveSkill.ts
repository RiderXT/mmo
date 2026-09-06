import { z } from "zod";
import { GatherKindSchema, StatKeySchema, CoreStatKeySchema } from "./enums.js";

// Per-level override of booksRequiredPerLevel below — no entry for a level falls back to that
// flat default. Mirrors ClassSkillBookRequirementInputSchema in characterClass.ts.
export const PassiveSkillBookRequirementInputSchema = z.object({
  level: z.number().int().min(1).max(1000),
  booksRequired: z.number().int().min(1).max(100),
});
export type PassiveSkillBookRequirementInput = z.infer<typeof PassiveSkillBookRequirementInputSchema>;

export const CreatePassiveSkillTypeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(2000).optional().default(""),
  maxLevel: z.number().int().min(1).max(1000).default(100),
  // null = no mechanical effect (yet) — a purely collectible/future-proofed skill.
  gatherKind: GatherKindSchema.nullable().optional(),
  chanceBonusPerLevel: z.number().min(0).max(1).default(0),
  speedBonusPerLevel: z.number().min(0).max(1).default(0),
  // XP-driven leveling — only meaningful when gatherKind is set. See PassiveSkillType comments.
  xpPerLevel: z.number().int().min(1).max(1_000_000).default(100),
  xpPerGatherAction: z.number().int().min(1).max(100_000).default(1),
  // null = no book gate, pure XP leveling.
  bookGateFromLevel: z.number().int().min(1).max(1000).nullable().optional(),
  booksRequiredPerLevel: z.number().int().min(1).max(100).default(1),
  bookRequirements: z.array(PassiveSkillBookRequirementInputSchema).default([]),
  // Combat-flavored skills only (meaningful when gatherKind is null) — mirrors ClassSkill's
  // targetStat/scalingStat/scalingFactor trio, e.g. for a book-only "Walka w grupie" skill applied
  // only inside Lobby fights (see modules/lobbies, lobbyCombat.ts). Inert for gathering skills.
  targetStat: StatKeySchema.nullable().optional(),
  scalingStat: CoreStatKeySchema.nullable().optional(),
  scalingFactor: z.number().min(0).max(100).default(0),
  magnitudePctPerLevel: z.number().min(0).max(5).default(0),
})
  .refine(
    (s) => {
      const levels = s.bookRequirements.map((r) => r.level);
      return new Set(levels).size === levels.length;
    },
    { message: "Wymagania książek mają zduplikowany poziom", path: ["bookRequirements"] },
  )
  .refine((s) => s.gatherKind == null || s.targetStat == null, {
    message: "Umiejętność zbieracka nie może mieć docelowego statu bojowego",
    path: ["targetStat"],
  });
export type CreatePassiveSkillTypeInput = z.infer<typeof CreatePassiveSkillTypeSchema>;
export const UpdatePassiveSkillTypeSchema = CreatePassiveSkillTypeSchema;
export type UpdatePassiveSkillTypeInput = z.infer<typeof UpdatePassiveSkillTypeSchema>;

// Player-facing view: the skill type's definition plus this character's current level/XP progress.
export const PassiveSkillDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  maxLevel: z.number().int(),
  gatherKind: GatherKindSchema.nullable(),
  chanceBonusPerLevel: z.number(),
  speedBonusPerLevel: z.number(),
  level: z.number().int(),
  xpPerLevel: z.number().int(),
  xp: z.number().int(),
  bookGateFromLevel: z.number().int().nullable(),
  booksRequiredPerLevel: z.number().int(),
  bookRequirements: z.array(z.object({ level: z.number().int(), booksRequired: z.number().int() })),
  pendingBooksRead: z.number().int(),
  bookChanceBonus: z.number(),
  bookSpeedBonus: z.number(),
  targetStat: StatKeySchema.nullable(),
  scalingStat: CoreStatKeySchema.nullable(),
  scalingFactor: z.number(),
  magnitudePctPerLevel: z.number(),
  bookCombatMagnitudePct: z.number(),
});
export type PassiveSkillDto = z.infer<typeof PassiveSkillDtoSchema>;

export const ReadBookSchema = z.object({
  inventoryItemId: z.string(),
});
export type ReadBookInput = z.infer<typeof ReadBookSchema>;
