import type { FastifyInstance } from "fastify";
import { CreateChangelogEntrySchema, UpdateChangelogEntrySchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import {
  listChangelogEntriesAdmin,
  createChangelogEntry,
  updateChangelogEntry,
  deleteChangelogEntry,
  ChangelogError,
} from "./service.js";

export async function changelogAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin") }, async (_request, reply) => {
    return reply.send(await listChangelogEntriesAdmin());
  });

  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const input = CreateChangelogEntrySchema.parse(request.body);
    const entry = await createChangelogEntry(input, request.user!.sub, request.id);
    return reply.code(201).send(entry);
  });

  app.put("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = UpdateChangelogEntrySchema.parse(request.body);
    try {
      const entry = await updateChangelogEntry(id, input, request.user!.sub, request.id);
      return reply.send(entry);
    } catch (err) {
      if (err instanceof ChangelogError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteChangelogEntry(id, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof ChangelogError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
