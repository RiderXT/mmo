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

// Admin testing tool — grant exp/gold/items directly to a character, bypassing expeditions.
export const AdminGrantItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().min(1).max(9999),
});
export const AdminGrantSchema = z.object({
  exp: z.number().int().min(0).max(1_000_000).optional(),
  gold: z.number().int().min(0).max(1_000_000).optional(),
  items: z.array(AdminGrantItemSchema).default([]),
});
export type AdminGrantInput = z.infer<typeof AdminGrantSchema>;

export interface AdminCharacterDto {
  id: string;
  name: string;
  level: number;
  exp: number;
  gold: number;
  classId: string | null;
  ownerEmail: string;
}
