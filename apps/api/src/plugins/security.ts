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
    // Loopback only — real player traffic always arrives via nginx, which forwards the real
    // client IP (X-Forwarded-For, honored via trustProxy: true in app.ts), so this never exempts
    // actual internet traffic. The only thing that legitimately calls the API directly at
    // 127.0.0.1 is same-machine tooling: admin-launched bots (see modules/admin/bots), which
    // each register a fresh throwaway account and would otherwise trip the stricter per-route
    // /api/auth/register limit (10 per 10min) after just a couple of launches.
    allowList: ["127.0.0.1", "::1"],
  });
}
