import { z } from "zod";
import { RoleSchema } from "./enums.js";

export const EmailSchema = z.string().trim().toLowerCase().email().max(254);

export const PasswordSchema = z
  .string()
  .min(10, "Hasło musi mieć min. 10 znaków")
  .max(128)
  .regex(/[a-z]/, "Hasło musi zawierać małą literę")
  .regex(/[A-Z]/, "Hasło musi zawierać wielką literę")
  .regex(/[0-9]/, "Hasło musi zawierać cyfrę");

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  // Redeems another account's referralCode, see lib/referralRewards.ts. Silently ignored (no
  // error) if unknown or self-referential, so a typo never blocks registration.
  referralCode: z.string().trim().min(1).max(64).optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: RoleSchema,
  createdAt: z.string(),
  // Set when account deletion is pending (GDPR-style, 30-day grace period) — frontend shows a
  // blocking "cancel deletion" screen instead of the game while this is non-null.
  deletionRequestedAt: z.string().nullable().optional(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthResponseSchema = z.object({
  user: AuthUserSchema,
  accessToken: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
