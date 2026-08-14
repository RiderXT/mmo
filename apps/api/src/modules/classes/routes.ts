import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/authGuard.js";
import { listCharacterClasses, getCharacterClass } from "../admin/classes/service.js";

/** Read-only class catalogue for any authenticated player (class picker, skill list). Content management lives under /api/admin/classes. */
export async function publicClassesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(await listCharacterClasses());
  });

  app.get("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const characterClass = await getCharacterClass(id);
    if (!characterClass) return reply.code(404).send({ error: "Nie znaleziono klasy" });
    return reply.send(characterClass);
  });
}
