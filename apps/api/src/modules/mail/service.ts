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

/** The character shown alongside a message (sender/recipient row) — same "pick the highest-level
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
      subject: input.subject,
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

  return message;
}

export async function listInbox(userId: string) {
  const rows = await prisma.message.findMany({
    where: { recipientId: userId, deletedByRecipient: false },
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { id: true } } },
  });
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
      counterpartCharacterName: (await representativeCharacter(row.sender.id))?.name ?? null,
    })),
  );
}

export async function listSent(userId: string) {
  const rows = await prisma.message.findMany({
    where: { senderId: userId, deletedBySender: false },
    orderBy: { createdAt: "desc" },
    include: { recipient: { select: { id: true } } },
  });
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
      counterpartCharacterName: (await representativeCharacter(row.recipient.id))?.name ?? null,
    })),
  );
}

export async function markRead(userId: string, messageId: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.recipientId !== userId) throw new MailError("Nie znaleziono wiadomości", 404);
  if (message.read) return;
  await prisma.message.update({ where: { id: messageId }, data: { read: true } });
}

export async function deleteMessage(userId: string, messageId: string, requestId?: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || (message.senderId !== userId && message.recipientId !== userId)) {
    throw new MailError("Nie znaleziono wiadomości", 404);
  }

  const isSender = message.senderId === userId;
  await prisma.message.update({
    where: { id: messageId },
    data: isSender ? { deletedBySender: true } : { deletedByRecipient: true },
  });

  await logAction({ module: "mail", action: "delete", actorUserId: userId, requestId, payload: { messageId } });
}

export async function getUnreadCount(userId: string) {
  return prisma.message.count({ where: { recipientId: userId, read: false, deletedByRecipient: false } });
}
