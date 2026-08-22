import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import type { CreateTicketInput, ReplyToTicketInput } from "@mmo/shared";

export class SupportError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export async function createTicket(userId: string, input: CreateTicketInput, requestId?: string) {
  const ticket = await prisma.supportTicket.create({
    data: { authorUserId: userId, subject: input.subject, body: input.body },
  });
  await logAction({
    module: "support",
    action: "create",
    actorUserId: userId,
    requestId,
    payload: { ticketId: ticket.id, subject: ticket.subject },
  });
  return ticket;
}

export function listMyTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { authorUserId: userId },
    orderBy: { updatedAt: "desc" },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getMyTicket(userId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket || ticket.authorUserId !== userId) throw new SupportError("Nie znaleziono zgłoszenia", 404);
  return ticket;
}

export async function replyToMyTicket(userId: string, ticketId: string, input: ReplyToTicketInput, requestId?: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.authorUserId !== userId) throw new SupportError("Nie znaleziono zgłoszenia", 404);
  if (ticket.status === "closed") throw new SupportError("To zgłoszenie jest zamknięte", 409);

  const reply = await prisma.supportTicketReply.create({
    data: { ticketId, authorUserId: userId, body: input.body },
  });
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });

  await logAction({
    module: "support",
    action: "reply",
    actorUserId: userId,
    requestId,
    payload: { ticketId, replyId: reply.id },
  });
  return reply;
}
