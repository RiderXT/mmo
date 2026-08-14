import type { FastifyInstance } from "fastify";
import { CreateCharacterSchema, AllocateStatSchema, AllocateSkillSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import {
  listCharacters,
  getCharacter,
  getCharacterSkills,
  createCharacter,
  allocateStat,
  allocateSkill,
  CharacterError,
} from "./service.js";

export async function charactersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireAuth }, async (request, reply) => {
    return reply.send(await listCharacters(request.user!.sub));
  });

  app.get("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const character = await getCharacter(id, request.user!.sub);
    if (!character) return reply.code(404).send({ error: "Nie znaleziono postaci" });
    return reply.send(character);
  });

  app.get("/:id/skills", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await getCharacterSkills(id, request.user!.sub));
    } catch (err) {
      if (err instanceof CharacterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const input = CreateCharacterSchema.parse(request.body);
    try {
      const character = await createCharacter(input, request.user!.sub, request.id);
      return reply.code(201).send(character);
    } catch (err) {
      if (err instanceof CharacterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:id/allocate-stat", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { stat } = AllocateStatSchema.parse(request.body);
    try {
      const character = await allocateStat(id, request.user!.sub, stat, request.id);
      return reply.send(character);
    } catch (err) {
      if (err instanceof CharacterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:id/allocate-skill", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { classSkillId } = AllocateSkillSchema.parse(request.body);
    try {
      const characterSkill = await allocateSkill(id, request.user!.sub, classSkillId, request.id);
      return reply.send(characterSkill);
    } catch (err) {
      if (err instanceof CharacterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
