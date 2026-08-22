import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../lib/authGuard.js";
import { GatheringSettingsSchema, ReferralSettingsSchema } from "@mmo/shared";
import {
  getExpeditionDurationMinutes,
  setExpeditionDurationMinutes,
  getGatheringSettings,
  setGatheringSettings,
  getReferralSettings,
  setReferralSettings,
  getBotsMaxConcurrent,
  setBotsMaxConcurrent,
  SettingsError,
} from "./service.js";

const UpdateDurationSchema = z.object({ minutes: z.number().int() });
const UpdateBotsMaxConcurrentSchema = z.object({ count: z.number().int() });

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Public (any authenticated user) — players need this to know how long an expedition takes.
  app.get("/expedition-duration", { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send({ minutes: await getExpeditionDurationMinutes() });
  });

  // Public — players need the catch/mine time ranges to size the gathering countdown UI.
  app.get("/gathering-settings", { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(await getGatheringSettings());
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

  app.put("/gathering-settings", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = GatheringSettingsSchema.parse(request.body);
    const saved = await setGatheringSettings(input, request.user!.sub, request.id);
    return reply.send(saved);
  });

  app.get("/referral-settings", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send(await getReferralSettings());
  });

  app.put("/referral-settings", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = ReferralSettingsSchema.parse(request.body);
    const saved = await setReferralSettings(input, request.user!.sub, request.id);
    return reply.send(saved);
  });

  app.get("/bots-max-concurrent", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send({ count: await getBotsMaxConcurrent() });
  });

  app.put("/bots-max-concurrent", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { count } = UpdateBotsMaxConcurrentSchema.parse(request.body);
    try {
      const saved = await setBotsMaxConcurrent(count, request.user!.sub, request.id);
      return reply.send({ count: saved });
    } catch (err) {
      if (err instanceof SettingsError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
