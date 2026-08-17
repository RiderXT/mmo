import type { FastifyInstance } from "fastify";
import { CreateMineSchema, UpdateMineSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import { listMines, getMine, createMine, updateMine, deleteMine, MineError } from "./service.js";

export async function minesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin", "moderator") }, async (_request, reply) => {
    return reply.send(await listMines());
  });

  app.get("/:id", { preHandler: requireRole("admin", "moderator") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const mine = await getMine(id);
    if (!mine) return reply.code(404).send({ error: "Nie znaleziono kopalni" });
    return reply.send(mine);
  });

  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = CreateMineSchema.parse(request.body);
    try {
      const mine = await createMine(input, request.user!.sub, request.id);
      return reply.code(201).send(mine);
    } catch (err) {
      if (err instanceof MineError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateMineSchema.parse(request.body);
    try {
      const mine = await updateMine(id, input, request.user!.sub, request.id);
      return reply.send(mine);
    } catch (err) {
      if (err instanceof MineError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteMine(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof MineError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
