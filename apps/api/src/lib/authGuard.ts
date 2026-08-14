import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@mmo/shared";
import { verifyAccessToken } from "./jwt.js";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return reply.code(401).send({ error: "Brak autoryzacji" });
  }

  try {
    request.user = verifyAccessToken(token);
  } catch {
    return reply.code(401).send({ error: "Nieprawidłowy lub wygasły token" });
  }
}

export function requireRole(...roles: Role[]) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAuth(request, reply);
    if (reply.sent) return;

    if (!request.user || !roles.includes(request.user.role)) {
      return reply.code(403).send({ error: "Brak uprawnień" });
    }
  };
}
