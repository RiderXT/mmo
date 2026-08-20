import type { FastifyInstance } from "fastify";
import { requireRole } from "../../../lib/authGuard.js";
import { serverLoadTracker } from "../../../lib/serverLoad.js";

export async function serverLoadRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send(serverLoadTracker.getSnapshot());
  });

  // Clears the per-module counters/timeline (not the running process/system samples, which are
  // always a rolling window anyway) — useful right before a deliberate load test so its numbers
  // aren't mixed in with whatever normal traffic came before it.
  app.post("/reset", { preHandler: requireRole("admin") }, async (_request, reply) => {
    serverLoadTracker.reset();
    return reply.code(204).send();
  });
}
