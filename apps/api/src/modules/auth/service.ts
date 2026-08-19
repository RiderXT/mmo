import { prisma } from "../../lib/prismaClient.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signAccessToken } from "../../lib/jwt.js";
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
} from "../../lib/refreshToken.js";
import { logAction } from "../../lib/gameLog.js";
import type { RegisterInput, LoginInput, Role } from "@mmo/shared";

export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** Lazily performs the actual hard delete once a pending account-deletion request is more than 30
 * days old — mirrors this project's other lazy-resolve idioms (resolveTravelArrival,
 * resolveGatherSession) rather than requiring a cron job. Called from loginUser/refreshSession,
 * both of which are natural "the account was just touched" checkpoints. Returns true if the
 * account was deleted (caller must abort with an error in that case). */
async function purgeIfDeletionDue(user: { id: string; deletionRequestedAt: Date | null }): Promise<boolean> {
  if (!user.deletionRequestedAt) return false;
  if (Date.now() - user.deletionRequestedAt.getTime() < DELETION_GRACE_PERIOD_MS) return false;

  await prisma.user.delete({ where: { id: user.id } });
  await logAction({ module: "auth", action: "account_purged", payload: { userId: user.id } });
  return true;
}

function toAuthUser(user: { id: string; email: string; role: string; createdAt: Date; deletionRequestedAt?: Date | null }) {
  return {
    id: user.id,
    email: user.email,
    role: user.role as "player" | "moderator" | "admin",
    createdAt: user.createdAt.toISOString(),
    deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
  };
}

export async function registerUser(input: RegisterInput, requestId?: string) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AuthError("Konto z tym adresem e-mail już istnieje", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash },
  });

  // Redeem a referral code, if one was supplied. Unknown/self-referential codes are silently
  // ignored (no error) so a typo never blocks registration — see lib/referralRewards.ts for the
  // actual reward payout, which happens later (first character creation / level-up), not here.
  if (input.referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode: input.referralCode } });
    if (referrer && referrer.id !== user.id) {
      await prisma.referral.create({ data: { referrerId: referrer.id, referredId: user.id } });
    }
  }

  await logAction({
    module: "auth",
    action: "register",
    actorUserId: user.id,
    requestId,
    payload: { email: user.email, referralCode: input.referralCode ?? null },
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role as Role });
  const { token: refreshToken } = await issueRefreshToken(user.id);

  return { user: toAuthUser(user), accessToken, refreshToken };
}

export async function loginUser(input: LoginInput, requestId?: string) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  const passwordValid = user ? await verifyPassword(user.passwordHash, input.password) : false;

  if (!user || !passwordValid) {
    await logAction({
      module: "auth",
      action: "login_failed",
      level: "warn",
      requestId,
      payload: { email: input.email },
    });
    throw new AuthError("Nieprawidłowy e-mail lub hasło", 401);
  }

  if (await purgeIfDeletionDue(user)) {
    throw new AuthError("To konto zostało usunięte", 401);
  }

  await logAction({
    module: "auth",
    action: "login",
    actorUserId: user.id,
    requestId,
    payload: {},
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role as Role });
  const { token: refreshToken } = await issueRefreshToken(user.id);

  return { user: toAuthUser(user), accessToken, refreshToken };
}

export async function refreshSession(presentedToken: string, requestId?: string) {
  const rotated = await rotateRefreshToken(presentedToken);
  if (!rotated) {
    throw new AuthError("Sesja wygasła, zaloguj się ponownie", 401);
  }

  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user) {
    throw new AuthError("Sesja wygasła, zaloguj się ponownie", 401);
  }

  if (await purgeIfDeletionDue(user)) {
    throw new AuthError("To konto zostało usunięte", 401);
  }

  await logAction({
    module: "auth",
    action: "refresh",
    actorUserId: user.id,
    requestId,
    payload: {},
  });

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role as Role });

  return { user: toAuthUser(user), accessToken, refreshToken: rotated.token };
}

export async function logoutUser(presentedToken: string, requestId?: string) {
  await revokeRefreshToken(presentedToken);
  await logAction({ module: "auth", action: "logout", requestId, payload: {} });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  requestId?: string,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new AuthError("Nieprawidłowe obecne hasło", 401);
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  // Every other session must re-authenticate with the new password — this session's own refresh
  // cookie gets reissued right after by the route handler, same as changePassword conventions
  // elsewhere (e.g. Google/GitHub account settings).
  await revokeAllRefreshTokensForUser(userId);

  await logAction({ module: "auth", action: "change_password", actorUserId: userId, requestId, payload: {} });
}

export async function requestAccountDeletion(userId: string, password: string, requestId?: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new AuthError("Nieprawidłowe hasło", 401);
  }

  await prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: new Date() } });
  await revokeAllRefreshTokensForUser(userId);

  await logAction({ module: "auth", action: "request_deletion", actorUserId: userId, requestId, payload: {} });
}

export async function cancelAccountDeletion(userId: string, requestId?: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: null } });
  await logAction({ module: "auth", action: "cancel_deletion", actorUserId: userId, requestId, payload: {} });
}
