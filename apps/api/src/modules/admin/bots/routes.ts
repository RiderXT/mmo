import type { FastifyInstance } from "fastify";
import { LaunchBotsSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import { launchBots, listBotRuns, getBotLog, stopBot, BotError } from "./service.js";

export async function botsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/launch", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = LaunchBotsSchema.parse(request.body);
    try {
      const launched = await launchBots(input, request.user!.sub, request.id);
      return reply.code(201).send(launched);
    } catch (err) {
      if (err instanceof BotError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send(listBotRuns());
  });

  app.get("/:id/log", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(getBotLog(id));
    } catch (err) {
      if (err instanceof BotError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:id/stop", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      stopBot(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof BotError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
