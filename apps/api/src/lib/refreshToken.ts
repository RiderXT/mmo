import { createHash, randomBytes } from "node:crypto";
import ms from "ms";
import { env } from "../config/env.js";
import { prisma } from "./prismaClient.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(48).toString("base64url");
}

export async function issueRefreshToken(userId: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ms(env.JWT_REFRESH_TTL));
  const record = await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return { token, record };
}

export async function rotateRefreshToken(presentedToken: string) {
  const tokenHash = hashToken(presentedToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    return null;
  }

  const { token: newToken, record: newRecord } = await issueRefreshToken(existing.userId);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedBy: newRecord.id },
  });

  return { userId: existing.userId, token: newToken };
}

export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  const tokenHash = hashToken(presentedToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
