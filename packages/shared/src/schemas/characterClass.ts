import { z } from "zod";
import { CoreStatKeySchema, SkillKindSchema, SkillEffectTypeSchema, StatKeySchema } from "./enums.js";

// A single, freely-orderable upgrade unlockable within a ClassSkill's tree — no prerequisites
// between nodes, the player picks which to unlock first. magnitudePct is a percentage modifier:
// +X% power for "magnitude", or -X% cost/cooldown for "cost"/"cooldown" (sign applied in code).
export const SkillTreeNodeInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().default(""),
  effect: z.enum(["magnitude", "cost", "cooldown"]),
  magnitudePct: z.number().min(0).max(5),
  pointCost: z.number().int().min(1).max(50).default(1),
});
export type SkillTreeNodeInput = z.infer<typeof SkillTreeNodeInputSchema>;

export const ClassSkillInputSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(500).optional().default(""),
    kind: SkillKindSchema,
    scalingStat: CoreStatKeySchema,
    scalingFactor: z.number().min(0).max(100).default(1),
    // Skill points needed to unlock the skill's fixed base effect once. All further growth
    // comes from tree nodes, not levels.
    unlockCost: z.number().int().min(0).max(50).default(1),
    // passive only
    targetStat: StatKeySchema.optional(),
    // active only
    effectType: SkillEffectTypeSchema.optional(),
    cooldownSeconds: z.number().int().min(1).max(3600).optional(),
    baseManaCost: z.number().int().min(0).max(1000).optional(),
    nodes: z.array(SkillTreeNodeInputSchema).default([]),
  })
  .refine((s) => s.kind !== "passive" || !!s.targetStat, {
    message: "Umiejętność pasywna musi mieć wybrany docelowy staty",
    path: ["targetStat"],
  })
  .refine((s) => s.kind !== "active" || (!!s.effectType && !!s.cooldownSeconds), {
    message: "Umiejętność aktywna musi mieć typ efektu i cooldown",
    path: ["effectType"],
  })
  .refine((s) => s.kind === "active" || s.nodes.every((n) => n.effect === "magnitude"), {
    message: "Węzły typu 'koszt many'/'odnowienie' dostępne tylko dla umiejętności aktywnych",
    path: ["nodes"],
  });
export type ClassSkillInput = z.infer<typeof ClassSkillInputSchema>;

// Granted once, automatically, when a character of this class is created.
export const ClassStarterItemInputSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().min(1).max(999),
});
export type ClassStarterItemInput = z.infer<typeof ClassStarterItemInputSchema>;

export const CreateCharacterClassSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(2000).optional().default(""),
  primaryStat: CoreStatKeySchema,
  skills: z.array(ClassSkillInputSchema).default([]),
  startingGold: z.number().int().min(0).max(999999).default(0),
  starterItems: z.array(ClassStarterItemInputSchema).default([]),
});
export type CreateCharacterClassInput = z.infer<typeof CreateCharacterClassSchema>;

export const UpdateCharacterClassSchema = CreateCharacterClassSchema;
export type UpdateCharacterClassInput = z.infer<typeof UpdateCharacterClassSchema>;
