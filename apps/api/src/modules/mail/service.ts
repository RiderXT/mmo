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

/** The character shown alongside a message/conversation partner — same "pick the highest-level
 * character on that account" convention as modules/friends/service.ts. */
async function representativeCharacter(userId: string) {
  return prisma.character.findFirst({
    where: { userId },
    orderBy: { level: "desc" },
    select: { name: true },
  });
}

export async function sendMessage(senderId: string, input: SendMessageInput, requestId?: string) {
  const targetCharacter = await prisma.character.findUnique({
    where: { name: input.recipientCharacterName },
    select: { userId: true, name: true },
  });
  if (!targetCharacter) throw new MailError("Nie znaleziono postaci o tej nazwie", 404);
  if (targetCharacter.userId === senderId) {
    throw new MailError("Nie możesz wysłać wiadomości do samego siebie", 400);
  }

  const message = await prisma.message.create({
    data: {
      senderId,
      recipientId: targetCharacter.userId,
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
    actorUserId: senderId,
    requestId,
    payload: { messageId: message.id, recipientCharacterName: targetCharacter.name },
  });

  return { id: message.id, body: message.body, createdAt: message.createdAt.toISOString(), recipientUserId: targetCharacter.userId };
}

/** One row per person you've ever exchanged messages with — everything sent+received between the
 * two of you collapses into a single conversation regardless of how many separate replies went
 * back and forth, so replying never spins off a disconnected new thread the other side can't
 * continue. See docs/architecture.md, "Poczta jako konwersacje...". */
export async function listConversations(userId: string) {
  const rows = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId, deletedBySender: false },
        { recipientId: userId, deletedByRecipient: false },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { senderId: true, recipientId: true, body: true, read: true, createdAt: true },
  });

  const byPartner = new Map<string, { lastBody: string; lastCreatedAt: Date; unread: number }>();
  for (const row of rows) {
    const partnerId = row.senderId === userId ? row.recipientId : row.senderId;
    const isUnreadForMe = row.recipientId === userId && !row.read;
    const entry = byPartner.get(partnerId);
    if (!entry) {
      // Rows arrive createdAt-desc, so the first row seen per partner is already the latest one.
      byPartner.set(partnerId, { lastBody: row.body, lastCreatedAt: row.createdAt, unread: isUnreadForMe ? 1 : 0 });
    } else if (isUnreadForMe) {
      entry.unread += 1;
    }
  }

  const partnerIds = Array.from(byPartner.keys());
  const characters = await Promise.all(partnerIds.map((id) => representativeCharacter(id)));

  return partnerIds
    .map((partnerId, i) => {
      const entry = byPartner.get(partnerId)!;
      return {
        partnerUserId: partnerId,
        partnerCharacterName: characters[i]?.name ?? null,
        lastMessage: entry.lastBody,
        lastMessageAt: entry.lastCreatedAt.toISOString(),
        unreadCount: entry.unread,
      };
    })
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

/** Full back-and-forth with one partner, oldest first (chat order). Marks their unread messages
 * read as a side effect of opening the thread — same UX the old per-message inbox had, just
 * applied to the whole conversation at once instead of one row at a time. */
export async function getConversation(userId: string, partnerUserId: string) {
  const partner = await prisma.user.findUnique({ where: { id: partnerUserId }, select: { id: true } });
  if (!partner) throw new MailError("Nie znaleziono rozmówcy", 404);

  await prisma.message.updateMany({
    where: { senderId: partnerUserId, recipientId: userId, read: false },
    data: { read: true },
  });

  const rows = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId, recipientId: partnerUserId, deletedBySender: false },
        { senderId: partnerUserId, recipientId: userId, deletedByRecipient: false },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    fromMe: row.senderId === userId,
  }));
}

/** Soft-deletes my side of every message with this partner — mirrors the old per-message delete
 * (Message.deletedBySender/deletedByRecipient), just applied to the whole thread at once. The
 * other side keeps their own copy until they delete it too. */
export async function deleteConversation(userId: string, partnerUserId: string, requestId?: string) {
  await prisma.message.updateMany({
    where: { senderId: userId, recipientId: partnerUserId, deletedBySender: false },
    data: { deletedBySender: true },
  });
  await prisma.message.updateMany({
    where: { senderId: partnerUserId, recipientId: userId, deletedByRecipient: false },
    data: { deletedByRecipient: true },
  });

  await logAction({ module: "mail", action: "delete_conversation", actorUserId: userId, requestId, payload: { partnerUserId } });
}

export async function getUnreadCount(userId: string) {
  return prisma.message.count({ where: { recipientId: userId, read: false, deletedByRecipient: false } });
}
