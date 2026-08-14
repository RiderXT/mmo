import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/authGuard.js";
import { listZones, getZone } from "../admin/zones/service.js";

/**
 * Read-only zone listing for any authenticated player (e.g. to pick a zone to send a
 * character to). Content management (create/update/delete) lives under /api/admin/zones.
 */
export async function publicZonesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(await listZones());
  });

  app.get("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const zone = await getZone(id);
    if (!zone) return reply.code(404).send({ error: "Nie znaleziono krainy" });
    return reply.send(zone);
  });
}
