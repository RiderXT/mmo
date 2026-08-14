import { z } from "zod";
import { CoreStatKeySchema, SkillKindSchema, SkillEffectTypeSchema, StatKeySchema } from "./enums.js";

export const ClassSkillInputSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(500).optional().default(""),
    kind: SkillKindSchema,
    scalingStat: CoreStatKeySchema,
    scalingFactor: z.number().min(0).max(100).default(1),
    maxLevel: z.number().int().min(1).max(100).default(10),
    // passive only
    targetStat: StatKeySchema.optional(),
    // active only
    effectType: SkillEffectTypeSchema.optional(),
    cooldownSeconds: z.number().int().min(1).max(3600).optional(),
  })
  .refine((s) => s.kind !== "passive" || !!s.targetStat, {
    message: "Umiejętność pasywna musi mieć wybrany docelowy staty",
    path: ["targetStat"],
  })
  .refine((s) => s.kind !== "active" || (!!s.effectType && !!s.cooldownSeconds), {
    message: "Umiejętność aktywna musi mieć typ efektu i cooldown",
    path: ["effectType"],
  });
export type ClassSkillInput = z.infer<typeof ClassSkillInputSchema>;

export const CreateCharacterClassSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(2000).optional().default(""),
  primaryStat: CoreStatKeySchema,
  skills: z.array(ClassSkillInputSchema).default([]),
});
export type CreateCharacterClassInput = z.infer<typeof CreateCharacterClassSchema>;

export const UpdateCharacterClassSchema = CreateCharacterClassSchema;
export type UpdateCharacterClassInput = z.infer<typeof UpdateCharacterClassSchema>;
