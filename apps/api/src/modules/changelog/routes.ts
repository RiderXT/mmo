import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/authGuard.js";
import { prisma } from "../../lib/prismaClient.js";

const PUBLIC_LIST_LIMIT = 50;

export async function changelogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireAuth }, async (_request, reply) => {
    const entries = await prisma.changelogEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: PUBLIC_LIST_LIMIT,
      select: { id: true, title: true, body: true, createdAt: true },
    });
    return reply.send(entries);
  });
}
