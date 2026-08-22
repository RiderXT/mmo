import type { FastifyInstance } from "fastify";
import { CreateTicketSchema, ReplyToTicketSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import { createTicket, listMyTickets, getMyTicket, replyToMyTicket, SupportError } from "./service.js";

export async function supportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireAuth }, async (request, reply) => {
    return reply.send(await listMyTickets(request.user!.sub));
  });

  app.get("/:ticketId", { preHandler: requireAuth }, async (request, reply) => {
    const { ticketId } = request.params as { ticketId: string };
    try {
      return reply.send(await getMyTicket(request.user!.sub, ticketId));
    } catch (err) {
      if (err instanceof SupportError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const input = CreateTicketSchema.parse(request.body);
    const ticket = await createTicket(request.user!.sub, input, request.id);
    return reply.code(201).send(ticket);
  });

  app.post("/:ticketId/replies", { preHandler: requireAuth }, async (request, httpReply) => {
    const { ticketId } = request.params as { ticketId: string };
    const input = ReplyToTicketSchema.parse(request.body);
    try {
      const created = await replyToMyTicket(request.user!.sub, ticketId, input, request.id);
      return httpReply.code(201).send(created);
    } catch (err) {
      if (err instanceof SupportError) return httpReply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
