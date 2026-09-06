import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import type { SendMessageInput } from "@mmo/shared";

export class MailError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

async function assertCharacterOwnership(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new MailError("Nie znaleziono postaci", 404);
  }
  return character;
}

export async function sendMessage(
  characterId: string,
  userId: string,
  input: SendMessageInput,
  requestId?: string,
) {
  const senderCharacter = await assertCharacterOwnership(characterId, userId);

  const targetCharacter = await prisma.character.findUnique({
    where: { name: input.recipientCharacterName },
    select: { id: true, userId: true, name: true },
  });
  if (!targetCharacter) throw new MailError("Nie znaleziono postaci o tej nazwie", 404);
  if (targetCharacter.userId === userId) {
    throw new MailError("Nie możesz wysłać wiadomości do samego siebie", 400);
  }

  const message = await prisma.message.create({
    data: {
      senderId: userId,
      recipientId: targetCharacter.userId,
      senderCharacterId: senderCharacter.id,
      recipientCharacterId: targetCharacter.id,
      // Subject is a leftover from the old per-message inbox model — conversations are now
      // grouped by counterpart, not by subject line, so this is just a constant placeholder the
      // (still NOT NULL) column requires. Never shown anywhere.
      subject: "Wiadomość",
      body: input.body,
    },
  });

  await logAction({
    module: "mail",
    action: "send",
    actorUserId: userId,
    actorCharacterId: senderCharacter.id,
    requestId,
    payload: { messageId: message.id, recipientCharacterName: targetCharacter.name },
  });

  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    recipientCharacterId: targetCharacter.id,
  };
}

/** One row per character you've ever exchanged messages with FROM THIS character — everything
 * sent+received between the two characters collapses into a single conversation regardless of how
 * many separate replies went back and forth. Scoped by character (not account): switching to
 * another character on the same account must not expose a different character's mail. See
 * docs/architecture.md, "Poczta jako konwersacje...". */
export async function listConversations(characterId: string, userId: string) {
  await assertCharacterOwnership(characterId, userId);

  const rows = await prisma.message.findMany({
    where: {
      OR: [
        { senderCharacterId: characterId, deletedBySender: false },
        { recipientCharacterId: characterId, deletedByRecipient: false },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { senderCharacterId: true, recipientCharacterId: true, body: true, read: true, createdAt: true },
  });

  const byPartner = new Map<string, { lastBody: string; lastCreatedAt: Date; unread: number }>();
  for (const row of rows) {
    const partnerId = row.senderCharacterId === characterId ? row.recipientCharacterId : row.senderCharacterId;
    if (!partnerId) continue;
    const isUnreadForMe = row.recipientCharacterId === characterId && !row.read;
    const entry = byPartner.get(partnerId);
    if (!entry) {
      // Rows arrive createdAt-desc, so the first row seen per partner is already the latest one.
      byPartner.set(partnerId, { lastBody: row.body, lastCreatedAt: row.createdAt, unread: isUnreadForMe ? 1 : 0 });
    } else if (isUnreadForMe) {
      entry.unread += 1;
    }
  }

  const partnerIds = Array.from(byPartner.keys());
  const characters = await prisma.character.findMany({
    where: { id: { in: partnerIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(characters.map((c) => [c.id, c.name]));

  return partnerIds
    .map((partnerId) => {
      const entry = byPartner.get(partnerId)!;
      return {
        partnerCharacterId: partnerId,
        partnerCharacterName: nameById.get(partnerId) ?? null,
        lastMessage: entry.lastBody,
        lastMessageAt: entry.lastCreatedAt.toISOString(),
        unreadCount: entry.unread,
      };
    })
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

/** Full back-and-forth between this character and one partner character, oldest first (chat
 * order). Marks their unread messages read as a side effect of opening the thread. */
export async function getConversation(characterId: string, userId: string, partnerCharacterId: string) {
  const myCharacter = await assertCharacterOwnership(characterId, userId);

  const partner = await prisma.character.findUnique({
    where: { id: partnerCharacterId },
    select: { id: true, name: true },
  });
  if (!partner) throw new MailError("Nie znaleziono rozmówcy", 404);

  await prisma.message.updateMany({
    where: { senderCharacterId: partnerCharacterId, recipientCharacterId: characterId, read: false },
    data: { read: true },
  });

  const rows = await prisma.message.findMany({
    where: {
      OR: [
        { senderCharacterId: characterId, recipientCharacterId: partnerCharacterId, deletedBySender: false },
        { senderCharacterId: partnerCharacterId, recipientCharacterId: characterId, deletedByRecipient: false },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    fromMe: row.senderCharacterId === characterId,
    // Which character actually sent this bubble — shown as a small label in the thread, since a
    // message from before this field existed (senderCharacterId null, pre-backfill) can't be
    // reliably attributed and falls back to "myCharacter"/"partner" by fromMe alone.
    characterName: row.senderCharacterId === characterId ? myCharacter.name : partner.name,
  }));
}

/** Soft-deletes my side of every message with this partner character — mirrors the old per-message
 * delete (Message.deletedBySender/deletedByRecipient), just applied to the whole thread at once.
 * The other side keeps their own copy until they delete it too. */
export async function deleteConversation(
  characterId: string,
  userId: string,
  partnerCharacterId: string,
  requestId?: string,
) {
  await assertCharacterOwnership(characterId, userId);

  await prisma.message.updateMany({
    where: { senderCharacterId: characterId, recipientCharacterId: partnerCharacterId, deletedBySender: false },
    data: { deletedBySender: true },
  });
  await prisma.message.updateMany({
    where: { senderCharacterId: partnerCharacterId, recipientCharacterId: characterId, deletedByRecipient: false },
    data: { deletedByRecipient: true },
  });

  await logAction({
    module: "mail",
    action: "delete_conversation",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: { partnerCharacterId },
  });
}

export async function getUnreadCount(characterId: string, userId: string) {
  await assertCharacterOwnership(characterId, userId);
  return prisma.message.count({
    where: { recipientCharacterId: characterId, read: false, deletedByRecipient: false },
  });
}
