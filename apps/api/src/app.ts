import path from "node:path";
import fs from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { isProd } from "./config/env.js";
import { APP_VERSION } from "./lib/appVersion.js";
import { registerSecurityPlugins } from "./plugins/security.js";
import { registerErrorHandler } from "./plugins/errorHandler.js";
import { serverLoadTracker, moduleForPath } from "./lib/serverLoad.js";
import { serverLoadRoutes } from "./modules/admin/serverLoad/routes.js";
import { botsRoutes } from "./modules/admin/bots/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { logsRoutes } from "./modules/logs/routes.js";
import { zonesRoutes } from "./modules/admin/zones/routes.js";
import { monstersRoutes } from "./modules/admin/monsters/routes.js";
import { itemsRoutes } from "./modules/admin/items/routes.js";
import { classesAdminRoutes } from "./modules/admin/classes/routes.js";
import { adminCharactersRoutes } from "./modules/admin/characters/routes.js";
import { balanceStatsRoutes } from "./modules/admin/balance/routes.js";
import { adminExpeditionsRoutes } from "./modules/admin/expeditions/routes.js";
import { eventsAdminRoutes } from "./modules/admin/events/routes.js";
import { npcsRoutes } from "./modules/admin/npcs/routes.js";
import { npcShopRoutes } from "./modules/npcShop/routes.js";
import { publicClassesRoutes } from "./modules/classes/routes.js";
import { charactersRoutes } from "./modules/characters/routes.js";
import { inventoryRoutes } from "./modules/inventory/routes.js";
import { publicZonesRoutes } from "./modules/zones/routes.js";
import { publicItemsRoutes } from "./modules/items/routes.js";
import { settingsRoutes, adminSettingsRoutes } from "./modules/settings/routes.js";
import { expeditionsRoutes } from "./modules/expeditions/routes.js";
import { travelRoutes } from "./modules/travel/routes.js";
import { profileRoutes } from "./modules/profile/routes.js";
import { friendsRoutes } from "./modules/friends/routes.js";
import { rankingRoutes } from "./modules/ranking/routes.js";
import { gatheringRoutes } from "./modules/gathering/routes.js";
import { fishingSpotsRoutes } from "./modules/admin/fishingSpots/routes.js";
import { passiveSkillsRoutes } from "./modules/passiveSkills/routes.js";
import { adminPassiveSkillsRoutes } from "./modules/admin/passiveSkills/routes.js";
import { minesRoutes } from "./modules/admin/mines/routes.js";
import { accountRoutes } from "./modules/account/routes.js";
import { dailyLoginRoutes } from "./modules/dailyLogin/routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: isProd ? "info" : "debug",
      transport: isProd
        ? undefined
        : {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
          },
      redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.passwordHash"],
    },
    trustProxy: true,
    genReqId: () => crypto.randomUUID(),
  });

  await registerSecurityPlugins(app);
  registerErrorHandler(app);

  // Per-module request timing — deliberately the very first hook registered, so its own overhead
  // isn't attributed to whichever route happens to run after it, and so it wraps every request
  // (including ones that error out downstream) rather than only successful ones. onSend (not
  // onResponse) specifically so error responses' JSON body is still available to pull the
  // `{ error: "..." }` message out of — this codebase's routes.ts files uniformly shape error
  // bodies that way (see any `reply.code(err.statusCode).send({ error: err.message })`).
  app.addHook("onSend", async (request, reply, payload) => {
    const statusCode = reply.statusCode;
    let message: string | undefined;
    if (statusCode >= 400 && typeof payload === "string") {
      try {
        const parsed = JSON.parse(payload) as { error?: unknown };
        if (typeof parsed.error === "string") message = parsed.error;
      } catch {
        // Not JSON (or not our error shape) — recorded without a message, still useful.
      }
    }
    serverLoadTracker.recordRequest(moduleForPath(request.url), reply.elapsedTime, statusCode, {
      method: request.method,
      path: request.url,
      message,
    });
    return payload;
  });

  // Uploaded item artwork — served from apps/api/uploads (relative to cwd, matching how this
  // project already resolves dev.db/.env: the API is always started with cwd at apps/api/).
  // Registering the file-size limit here (not per-route) is @fastify/multipart's only place to
  // configure it.
  await app.register(fastifyMultipart, { limits: { fileSize: 3 * 1024 * 1024 } });
  const uploadsRoot = path.join(process.cwd(), "uploads");
  // uploads/ is gitignored (user-generated content, not source) — a fresh checkout (e.g. first
  // deploy) won't have it yet, and @fastify/static requires its root to exist at registration.
  fs.mkdirSync(path.join(uploadsRoot, "items"), { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadsRoot,
    prefix: "/uploads/",
  });

  app.get("/health", async () => ({ status: "ok", time: new Date().toISOString() }));
  app.get("/api/version", async () => ({ version: APP_VERSION }));

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(logsRoutes, { prefix: "/api/admin/logs" });
  await app.register(zonesRoutes, { prefix: "/api/admin/zones" });
  await app.register(monstersRoutes, { prefix: "/api/admin/monsters" });
  await app.register(itemsRoutes, { prefix: "/api/admin/items" });
  await app.register(classesAdminRoutes, { prefix: "/api/admin/classes" });
  await app.register(adminCharactersRoutes, { prefix: "/api/admin/characters" });
  await app.register(balanceStatsRoutes, { prefix: "/api/admin/balance-stats" });
  await app.register(adminExpeditionsRoutes, { prefix: "/api/admin/expeditions" });
  await app.register(eventsAdminRoutes, { prefix: "/api/admin/events" });
  await app.register(npcsRoutes, { prefix: "/api/admin/npcs" });
  await app.register(npcShopRoutes, { prefix: "/api/npc-shop" });
  await app.register(publicClassesRoutes, { prefix: "/api/classes" });
  await app.register(charactersRoutes, { prefix: "/api/characters" });
  await app.register(inventoryRoutes, { prefix: "/api/inventory" });
  await app.register(publicZonesRoutes, { prefix: "/api/zones" });
  await app.register(publicItemsRoutes, { prefix: "/api/items" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(adminSettingsRoutes, { prefix: "/api/admin/settings" });
  await app.register(expeditionsRoutes, { prefix: "/api/expeditions" });
  await app.register(travelRoutes, { prefix: "/api/travel" });
  await app.register(profileRoutes, { prefix: "/api/profile" });
  await app.register(friendsRoutes, { prefix: "/api/friends" });
  await app.register(rankingRoutes, { prefix: "/api/ranking" });
  await app.register(gatheringRoutes, { prefix: "/api/gathering" });
  await app.register(fishingSpotsRoutes, { prefix: "/api/admin/fishing-spots" });
  await app.register(minesRoutes, { prefix: "/api/admin/mines" });
  await app.register(passiveSkillsRoutes, { prefix: "/api/passive-skills" });
  await app.register(adminPassiveSkillsRoutes, { prefix: "/api/admin/passive-skills" });
  await app.register(accountRoutes, { prefix: "/api/account" });
  await app.register(dailyLoginRoutes, { prefix: "/api/daily-login" });
  await app.register(serverLoadRoutes, { prefix: "/api/admin/server-load" });
  await app.register(botsRoutes, { prefix: "/api/admin/bots" });

  return app;
}
