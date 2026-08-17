import type { FastifyInstance } from "fastify";
import { CreateFishingSpotSchema, UpdateFishingSpotSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import {
  listFishingSpots,
  getFishingSpot,
  createFishingSpot,
  updateFishingSpot,
  deleteFishingSpot,
  FishingSpotError,
} from "./service.js";

export async function fishingSpotsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin", "moderator") }, async (_request, reply) => {
    return reply.send(await listFishingSpots());
  });

  app.get("/:id", { preHandler: requireRole("admin", "moderator") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const spot = await getFishingSpot(id);
    if (!spot) return reply.code(404).send({ error: "Nie znaleziono łowiska" });
    return reply.send(spot);
  });

  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = CreateFishingSpotSchema.parse(request.body);
    try {
      const spot = await createFishingSpot(input, request.user!.sub, request.id);
      return reply.code(201).send(spot);
    } catch (err) {
      if (err instanceof FishingSpotError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateFishingSpotSchema.parse(request.body);
    try {
      const spot = await updateFishingSpot(id, input, request.user!.sub, request.id);
      return reply.send(spot);
    } catch (err) {
      if (err instanceof FishingSpotError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteFishingSpot(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof FishingSpotError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
