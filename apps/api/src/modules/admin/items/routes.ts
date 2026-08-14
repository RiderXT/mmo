import type { FastifyInstance } from "fastify";
import { CreateItemSchema, UpdateItemSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import { listItems, getItem, createItem, updateItem, deleteItem, ItemError } from "./service.js";

export async function itemsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin", "moderator") }, async (_request, reply) => {
    return reply.send(await listItems());
  });

  app.get("/:id", { preHandler: requireRole("admin", "moderator") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getItem(id);
    if (!item) return reply.code(404).send({ error: "Nie znaleziono itemu" });
    return reply.send(item);
  });

  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = CreateItemSchema.parse(request.body);
    try {
      const item = await createItem(input, request.user!.sub, request.id);
      return reply.code(201).send(item);
    } catch (err) {
      if (err instanceof ItemError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateItemSchema.parse(request.body);
    try {
      const item = await updateItem(id, input, request.user!.sub, request.id);
      return reply.send(item);
    } catch (err) {
      if (err instanceof ItemError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteItem(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof ItemError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
