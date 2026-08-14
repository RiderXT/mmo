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
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const AuthResponseSchema = z.object({
  user: AuthUserSchema,
  accessToken: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
