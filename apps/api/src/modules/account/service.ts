import crypto from "node:crypto";
import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import type { AccountSettingsDto, UpdateAccountSettingsInput } from "@mmo/shared";

export class AccountError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

function generateReferralCode(): string {
  return crypto.randomBytes(5).toString("hex");
}

/** Existing accounts predate the referralCode column (added nullable to avoid a dev.db reset —
 * see prisma/schema.prisma) and get one lazily assigned here, on first access to Account
 * Settings, instead of via a backfill migration. */
async function ensureReferralCode(userId: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
      return updated.referralCode!;
    } catch {
      // Unique collision (astronomically unlikely at 10 hex chars) — retry with a fresh code.
    }
  }
  throw new AccountError("Nie udało się wygenerować kodu polecającego", 500);
}

export async function getAccountSettings(userId: string): Promise<AccountSettingsDto> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AccountError("Nie znaleziono konta", 404);

  const referralCode = await ensureReferralCode(userId, user.referralCode);
  const [referralCount, referralRewardedCount] = await Promise.all([
    prisma.referral.count({ where: { referrerId: userId } }),
    prisma.referral.count({ where: { referrerId: userId, rewardedAt: { not: null } } }),
  ]);

  return {
    referralCode,
    hideOnlineStatus: user.hideOnlineStatus,
    deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
    referralCount,
    referralRewardedCount,
  };
}

export async function updateAccountSettings(
  userId: string,
  input: UpdateAccountSettingsInput,
  requestId?: string,
): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { hideOnlineStatus: input.hideOnlineStatus } });

  await logAction({
    module: "account",
    action: "update_settings",
    actorUserId: userId,
    requestId,
    payload: input,
  });
}
