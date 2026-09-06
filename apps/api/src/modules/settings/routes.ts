import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../lib/authGuard.js";
import { GatheringSettingsSchema, ReferralSettingsSchema, LobbySettingsSchema, RegenSettingsSchema } from "@mmo/shared";
import {
  getExpeditionDurationMinutes,
  setExpeditionDurationMinutes,
  getGatheringSettings,
  setGatheringSettings,
  getReferralSettings,
  setReferralSettings,
  getBotsMaxConcurrent,
  setBotsMaxConcurrent,
  getLobbySettings,
  setLobbySettings,
  getRegenSettings,
  setRegenSettings,
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

  // Public — players need maxMembers to size the lobby UI (and could infer the bonus tiers from
  // combat results anyway, so no reason to admin-gate reading them).
  app.get("/lobby-settings", { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(await getLobbySettings());
  });
  // No public regen-settings route — unlike lobby/gathering settings, players never need the
  // admin-configured BASE rate directly; their own effective regen already surfaces through
  // combat-stats/breakdown (hpRegenPct/manaRegenPct etc.), a different endpoint.
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

  app.get("/lobby-settings", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send(await getLobbySettings());
  });

  app.put("/lobby-settings", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = LobbySettingsSchema.parse(request.body);
    const saved = await setLobbySettings(input, request.user!.sub, request.id);
    return reply.send(saved);
  });

  app.get("/regen-settings", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send(await getRegenSettings());
  });

  app.put("/regen-settings", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = RegenSettingsSchema.parse(request.body);
    const saved = await setRegenSettings(input, request.user!.sub, request.id);
    return reply.send(saved);
  });
}
