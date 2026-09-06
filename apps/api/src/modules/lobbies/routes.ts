import type { FastifyInstance } from "fastify";
import {
  CreateLobbySchema,
  JoinLobbySchema,
  KickLobbyMemberSchema,
  SetLobbyReadySchema,
  StartLobbyExpeditionSchema,
} from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import {
  listOpenLobbiesInZone,
  createLobby,
  joinLobby,
  leaveLobby,
  kickMember,
  setReady,
  getActiveLobby,
  startLobbyExpedition,
  getLobbyExpedition,
  claimLobbyExpeditionReward,
  LobbyError,
} from "./service.js";

export async function lobbiesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/zone/:zoneId", { preHandler: requireAuth }, async (request, reply) => {
    const { zoneId } = request.params as { zoneId: string };
    const { characterId } = request.query as { characterId: string };
    try {
      return reply.send(await listOpenLobbiesInZone(zoneId, characterId, request.user!.sub));
    } catch (err) {
      if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/active/:characterId", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      return reply.send(await getActiveLobby(characterId, request.user!.sub));
    } catch (err) {
      if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId, zoneId } = CreateLobbySchema.parse(request.body);
    try {
      return reply.code(201).send(await createLobby(characterId, zoneId, request.user!.sub, request.id));
    } catch (err) {
      if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:lobbyId/join", { preHandler: requireAuth }, async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    const { characterId } = JoinLobbySchema.parse(request.body);
    try {
      return reply.send(await joinLobby(lobbyId, characterId, request.user!.sub, request.id));
    } catch (err) {
      if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:lobbyId/leave", { preHandler: requireAuth }, async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    // Same {characterId} shape as JoinLobbySchema — reused rather than defining an identical schema.
    const { characterId } = JoinLobbySchema.parse(request.body);
    try {
      await leaveLobby(lobbyId, characterId, request.user!.sub, request.id);
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:lobbyId/kick", { preHandler: requireAuth }, async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    const { characterId, targetCharacterId } = KickLobbyMemberSchema.parse(request.body);
    try {
      await kickMember(lobbyId, characterId, targetCharacterId, request.user!.sub, request.id);
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:lobbyId/ready", { preHandler: requireAuth }, async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    const { characterId, ready } = SetLobbyReadySchema.parse(request.body);
    try {
      return reply.send(await setReady(lobbyId, characterId, ready, request.user!.sub, request.id));
    } catch (err) {
      if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:lobbyId/start", { preHandler: requireAuth }, async (request, reply) => {
    const { lobbyId } = request.params as { lobbyId: string };
    const { characterId, selectedMonsterIds } = StartLobbyExpeditionSchema.parse(request.body);
    try {
      return reply.send(await startLobbyExpedition(lobbyId, characterId, selectedMonsterIds, request.user!.sub, request.id));
    } catch (err) {
      if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.get("/expeditions/:lobbyExpeditionId", { preHandler: requireAuth }, async (request, reply) => {
    const { lobbyExpeditionId } = request.params as { lobbyExpeditionId: string };
    const { characterId } = request.query as { characterId: string };
    try {
      return reply.send(await getLobbyExpedition(lobbyExpeditionId, characterId, request.user!.sub));
    } catch (err) {
      if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/expeditions/:lobbyExpeditionId/claim", { preHandler: requireAuth }, async (request, reply) => {
    const { lobbyExpeditionId } = request.params as { lobbyExpeditionId: string };
    const { characterId } = JoinLobbySchema.parse(request.body);
    try {
      return reply.send(await claimLobbyExpeditionReward(lobbyExpeditionId, characterId, request.user!.sub, request.id));
    } catch (err) {
      if (err instanceof LobbyError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
