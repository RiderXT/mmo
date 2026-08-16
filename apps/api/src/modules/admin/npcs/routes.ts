import type { FastifyInstance } from "fastify";
import { CreateNpcSchema, UpdateNpcSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import { listNpcs, getNpc, createNpc, updateNpc, deleteNpc, NpcError } from "./service.js";

export async function npcsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin", "moderator") }, async (_request, reply) => {
    return reply.send(await listNpcs());
  });

  app.get("/:id", { preHandler: requireRole("admin", "moderator") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const npc = await getNpc(id);
    if (!npc) return reply.code(404).send({ error: "Nie znaleziono NPC" });
    return reply.send(npc);
  });

  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = CreateNpcSchema.parse(request.body);
    try {
      const npc = await createNpc(input, request.user!.sub, request.id);
      return reply.code(201).send(npc);
    } catch (err) {
      if (err instanceof NpcError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateNpcSchema.parse(request.body);
    try {
      const npc = await updateNpc(id, input, request.user!.sub, request.id);
      return reply.send(npc);
    } catch (err) {
      if (err instanceof NpcError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteNpc(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof NpcError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
