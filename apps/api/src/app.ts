import Fastify, { type FastifyInstance } from "fastify";
import { isProd } from "./config/env.js";
import { APP_VERSION } from "./lib/appVersion.js";
import { registerSecurityPlugins } from "./plugins/security.js";
import { registerErrorHandler } from "./plugins/errorHandler.js";
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

  return app;
}
