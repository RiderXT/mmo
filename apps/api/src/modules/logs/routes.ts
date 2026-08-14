import type { FastifyInstance } from "fastify";
import { GameLogFilterSchema } from "@mmo/shared";
import { prisma } from "../../lib/prismaClient.js";
import { requireRole } from "../../lib/authGuard.js";
import type { Prisma } from "@prisma/client";

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function logsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { preHandler: requireRole("admin", "moderator") },
    async (request, reply) => {
      const filter = GameLogFilterSchema.parse(request.query);

      const where: Prisma.GameLogWhereInput = {
        module: filter.module ? { equals: filter.module } : undefined,
        level: filter.level,
        actorUserId: filter.actorUserId,
        createdAt:
          filter.from || filter.to
            ? { gte: filter.from ? new Date(filter.from) : undefined, lte: filter.to ? new Date(filter.to) : undefined }
            : undefined,
        OR: filter.search
          ? [
              { action: { contains: filter.search } },
              { module: { contains: filter.search } },
            ]
          : undefined,
      };

      const [total, entries] = await Promise.all([
        prisma.gameLog.count({ where }),
        prisma.gameLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
        }),
      ]);

      return reply.send({
        total,
        page: filter.page,
        pageSize: filter.pageSize,
        entries: entries.map((e) => ({
          id: e.id,
          module: e.module,
          level: e.level,
          action: e.action,
          actorUserId: e.actorUserId,
          actorCharacterId: e.actorCharacterId,
          payload: safeParseJson(e.payload),
          requestId: e.requestId,
          createdAt: e.createdAt.toISOString(),
        })),
      });
    },
  );

  app.get(
    "/modules",
    { preHandler: requireRole("admin", "moderator") },
    async (_request, reply) => {
      const rows = await prisma.gameLog.findMany({
        distinct: ["module"],
        select: { module: true },
        orderBy: { module: "asc" },
      });
      return reply.send(rows.map((r) => r.module));
    },
  );
}
