import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/authGuard.js";
import { listRanking } from "./service.js";

export async function rankingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireAuth }, async (request, reply) => {
    const { classId } = request.query as { classId?: string };
    return reply.send(await listRanking(classId || undefined));
  });
}
