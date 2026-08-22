import type { CreateTicketInput, ReplyToTicketInput, TicketStatus } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export interface TicketReplyDto {
  id: string;
  body: string;
  authorUserId: string;
  createdAt: string;
}

export interface MyTicketDto {
  id: string;
  subject: string;
  body: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  replies: TicketReplyDto[];
}

export const listMyTickets = () => apiFetch<MyTicketDto[]>("/api/support");
export const getMyTicket = (ticketId: string) => apiFetch<MyTicketDto>(`/api/support/${ticketId}`);

export const createTicket = (input: CreateTicketInput) =>
  apiFetch<MyTicketDto>("/api/support", { method: "POST", body: JSON.stringify(input) });

export const replyToTicket = (ticketId: string, input: ReplyToTicketInput) =>
  apiFetch<TicketReplyDto>(`/api/support/${ticketId}/replies`, { method: "POST", body: JSON.stringify(input) });
