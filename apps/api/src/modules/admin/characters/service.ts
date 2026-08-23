import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import { addLootToInventory } from "../../inventory/service.js";
import { computeLevel } from "../../expeditions/service.js";
import type { AdminGrantInput, AdminCharacterDto } from "@mmo/shared";

export class AdminCharacterError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

/** All characters across all players — admin testing tool, needs to find any character by
 * name/owner, unlike the player-facing "my characters" list. */
export async function listAllCharacters(): Promise<AdminCharacterDto[]> {
  const characters = await prisma.character.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return characters.map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    exp: c.exp,
    gold: c.gold,
    classId: c.classId,
    ownerEmail: c.user.email,
  }));
}

/** Grants exp/gold/items directly to a character for testing — same level-up math as
 * applyExpeditionReward (expeditions/service.ts), same addLootToInventory as a real drop, but
 * a standalone function since this isn't tied to an expedition (no expeditionId to log). */
export async function grantToCharacter(
  characterId: string,
  input: AdminGrantInput,
  actorUserId: string,
  requestId?: string,
) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new AdminCharacterError("Nie znaleziono postaci", 404);

  if (input.items.length) {
    const itemIds = input.items.map((i) => i.itemId);
    const count = await prisma.item.count({ where: { id: { in: itemIds } } });
    if (count !== new Set(itemIds).size) {
      throw new AdminCharacterError("Jeden lub więcej wskazanych itemów nie istnieje", 400);
    }
  }

  const expGained = input.exp ?? 0;
  const goldGained = input.gold ?? 0;
  const newExp = character.exp + expGained;
  const newLevel = computeLevel(newExp);
  const levelsGained = Math.max(0, newLevel - character.level);

  await prisma.$transaction(async (tx) => {
    for (const item of input.items) {
      const { granted, overflow } = await addLootToInventory(tx, characterId, item.itemId, item.quantity);
      if (overflow > 0) {
        throw new AdminCharacterError(
          `Nie udało się dodać itemu ${item.itemId} do ekwipunku (dodano ${granted}/${item.quantity}) — sprawdź czy ilość jest większa od zera`,
          400,
        );
      }
    }
    await tx.character.update({
      where: { id: characterId },
      data: {
        exp: newExp,
        level: newLevel,
        gold: character.gold + goldGained,
        unspentStatPoints: character.unspentStatPoints + levelsGained * 4,
        unspentSkillPoints: character.unspentSkillPoints + levelsGained * 1,
      },
    });
  });

  await logAction({
    module: "admin:characters",
    action: "grant",
    actorUserId,
    actorCharacterId: characterId,
    requestId,
    payload: { characterId, expGained, goldGained, items: input.items, newLevel, levelsGained },
  });

  return { newLevel, levelsGained };
}
