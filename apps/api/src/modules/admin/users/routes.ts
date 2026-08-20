import type { FastifyInstance } from "fastify";
import { requireRole } from "../../../lib/authGuard.js";
import { listUsers, deleteUser, AdminUserError } from "./service.js";

export async function adminUsersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send(await listUsers());
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteUser(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof AdminUserError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
