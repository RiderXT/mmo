import type { FastifyInstance } from "fastify";
import { CreateZoneSchema, UpdateZoneSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import { listZones, getZone, createZone, updateZone, deleteZone, ZoneError } from "./service.js";

export async function zonesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin", "moderator") }, async (_request, reply) => {
    return reply.send(await listZones());
  });

  app.get("/:id", { preHandler: requireRole("admin", "moderator") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const zone = await getZone(id);
    if (!zone) return reply.code(404).send({ error: "Nie znaleziono krainy" });
    return reply.send(zone);
  });

  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = CreateZoneSchema.parse(request.body);
    try {
      const zone = await createZone(input, request.user!.sub, request.id);
      return reply.code(201).send(zone);
    } catch (err) {
      if (err instanceof ZoneError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateZoneSchema.parse(request.body);
    try {
      const zone = await updateZone(id, input, request.user!.sub, request.id);
      return reply.send(zone);
    } catch (err) {
      if (err instanceof ZoneError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteZone(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof ZoneError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
