import type { FastifyInstance } from "fastify";
import { SendMessageSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import { sendMessage, listInbox, listSent, markRead, deleteMessage, getUnreadCount, MailError } from "./service.js";

export async function mailRoutes(app: FastifyInstance): Promise<void> {
  app.get("/inbox", { preHandler: requireAuth }, async (request, reply) => {
    return reply.send(await listInbox(request.user!.sub));
  });

  app.get("/sent", { preHandler: requireAuth }, async (request, reply) => {
    return reply.send(await listSent(request.user!.sub));
  });

  app.get("/unread-count", { preHandler: requireAuth }, async (request, reply) => {
    return reply.send({ count: await getUnreadCount(request.user!.sub) });
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

  app.post("/:messageId/read", { preHandler: requireAuth }, async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    try {
      await markRead(request.user!.sub, messageId);
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof MailError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:messageId", { preHandler: requireAuth }, async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    try {
      await deleteMessage(request.user!.sub, messageId, request.id);
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof MailError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
