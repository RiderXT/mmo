import type { FastifyInstance } from "fastify";
import { StartTravelSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import { startTravel, TravelError } from "./service.js";

export async function travelRoutes(app: FastifyInstance): Promise<void> {
  app.post("/start", { preHandler: requireAuth }, async (request, reply) => {
    const input = StartTravelSchema.parse(request.body);
    try {
      const result = await startTravel(input, request.user!.sub, request.id);
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof TravelError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
