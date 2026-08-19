import { z } from "zod";
import { GatherKindSchema } from "./enums.js";

export const CreatePassiveSkillTypeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(2000).optional().default(""),
  maxLevel: z.number().int().min(1).max(1000).default(100),
  // null = no mechanical effect (yet) — a purely collectible/future-proofed skill.
  gatherKind: GatherKindSchema.nullable().optional(),
  chanceBonusPerLevel: z.number().min(0).max(1).default(0),
  speedBonusPerLevel: z.number().min(0).max(1).default(0),
});
export type CreatePassiveSkillTypeInput = z.infer<typeof CreatePassiveSkillTypeSchema>;
export const UpdatePassiveSkillTypeSchema = CreatePassiveSkillTypeSchema;
export type UpdatePassiveSkillTypeInput = z.infer<typeof UpdatePassiveSkillTypeSchema>;

// Player-facing view: the skill type's definition plus this character's current level.
export const PassiveSkillDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  maxLevel: z.number().int(),
  gatherKind: GatherKindSchema.nullable(),
  chanceBonusPerLevel: z.number(),
  speedBonusPerLevel: z.number(),
  level: z.number().int(),
});
export type PassiveSkillDto = z.infer<typeof PassiveSkillDtoSchema>;

export const ReadBookSchema = z.object({
  inventoryItemId: z.string(),
});
export type ReadBookInput = z.infer<typeof ReadBookSchema>;
