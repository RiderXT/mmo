import type { FastifyInstance } from "fastify";
import { StartGatheringSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import { startGathering, getActiveGathering, stopGathering, GatheringError } from "./service.js";

export async function gatheringRoutes(app: FastifyInstance): Promise<void> {
  app.post("/start", { preHandler: requireAuth }, async (request, reply) => {
    const input = StartGatheringSchema.parse(request.body);
    try {
      const session = await startGathering(input, request.user!.sub, request.id);
      return reply.code(201).send(session);
    } catch (err) {
      if (err instanceof GatheringError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/:characterId/active", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      const session = await getActiveGathering(characterId, request.user!.sub);
      return reply.send(session);
    } catch (err) {
      if (err instanceof GatheringError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:characterId/stop", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      await stopGathering(characterId, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof GatheringError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
