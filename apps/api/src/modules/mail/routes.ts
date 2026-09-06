import type { FastifyInstance } from "fastify";
import { SendMessageSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import { sendMessage, listConversations, getConversation, deleteConversation, getUnreadCount, MailError } from "./service.js";

export async function mailRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:characterId/conversations", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      return reply.send(await listConversations(characterId, request.user!.sub));
    } catch (err) {
      if (err instanceof MailError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/:characterId/unread-count", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      return reply.send({ count: await getUnreadCount(characterId, request.user!.sub) });
    } catch (err) {
      if (err instanceof MailError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/:characterId/conversations/:partnerCharacterId", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId, partnerCharacterId } = request.params as { characterId: string; partnerCharacterId: string };
    try {
      return reply.send(await getConversation(characterId, request.user!.sub, partnerCharacterId));
    } catch (err) {
      if (err instanceof MailError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:characterId/conversations/:partnerCharacterId", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId, partnerCharacterId } = request.params as { characterId: string; partnerCharacterId: string };
    try {
      await deleteConversation(characterId, request.user!.sub, partnerCharacterId, request.id);
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof MailError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:characterId", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    const body = SendMessageSchema.parse(request.body);
    try {
      const message = await sendMessage(characterId, request.user!.sub, body, request.id);
      return reply.code(201).send(message);
    } catch (err) {
      if (err instanceof MailError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
