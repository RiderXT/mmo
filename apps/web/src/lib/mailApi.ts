import { apiFetch } from "./apiClient";

export interface ConversationSummaryDto {
  partnerCharacterId: string;
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
  characterName: string;
}

export interface SentMessageDto {
  id: string;
  body: string;
  createdAt: string;
  recipientCharacterId: string;
}

export const listConversations = (characterId: string) =>
  apiFetch<ConversationSummaryDto[]>(`/api/mail/${characterId}/conversations`);
export const getConversation = (characterId: string, partnerCharacterId: string) =>
  apiFetch<ConversationMessageDto[]>(`/api/mail/${characterId}/conversations/${partnerCharacterId}`);
export const deleteConversation = (characterId: string, partnerCharacterId: string) =>
  apiFetch<{ ok: true }>(`/api/mail/${characterId}/conversations/${partnerCharacterId}`, { method: "DELETE" });
export const getUnreadMailCount = (characterId: string) =>
  apiFetch<{ count: number }>(`/api/mail/${characterId}/unread-count`);

export const sendMessage = (characterId: string, input: { recipientCharacterName: string; body: string }) =>
  apiFetch<SentMessageDto>(`/api/mail/${characterId}`, { method: "POST", body: JSON.stringify(input) });
