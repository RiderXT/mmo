import type { FastifyInstance } from "fastify";
import { requireRole } from "../../../lib/authGuard.js";
import { revertExpedition, resolveFlaggedExpedition, AdminExpeditionError } from "./service.js";

export async function adminExpeditionsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/:id/revert", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await revertExpedition(id, request.user!.sub, request.id);
      return reply.send(result);
    } catch (err) {
      if (err instanceof AdminExpeditionError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:id/resolve", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { grant } = (request.body ?? {}) as { grant?: boolean };
    try {
      const result = await resolveFlaggedExpedition(id, grant === true, request.user!.sub, request.id);
      return reply.send(result);
    } catch (err) {
      if (err instanceof AdminExpeditionError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
