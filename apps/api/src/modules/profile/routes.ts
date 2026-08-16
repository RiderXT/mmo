import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/authGuard.js";
import { getCharacterProfile, ProfileError } from "./service.js";

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:characterId", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      return reply.send(await getCharacterProfile(characterId));
    } catch (err) {
      if (err instanceof ProfileError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
