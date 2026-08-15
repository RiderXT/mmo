import type { FastifyInstance } from "fastify";
import { requireRole } from "../../../lib/authGuard.js";
import { computeBalanceStats } from "./service.js";

export async function balanceStatsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send(await computeBalanceStats());
  });
}
