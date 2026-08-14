import { z } from "zod";
import { StatBlockSchema } from "./enums.js";

export const MonsterSkillSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional().default(""),
  power: z.number().min(0).max(1000).optional().default(0),
});
export type MonsterSkill = z.infer<typeof MonsterSkillSchema>;

export const MonsterDropInputSchema = z.object({
  itemId: z.string(),
  dropChance: z.number().min(0).max(1),
  minQty: z.number().int().min(1).max(999),
  maxQty: z.number().int().min(1).max(999),
});
export type MonsterDropInput = z.infer<typeof MonsterDropInputSchema>;

export const CreateMonsterSchema = z.object({
  name: z.string().trim().min(2).max(60),
  level: z.number().int().min(1).max(999),
  hp: z.number().int().min(1).max(10_000_000),
  stats: StatBlockSchema.default({}),
  skills: z.array(MonsterSkillSchema).default([]),
  expReward: z.number().int().min(0).max(1_000_000),
  goldReward: z.number().int().min(0).max(1_000_000).default(0),
  drops: z.array(MonsterDropInputSchema).default([]),
});
export type CreateMonsterInput = z.infer<typeof CreateMonsterSchema>;

export const UpdateMonsterSchema = CreateMonsterSchema;
export type UpdateMonsterInput = z.infer<typeof UpdateMonsterSchema>;
