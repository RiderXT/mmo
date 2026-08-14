import type { FastifyInstance } from "fastify";
import {
  MoveItemSchema,
  EquipItemSchema,
  UnequipItemSchema,
  UpgradeItemSchema,
  SetActiveSlotSchema,
  ClearActiveSlotSchema,
} from "@mmo/shared";
import { requireAuth } from "../../lib/authGuard.js";
import {
  listInventory,
  moveItem,
  equipItem,
  unequipItem,
  upgradeItem,
  setActiveSlot,
  clearActiveSlot,
  InventoryError,
} from "./service.js";

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/:characterId", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    try {
      return reply.send(await listInventory(characterId, request.user!.sub));
    } catch (err) {
      if (err instanceof InventoryError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:characterId/move", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    const body = MoveItemSchema.parse(request.body);
    try {
      await moveItem({ characterId, ...body }, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof InventoryError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:characterId/equip", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    const body = EquipItemSchema.parse(request.body);
    try {
      await equipItem({ characterId, ...body }, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof InventoryError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:characterId/unequip", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    const body = UnequipItemSchema.parse(request.body);
    try {
      await unequipItem({ characterId, ...body }, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof InventoryError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:characterId/set-active-slot", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    const body = SetActiveSlotSchema.parse(request.body);
    try {
      await setActiveSlot({ characterId, ...body }, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof InventoryError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:characterId/clear-active-slot", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    const body = ClearActiveSlotSchema.parse(request.body);
    try {
      await clearActiveSlot({ characterId, ...body }, request.user!.sub, request.id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof InventoryError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });

  app.post("/:characterId/upgrade", { preHandler: requireAuth }, async (request, reply) => {
    const { characterId } = request.params as { characterId: string };
    const body = UpgradeItemSchema.parse(request.body);
    try {
      const result = await upgradeItem({ characterId, ...body }, request.user!.sub, request.id);
      return reply.send(result);
    } catch (err) {
      if (err instanceof InventoryError) return reply.code(err.statusCode).send({ error: err.message });
      throw err;
    }
  });
}
