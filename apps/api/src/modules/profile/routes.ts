import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/authGuard.js";
import { getCharacterProfile, ProfileError } from "./service.js";

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:name", { preHandler: requireAuth }, async (request, reply) => {
    const { name } = request.params as { name: string };
    try {
      return reply.send(await getCharacterProfile(name));
    } catch (err) {
      if (err instanceof ProfileError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
