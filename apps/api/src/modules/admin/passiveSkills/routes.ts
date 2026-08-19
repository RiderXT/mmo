import type { FastifyInstance } from "fastify";
import { CreatePassiveSkillTypeSchema, UpdatePassiveSkillTypeSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import {
  listPassiveSkillTypes,
  getPassiveSkillType,
  createPassiveSkillType,
  updatePassiveSkillType,
  deletePassiveSkillType,
  PassiveSkillTypeError,
} from "./service.js";

export async function adminPassiveSkillsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin", "moderator") }, async (_request, reply) => {
    return reply.send(await listPassiveSkillTypes());
  });

  app.get("/:id", { preHandler: requireRole("admin", "moderator") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const skillType = await getPassiveSkillType(id);
    if (!skillType) return reply.code(404).send({ error: "Nie znaleziono umiejętności" });
    return reply.send(skillType);
  });

  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = CreatePassiveSkillTypeSchema.parse(request.body);
    try {
      const skillType = await createPassiveSkillType(input, request.user!.sub, request.id);
      return reply.code(201).send(skillType);
    } catch (err) {
      if (err instanceof PassiveSkillTypeError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdatePassiveSkillTypeSchema.parse(request.body);
    try {
      const skillType = await updatePassiveSkillType(id, input, request.user!.sub, request.id);
      return reply.send(skillType);
    } catch (err) {
      if (err instanceof PassiveSkillTypeError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deletePassiveSkillType(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof PassiveSkillTypeError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
