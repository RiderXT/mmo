import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/authGuard.js";
import { getDailyLoginStatus, claimDailyLoginReward, DailyLoginError } from "./service.js";

export async function dailyLoginRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:characterId", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      return reply.send(await getDailyLoginStatus(characterId, request.user!.sub));
    } catch (err) {
      if (err instanceof DailyLoginError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:characterId/claim", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      return reply.send(await claimDailyLoginReward(characterId, request.user!.sub, request.id));
    } catch (err) {
      if (err instanceof DailyLoginError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
