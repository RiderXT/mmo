import type { FastifyInstance } from "fastify";
import { AdminGrantSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import { listAllCharacters, grantToCharacter, AdminCharacterError } from "./service.js";

export async function adminCharactersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send(await listAllCharacters());
  });

  app.post("/:id/grant", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = AdminGrantSchema.parse(request.body);
    try {
      const result = await grantToCharacter(id, input, request.user!.sub, request.id);
      return reply.send(result);
    } catch (err) {
      if (err instanceof AdminCharacterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
