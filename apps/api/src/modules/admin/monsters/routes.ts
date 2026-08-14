import type { FastifyInstance } from "fastify";
import { CreateMonsterSchema, UpdateMonsterSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import {
  listMonsters,
  getMonster,
  createMonster,
  updateMonster,
  deleteMonster,
  MonsterError,
} from "./service.js";

export async function monstersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin", "moderator") }, async (_request, reply) => {
    return reply.send(await listMonsters());
  });

  app.get("/:id", { preHandler: requireRole("admin", "moderator") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const monster = await getMonster(id);
    if (!monster) return reply.code(404).send({ error: "Nie znaleziono potwora" });
    return reply.send(monster);
  });

  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = CreateMonsterSchema.parse(request.body);
    try {
      const monster = await createMonster(input, request.user!.sub, request.id);
      return reply.code(201).send(monster);
    } catch (err) {
      if (err instanceof MonsterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateMonsterSchema.parse(request.body);
    try {
      const monster = await updateMonster(id, input, request.user!.sub, request.id);
      return reply.send(monster);
    } catch (err) {
      if (err instanceof MonsterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteMonster(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof MonsterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
