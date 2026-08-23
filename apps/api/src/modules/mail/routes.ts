import type { FastifyInstance } from "fastify";
import { SendMessageSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import { sendMessage, listConversations, getConversation, deleteConversation, getUnreadCount, MailError } from "./service.js";

export async function mailRoutes(app: FastifyInstance): Promise<void> {
  app.get("/conversations", { preHandler: requireAuth }, async (request, reply) => {
    return reply.send(await listConversations(request.user!.sub));
  });

  app.get("/unread-count", { preHandler: requireAuth }, async (request, reply) => {
    return reply.send({ count: await getUnreadCount(request.user!.sub) });
  });

  app.get("/conversations/:partnerUserId", { preHandler: requireAuth }, async (request, reply) => {
    const { partnerUserId } = request.params as { partnerUserId: string };
    try {
      return reply.send(await getConversation(request.user!.sub, partnerUserId));
    } catch (err) {
      if (err instanceof MailError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/conversations/:partnerUserId", { preHandler: requireAuth }, async (request, reply) => {
    const { partnerUserId } = request.params as { partnerUserId: string };
    await deleteConversation(request.user!.sub, partnerUserId, request.id);
    return reply.send({ ok: true });
  });

  app.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const body = SendMessageSchema.parse(request.body);
    try {
      const message = await sendMessage(request.user!.sub, body, request.id);
      return reply.code(201).send(message);
    } catch (err) {
      if (err instanceof MailError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
