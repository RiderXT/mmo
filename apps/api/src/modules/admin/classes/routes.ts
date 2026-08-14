import type { FastifyInstance } from "fastify";
import { CreateCharacterClassSchema, UpdateCharacterClassSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import {
  listCharacterClasses,
  getCharacterClass,
  createCharacterClass,
  updateCharacterClass,
  deleteCharacterClass,
  ClassError,
} from "./service.js";

export async function classesAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin", "moderator") }, async (_request, reply) => {
    return reply.send(await listCharacterClasses());
  });

  app.get("/:id", { preHandler: requireRole("admin", "moderator") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const characterClass = await getCharacterClass(id);
    if (!characterClass) return reply.code(404).send({ error: "Nie znaleziono klasy" });
    return reply.send(characterClass);
  });

  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = CreateCharacterClassSchema.parse(request.body);
    try {
      const characterClass = await createCharacterClass(input, request.user!.sub, request.id);
      return reply.code(201).send(characterClass);
    } catch (err) {
      if (err instanceof ClassError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateCharacterClassSchema.parse(request.body);
    try {
      const characterClass = await updateCharacterClass(id, input, request.user!.sub, request.id);
      return reply.send(characterClass);
    } catch (err) {
      if (err instanceof ClassError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteCharacterClass(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof ClassError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
