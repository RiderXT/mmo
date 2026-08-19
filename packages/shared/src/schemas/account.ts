import { z } from "zod";
import { PasswordSchema } from "./auth.js";

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: PasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const UpdateAccountSettingsSchema = z.object({
  hideOnlineStatus: z.boolean(),
});
export type UpdateAccountSettingsInput = z.infer<typeof UpdateAccountSettingsSchema>;

export const RequestDeletionSchema = z.object({
  password: z.string().min(1).max(128),
});
export type RequestDeletionInput = z.infer<typeof RequestDeletionSchema>;

// Admin-configured payout rules for the referral system — see settings/service.ts's
// "referral.settings" key and lib/referralRewards.ts's tryPayReferralReward.
export const ReferralRewardKindSchema = z.enum(["none", "gold", "item"]);
export type ReferralRewardKind = z.infer<typeof ReferralRewardKindSchema>;

export const ReferralRewardTargetSchema = z.enum(["referrer", "referred", "both"]);
export type ReferralRewardTarget = z.infer<typeof ReferralRewardTargetSchema>;

export const ReferralSettingsSchema = z
  .object({
    rewardKind: ReferralRewardKindSchema.default("none"),
    goldAmount: z.number().int().min(0).max(999999).default(0),
    itemId: z.string().nullable().default(null),
    itemQuantity: z.number().int().min(1).max(9999).default(1),
    target: ReferralRewardTargetSchema.default("both"),
    // Referred character must reach this level before the reward is paid out. 1 = pay
    // immediately at registration.
    requiredLevel: z.number().int().min(1).max(999).default(1),
  })
  .refine((v) => v.rewardKind !== "item" || !!v.itemId, {
    message: "Wybierz przedmiot nagrody dla rodzaju 'item'",
    path: ["itemId"],
  });
export type ReferralSettings = z.infer<typeof ReferralSettingsSchema>;

export const AccountSettingsDtoSchema = z.object({
  referralCode: z.string(),
  hideOnlineStatus: z.boolean(),
  deletionRequestedAt: z.string().nullable(),
  referralCount: z.number().int(),
  referralRewardedCount: z.number().int(),
});
export type AccountSettingsDto = z.infer<typeof AccountSettingsDtoSchema>;
