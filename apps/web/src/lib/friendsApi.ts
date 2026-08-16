import type { SendFriendRequestInput } from "@mmo/shared";
import { apiFetch } from "./apiClient";

export interface FriendEntryDto {
  userId: string;
  characterId: string | null;
  characterName: string | null;
  characterLevel: number | null;
  className: string | null;
  online: boolean;
}

export interface FriendRequestEntryDto {
  friendRequestId: string;
  userId: string;
  characterId: string | null;
  characterName: string | null;
  createdAt: string;
}

export interface FriendsListDto {
  friends: FriendEntryDto[];
  incoming: FriendRequestEntryDto[];
  outgoing: FriendRequestEntryDto[];
}

export const listFriends = () => apiFetch<FriendsListDto>("/api/friends");

export const sendFriendRequest = (input: SendFriendRequestInput) =>
  apiFetch<{ status: "pending" | "accepted" }>("/api/friends/request", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const acceptFriendRequest = (friendRequestId: string) =>
  apiFetch<{ ok: true }>(`/api/friends/${friendRequestId}/accept`, { method: "POST" });

export const declineFriendRequest = (friendRequestId: string) =>
  apiFetch<{ ok: true }>(`/api/friends/${friendRequestId}/decline`, { method: "POST" });

export const cancelFriendRequest = (friendRequestId: string) =>
  apiFetch<{ ok: true }>(`/api/friends/requests/${friendRequestId}`, { method: "DELETE" });

export const removeFriend = (userId: string) =>
  apiFetch<{ ok: true }>(`/api/friends/${userId}`, { method: "DELETE" });
