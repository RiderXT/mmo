import type {
  AccountSettingsDto,
  ChangePasswordInput,
  ReferralSettings,
  RequestDeletionInput,
  UpdateAccountSettingsInput,
} from "@mmo/shared";
import { apiFetch } from "./apiClient";

export const getAccountSettings = () => apiFetch<AccountSettingsDto>("/api/account");

export const updateAccountSettings = (input: UpdateAccountSettingsInput) =>
  apiFetch<void>("/api/account", { method: "PUT", body: JSON.stringify(input) });

export const changePassword = (input: ChangePasswordInput) =>
  apiFetch<void>("/api/auth/change-password", { method: "POST", body: JSON.stringify(input) });

export const requestAccountDeletion = (input: RequestDeletionInput) =>
  apiFetch<void>("/api/auth/request-deletion", { method: "POST", body: JSON.stringify(input) });

export const cancelAccountDeletion = () =>
  apiFetch<void>("/api/auth/cancel-deletion", { method: "POST" });

export const getReferralSettings = () => apiFetch<ReferralSettings>("/api/admin/settings/referral-settings");

export const setReferralSettings = (input: ReferralSettings) =>
  apiFetch<ReferralSettings>("/api/admin/settings/referral-settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
