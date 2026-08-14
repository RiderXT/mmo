import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../lib/authGuard.js";
import { getExpeditionDurationMinutes, setExpeditionDurationMinutes, SettingsError } from "./service.js";

const UpdateDurationSchema = z.object({ minutes: z.number().int() });

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Public (any authenticated user) — players need this to know how long an expedition takes.
  app.get("/expedition-duration", { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send({ minutes: await getExpeditionDurationMinutes() });
  });
}

export async function adminSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.put("/expedition-duration", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { minutes } = UpdateDurationSchema.parse(request.body);
    try {
      const saved = await setExpeditionDurationMinutes(minutes, request.user!.sub, request.id);
      return reply.send({ minutes: saved });
    } catch (err) {
      if (err instanceof SettingsError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
