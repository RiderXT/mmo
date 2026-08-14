import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export async function registerSecurityPlugins(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
    hook: "onRequest",
  });

  await app.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: "1 minute",
  });
}
