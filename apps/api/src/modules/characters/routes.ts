import type { FastifyInstance } from "fastify";
import { CreateCharacterSchema, AllocateStatSchema, UnlockSkillSchema, UnlockNodeSchema, ReadSkillBookSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import { getCharacterCombatStats, getCharacterCombatStatsBreakdown, ExpeditionError } from "../expeditions/service.js";
import {
  listCharacters,
  getCharacter,
  getCharacterSkills,
  getCharacterSkillNodes,
  createCharacter,
  allocateStat,
  unlockSkill,
  unlockNode,
  readSkillBook,
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

  app.get("/:id/combat-stats", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await getCharacterCombatStats(id, request.user!.sub));
    } catch (err) {
      if (err instanceof ExpeditionError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/:id/combat-stats/breakdown", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await getCharacterCombatStatsBreakdown(id, request.user!.sub));
    } catch (err) {
      if (err instanceof ExpeditionError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
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

  app.get("/:id/skill-nodes", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await getCharacterSkillNodes(id, request.user!.sub));
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

  app.post("/:id/unlock-skill", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { classSkillId } = UnlockSkillSchema.parse(request.body);
    try {
      const characterSkill = await unlockSkill(id, request.user!.sub, classSkillId, request.id);
      return reply.send(characterSkill);
    } catch (err) {
      if (err instanceof CharacterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:id/unlock-node", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { nodeId } = UnlockNodeSchema.parse(request.body);
    try {
      const characterSkillNode = await unlockNode(id, request.user!.sub, nodeId, request.id);
      return reply.send(characterSkillNode);
    } catch (err) {
      if (err instanceof CharacterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:id/read-skill-book", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { inventoryItemId } = ReadSkillBookSchema.parse(request.body);
    try {
      const result = await readSkillBook({ characterId: id, inventoryItemId }, request.user!.sub, request.id);
      return reply.send(result);
    } catch (err) {
      if (err instanceof CharacterError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
