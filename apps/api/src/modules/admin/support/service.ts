import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { ReplyToTicketInput, TicketStatus } from "@mmo/shared";

export class SupportAdminError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export async function listAllTickets(status?: TicketStatus) {
  const tickets = await prisma.supportTicket.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      author: { select: { email: true } },
      replies: { orderBy: { createdAt: "asc" }, include: { author: { select: { email: true, role: true } } } },
    },
  });
  return tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    body: t.body,
    status: t.status,
    authorEmail: t.author.email,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    replies: t.replies.map((r) => ({
      id: r.id,
      body: r.body,
      authorEmail: r.author.email,
      isAdminReply: r.author.role === "admin" || r.author.role === "moderator",
      createdAt: r.createdAt.toISOString(),
    })),
  }));
}

export async function replyToTicketAsAdmin(
  actorUserId: string,
  ticketId: string,
  input: ReplyToTicketInput,
  requestId?: string,
) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new SupportAdminError("Nie znaleziono zgłoszenia", 404);

  const reply = await prisma.supportTicketReply.create({
    data: { ticketId, authorUserId: actorUserId, body: input.body },
  });
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });

  await logAction({
    module: "admin:support",
    action: "reply",
    actorUserId,
    requestId,
    payload: { ticketId, replyId: reply.id },
  });
  return reply;
}

export async function updateTicketStatus(
  actorUserId: string,
  ticketId: string,
  status: TicketStatus,
  requestId?: string,
) {
  const existing = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!existing) throw new SupportAdminError("Nie znaleziono zgłoszenia", 404);

  const ticket = await prisma.supportTicket.update({ where: { id: ticketId }, data: { status } });
  await logAction({
    module: "admin:support",
    action: "status",
    actorUserId,
    requestId,
    payload: { ticketId, status },
  });
  return ticket;
}
