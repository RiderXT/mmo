import { prisma } from "../../lib/prismaClient.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signAccessToken } from "../../lib/jwt.js";
import { issueRefreshToken, rotateRefreshToken, revokeRefreshToken } from "../../lib/refreshToken.js";
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

function toAuthUser(user: { id: string; email: string; role: string; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    role: user.role as "player" | "moderator" | "admin",
    createdAt: user.createdAt.toISOString(),
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

  await logAction({
    module: "auth",
    action: "register",
    actorUserId: user.id,
    requestId,
    payload: { email: user.email },
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
