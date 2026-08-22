import type { FastifyInstance } from "fastify";
import { ReplyToTicketSchema, UpdateTicketStatusSchema, TicketStatusSchema } from "@mmo/shared";
import { requireRole } from "../../../lib/authGuard.js";
import { listAllTickets, replyToTicketAsAdmin, updateTicketStatus, SupportAdminError } from "./service.js";

export async function supportAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireRole("admin", "moderator") }, async (request, reply) => {
    const { status } = request.query as { status?: string };
    const parsedStatus = status ? TicketStatusSchema.safeParse(status) : null;
    return reply.send(await listAllTickets(parsedStatus?.success ? parsedStatus.data : undefined));
  });

  app.post("/:ticketId/replies", { preHandler: requireRole("admin", "moderator") }, async (request, httpReply) => {
    const { ticketId } = request.params as { ticketId: string };
    const input = ReplyToTicketSchema.parse(request.body);
    try {
      const created = await replyToTicketAsAdmin(request.user!.sub, ticketId, input, request.id);
      return httpReply.code(201).send(created);
    } catch (err) {
      if (err instanceof SupportAdminError) return httpReply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.put("/:ticketId/status", { preHandler: requireRole("admin", "moderator") }, async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    const { status } = UpdateTicketStatusSchema.parse(request.body);
    try {
      const ticket = await updateTicketStatus(request.user!.sub, ticketId, status, request.id);
      return reply.send(ticket);
    } catch (err) {
      if (err instanceof SupportAdminError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
