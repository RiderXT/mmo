import { z } from "zod";
import { CoreStatKeySchema, SkillKindSchema, SkillEffectTypeSchema, StatKeySchema, SkillCategorySchema } from "./enums.js";

// An upgrade unlockable within a ClassSkill's own tree. magnitudePct is a PER-LEVEL percentage
// modifier: +X% power for "magnitude", or -X% cost/cooldown for "cost"/"cooldown" (sign applied
// in code). requiresNodeName references another node's name WITHIN THE SAME SKILL — null means
// it's a branch root, unlockable as soon as the parent skill itself is unlocked. Resolved to an
// id server-side (see admin/classes/service.ts), validated for cycles below.
export const SkillTreeNodeInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().default(""),
  effect: z.enum(["magnitude", "cost", "cooldown"]),
  magnitudePct: z.number().min(0).max(5),
  pointCost: z.number().int().min(1).max(50).default(1),
  maxLevel: z.number().int().min(1).max(20).default(1),
  requiresNodeName: z.string().trim().min(2).max(60).nullable().default(null),
});
export type SkillTreeNodeInput = z.infer<typeof SkillTreeNodeInputSchema>;

export const ClassSkillInputSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(500).optional().default(""),
    kind: SkillKindSchema,
    scalingStat: CoreStatKeySchema,
    scalingFactor: z.number().min(0).max(100).default(1),
    // Flat cost per level (same at every level, like SkillTreeNode.pointCost — not progressive).
    unlockCost: z.number().int().min(0).max(50).default(1),
    // maxLevel=1 (default) preserves the original one-shot "unlock" model exactly; raising it
    // lets the skill itself be leveled multiple times, each level beyond 1 adding
    // levelMagnitudePct to its own power on top of whatever tree nodes add.
    maxLevel: z.number().int().min(1).max(100).default(1),
    levelMagnitudePct: z.number().min(0).max(5).default(0),
    // passive only
    targetStat: StatKeySchema.optional(),
    // active only
    effectType: SkillEffectTypeSchema.optional(),
    cooldownSeconds: z.number().int().min(1).max(3600).optional(),
    baseManaCost: z.number().int().min(0).max(1000).optional(),
    // Only meaningful for buff-style effectType (attack_speed/defense/crit/block_chance/reflect)
    // — how long the self-buff lasts once activated. Falls back to a fixed default in combat.ts
    // when unset (e.g. skills created before this field existed).
    durationSeconds: z.number().int().min(1).max(3600).optional(),
    category: SkillCategorySchema.default("combat"),
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
  })
  .refine(
    (s) => {
      const byName = new Map(s.nodes.map((n) => [n.name, n]));
      for (const node of s.nodes) {
        if (!node.requiresNodeName) continue;
        if (node.requiresNodeName === node.name) return false;
        if (!byName.has(node.requiresNodeName)) return false;
        const seen = new Set([node.name]);
        let current = byName.get(node.requiresNodeName);
        while (current) {
          if (seen.has(current.name)) return false;
          seen.add(current.name);
          current = current.requiresNodeName ? byName.get(current.requiresNodeName) : undefined;
        }
      }
      return true;
    },
    {
      message: "Węzły mają nieprawidłową lub cykliczną zależność 'wymaga węzła'",
      path: ["nodes"],
    },
  );
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
