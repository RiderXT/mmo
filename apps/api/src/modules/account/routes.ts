import type { FastifyInstance } from "fastify";
import { UpdateAccountSettingsSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import { getAccountSettings, updateAccountSettings, AccountError } from "./service.js";

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireAuth }, async (request, reply) => {
    try {
      return reply.send(await getAccountSettings(request.user!.sub));
    } catch (err) {
      if (err instanceof AccountError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put("/", { preHandler: requireAuth }, async (request, reply) => {
    const body = UpdateAccountSettingsSchema.parse(request.body);
    await updateAccountSettings(request.user!.sub, body, request.id);
    return reply.code(204).send();
  });
}
