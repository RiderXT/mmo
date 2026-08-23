import { apiFetch } from "./apiClient";

export interface ConversationSummaryDto {
  partnerUserId: string;
  partnerCharacterName: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ConversationMessageDto {
  id: string;
  body: string;
  createdAt: string;
  fromMe: boolean;
}

export interface SentMessageDto {
  id: string;
  body: string;
  createdAt: string;
  recipientUserId: string;
}

export const listConversations = () => apiFetch<ConversationSummaryDto[]>("/api/mail/conversations");
export const getConversation = (partnerUserId: string) =>
  apiFetch<ConversationMessageDto[]>(`/api/mail/conversations/${partnerUserId}`);
export const deleteConversation = (partnerUserId: string) =>
  apiFetch<{ ok: true }>(`/api/mail/conversations/${partnerUserId}`, { method: "DELETE" });
export const getUnreadMailCount = () => apiFetch<{ count: number }>("/api/mail/unread-count");

export const sendMessage = (input: { recipientCharacterName: string; body: string }) =>
  apiFetch<SentMessageDto>("/api/mail", { method: "POST", body: JSON.stringify(input) });
