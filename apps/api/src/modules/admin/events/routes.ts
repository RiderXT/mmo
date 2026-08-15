import type { FastifyInstance } from "fastify";
import { CreateGameEventSchema, UpdateGameEventSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import { listGameEvents, createGameEvent, updateGameEvent, deleteGameEvent, GameEventError } from "./service.js";

export async function eventsAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send(await listGameEvents());
  });

  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = CreateGameEventSchema.parse(request.body);
    const event = await createGameEvent(input, request.user!.sub, request.id);
    return reply.code(201).send(event);
  });

  app.put("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateGameEventSchema.parse(request.body);
    try {
      const event = await updateGameEvent(id, input, request.user!.sub, request.id);
      return reply.send(event);
    } catch (err) {
      if (err instanceof GameEventError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteGameEvent(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof GameEventError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
