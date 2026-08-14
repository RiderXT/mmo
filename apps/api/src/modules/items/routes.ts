import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/authGuard.js";
import { listItems, getItem } from "../admin/items/service.js";

/** Read-only item catalogue for any authenticated player (needed to show item names/stats on loot, tooltips, etc). Content management lives under /api/admin/items. */
export async function publicItemsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(await listItems());
  });

  app.get("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getItem(id);
    if (!item) return reply.code(404).send({ error: "Nie znaleziono itemu" });
    return reply.send(item);
  });
}
