import type { FastifyInstance } from "fastify";
import { BuyFromNpcSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import { buyFromNpc, listNpcsForZone, NpcShopError } from "./service.js";

export async function npcShopRoutes(app: FastifyInstance): Promise<void> {
  app.get("/zone/:zoneId", { preHandler: requireAuth }, async (request, reply) => {
    const { zoneId } = request.params as { zoneId: string };
    return reply.send(await listNpcsForZone(zoneId));
  });

  app.post("/:characterId/buy", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    const body = BuyFromNpcSchema.parse(request.body);
    try {
      const result = await buyFromNpc(characterId, body, request.user!.sub, request.id);
      return reply.send(result);
    } catch (err) {
      if (err instanceof NpcShopError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
