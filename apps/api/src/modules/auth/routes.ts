import type { FastifyInstance } from "fastify";
import { RegisterSchema, LoginSchema, type AuthResponse } from "@mmo/shared";
import { registerUser, loginUser, refreshSession, logoutUser, AuthError } from "./service.js";
import { requireAuth } from "../../lib/authGuard.js";
import { prisma } from "../../lib/prismaClient.js";

const REFRESH_COOKIE = "refresh_token";
const isProd = process.env.NODE_ENV === "production";

function setRefreshCookie(reply: import("fastify").FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 60 * 60 * 24 * 30,
    signed: true,
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/register",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const input = RegisterSchema.parse(request.body);
      try {
        const { user, accessToken, refreshToken } = await registerUser(input, request.id);
        setRefreshCookie(reply, refreshToken);
        const body: AuthResponse = { user, accessToken };
        return reply.code(201).send(body);
      } catch (err) {
        if (err instanceof AuthError) return reply.code(err.statusCode).send({ error: err.message });
        throw err;
      }
    },
  );

  app.post(
    "/login",
    { config: { rateLimit: { max: 15, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const input = LoginSchema.parse(request.body);
      try {
        const { user, accessToken, refreshToken } = await loginUser(input, request.id);
        setRefreshCookie(reply, refreshToken);
        const body: AuthResponse = { user, accessToken };
        return reply.send(body);
      } catch (err) {
        if (err instanceof AuthError) return reply.code(err.statusCode).send({ error: err.message });
        throw err;
      }
    },
  );

  app.post("/refresh", async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    const unsigned = presented ? request.unsignCookie(presented) : null;

    if (!unsigned?.valid || !unsigned.value) {
      return reply.code(401).send({ error: "Brak ważnej sesji" });
    }

    try {
      const { user, accessToken, refreshToken } = await refreshSession(unsigned.value, request.id);
      setRefreshCookie(reply, refreshToken);
      const body: AuthResponse = { user, accessToken };
      return reply.send(body);
    } catch (err) {
      if (err instanceof AuthError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/logout", async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    const unsigned = presented ? request.unsignCookie(presented) : null;

    if (unsigned?.valid && unsigned.value) {
      await logoutUser(unsigned.value, request.id);
    }

    reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: requireAuth }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user!.sub } });
    if (!user) return reply.code(404).send({ error: "Nie znaleziono użytkownika" });
    return reply.send({
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    });
  });
}
