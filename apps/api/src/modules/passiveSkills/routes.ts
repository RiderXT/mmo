import type { FastifyInstance } from "fastify";
import { ReadBookSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import { listPassiveSkillsForCharacter, readBook, PassiveSkillError } from "./service.js";

export async function passiveSkillsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:characterId", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      return reply.send(await listPassiveSkillsForCharacter(characterId, request.user!.sub));
    } catch (err) {
      if (err instanceof PassiveSkillError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:characterId/read-book", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    const input = ReadBookSchema.parse(request.body);
    try {
      const result = await readBook({ ...input, characterId }, request.user!.sub, request.id);
      return reply.send(result);
    } catch (err) {
      if (err instanceof PassiveSkillError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
