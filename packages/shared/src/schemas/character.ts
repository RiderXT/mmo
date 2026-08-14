import { z } from "zod";
import { CoreStatKeySchema } from "./enums.js";

export const CreateCharacterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Nazwa musi mieć min. 3 znaki")
    .max(20, "Nazwa musi mieć maks. 20 znaków")
    .regex(/^[a-zA-Z0-9_]+$/, "Dozwolone: litery, cyfry, podkreślenie"),
  classId: z.string().min(1, "Wybierz klasę postaci"),
});
export type CreateCharacterInput = z.infer<typeof CreateCharacterSchema>;

export const CharacterSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  level: z.number().int(),
  exp: z.number().int(),
  gold: z.number().int(),
  classId: z.string().nullable(),
  strength: z.number().int(),
  vitality: z.number().int(),
  dexterity: z.number().int(),
  intelligence: z.number().int(),
  unspentStatPoints: z.number().int(),
  unspentSkillPoints: z.number().int(),
  currentZoneId: z.string().nullable(),
  activeExpeditionId: z.string().nullable(),
  createdAt: z.string(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const AllocateStatSchema = z.object({ stat: CoreStatKeySchema });
export type AllocateStatInput = z.infer<typeof AllocateStatSchema>;

export const AllocateSkillSchema = z.object({ classSkillId: z.string() });
export type AllocateSkillInput = z.infer<typeof AllocateSkillSchema>;
