import type { FastifyInstance } from "fastify";
import { StartExpeditionSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import {
  startExpedition,
  getActiveExpedition,
  claimExpedition,
  leaveExpedition,
  ExpeditionError,
} from "./service.js";

export async function expeditionsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/start", { preHandler: requireAuth }, async (request, reply) => {
    const input = StartExpeditionSchema.parse(request.body);
    try {
      const expedition = await startExpedition(input, request.user!.sub, request.id);
      return reply.code(201).send(expedition);
    } catch (err) {
      if (err instanceof ExpeditionError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/:characterId/active", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      const expedition = await getActiveExpedition(characterId, request.user!.sub);
      return reply.send(expedition);
    } catch (err) {
      if (err instanceof ExpeditionError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:id/claim", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const outcome = await claimExpedition(id, request.user!.sub, request.id);
      return reply.send(outcome);
    } catch (err) {
      if (err instanceof ExpeditionError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:id/leave", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const outcome = await leaveExpedition(id, request.user!.sub, request.id);
      return reply.send(outcome);
    } catch (err) {
      if (err instanceof ExpeditionError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
