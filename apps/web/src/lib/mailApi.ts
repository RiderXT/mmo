import type { SendMessageInput } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export interface MessageDto {
  id: string;
  subject: string;
  body: string;
  read: boolean;
  createdAt: string;
  counterpartCharacterName: string | null;
}

export const listInbox = () => apiFetch<MessageDto[]>("/api/mail/inbox");
export const listSent = () => apiFetch<MessageDto[]>("/api/mail/sent");
export const getUnreadMailCount = () => apiFetch<{ count: number }>("/api/mail/unread-count");

export const sendMessage = (input: SendMessageInput) =>
  apiFetch<MessageDto>("/api/mail", { method: "POST", body: JSON.stringify(input) });

export const markMessageRead = (messageId: string) =>
  apiFetch<{ ok: true }>(`/api/mail/${messageId}/read`, { method: "POST" });

export const deleteMessage = (messageId: string) =>
  apiFetch<{ ok: true }>(`/api/mail/${messageId}`, { method: "DELETE" });
