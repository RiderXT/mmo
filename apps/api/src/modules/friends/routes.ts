import type { FastifyInstance } from "fastify";
import { SendFriendRequestSchema } from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import {
  sendFriendRequest,
  respondToFriendRequest,
  removeFriend,
  cancelOutgoingRequest,
  listFriends,
  FriendError,
} from "./service.js";

export async function friendsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: requireAuth }, async (request, reply) => {
    return reply.send(await listFriends(request.user!.sub));
  });

  app.post("/request", { preHandler: requireAuth }, async (request, reply) => {
    const body = SendFriendRequestSchema.parse(request.body);
    try {
      return reply.send(await sendFriendRequest(request.user!.sub, body, request.id));
    } catch (err) {
      if (err instanceof FriendError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:friendRequestId/accept", { preHandler: requireAuth }, async (request, reply) => {
    const { friendRequestId } = request.params as { friendRequestId: string };
    try {
      await respondToFriendRequest(request.user!.sub, friendRequestId, true, request.id);
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof FriendError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:friendRequestId/decline", { preHandler: requireAuth }, async (request, reply) => {
    const { friendRequestId } = request.params as { friendRequestId: string };
    try {
      await respondToFriendRequest(request.user!.sub, friendRequestId, false, request.id);
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof FriendError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/requests/:friendRequestId", { preHandler: requireAuth }, async (request, reply) => {
    const { friendRequestId } = request.params as { friendRequestId: string };
    try {
      await cancelOutgoingRequest(request.user!.sub, friendRequestId, request.id);
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof FriendError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/:userId", { preHandler: requireAuth }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    try {
      await removeFriend(request.user!.sub, userId, request.id);
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof FriendError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
