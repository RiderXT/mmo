import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";
import { isOnline } from "../../lib/presence.js";
import type { SendFriendRequestInput } from "@mmo/shared";

export class FriendError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

/** The character shown alongside a friend/request row — whichever of that account's characters
 * has the highest level, since a User can have several. */
async function representativeCharacter(userId: string) {
  return prisma.character.findFirst({
    where: { userId },
    orderBy: { level: "desc" },
    select: { id: true, name: true, level: true, class: { select: { name: true } } },
  });
}

export async function sendFriendRequest(userId: string, input: SendFriendRequestInput, requestId?: string) {
  const targetCharacter = await prisma.character.findUnique({
    where: { name: input.targetCharacterName },
    select: { userId: true, name: true },
  });
  if (!targetCharacter) throw new FriendError("Nie znaleziono postaci o tej nazwie", 404);
  if (targetCharacter.userId === userId) {
    throw new FriendError("Nie możesz zaprosić samego siebie", 400);
  }

  const existing = await prisma.friendRequest.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: targetCharacter.userId },
        { requesterId: targetCharacter.userId, addresseeId: userId },
      ],
    },
  });

  if (existing?.status === "accepted") {
    throw new FriendError("Jesteście już znajomymi", 409);
  }
  if (existing?.status === "pending" && existing.requesterId === userId) {
    throw new FriendError("Zaproszenie zostało już wysłane", 409);
  }
  if (existing?.status === "pending" && existing.requesterId === targetCharacter.userId) {
    // They already invited us — accept theirs instead of creating a mirrored duplicate.
    await prisma.friendRequest.update({ where: { id: existing.id }, data: { status: "accepted" } });
    await logAction({ module: "friends", action: "accept", actorUserId: userId, requestId, payload: { requestId: existing.id } });
    return { status: "accepted" as const };
  }

  const created = await prisma.friendRequest.create({
    data: { requesterId: userId, addresseeId: targetCharacter.userId, status: "pending" },
  });
  await logAction({
    module: "friends",
    action: "request",
    actorUserId: userId,
    requestId,
    payload: { friendRequestId: created.id, targetCharacterName: targetCharacter.name },
  });
  return { status: "pending" as const };
}

export async function respondToFriendRequest(
  userId: string,
  friendRequestId: string,
  accept: boolean,
  requestId?: string,
) {
  const request = await prisma.friendRequest.findUnique({ where: { id: friendRequestId } });
  if (!request || request.addresseeId !== userId || request.status !== "pending") {
    throw new FriendError("Nie znaleziono zaproszenia", 404);
  }

  if (accept) {
    await prisma.friendRequest.update({ where: { id: friendRequestId }, data: { status: "accepted" } });
  } else {
    // Deleted (not marked "declined") so the unique constraint doesn't block a future re-invite.
    await prisma.friendRequest.delete({ where: { id: friendRequestId } });
  }

  await logAction({
    module: "friends",
    action: accept ? "accept" : "decline",
    actorUserId: userId,
    requestId,
    payload: { friendRequestId },
  });
}

export async function removeFriend(userId: string, otherUserId: string, requestId?: string) {
  const deleted = await prisma.friendRequest.deleteMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: otherUserId },
        { requesterId: otherUserId, addresseeId: userId },
      ],
    },
  });
  if (deleted.count === 0) throw new FriendError("Nie znaleziono relacji ze znajomym", 404);

  await logAction({ module: "friends", action: "remove", actorUserId: userId, requestId, payload: { otherUserId } });
}

export async function cancelOutgoingRequest(userId: string, friendRequestId: string, requestId?: string) {
  const request = await prisma.friendRequest.findUnique({ where: { id: friendRequestId } });
  if (!request || request.requesterId !== userId || request.status !== "pending") {
    throw new FriendError("Nie znaleziono zaproszenia", 404);
  }
  await prisma.friendRequest.delete({ where: { id: friendRequestId } });
  await logAction({ module: "friends", action: "cancel", actorUserId: userId, requestId, payload: { friendRequestId } });
}

export async function listFriends(userId: string) {
  const rows = await prisma.friendRequest.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: {
      requester: { select: { id: true, lastSeenAt: true } },
      addressee: { select: { id: true, lastSeenAt: true } },
    },
  });

  const friends: {
    userId: string;
    characterId: string | null;
    characterName: string | null;
    characterLevel: number | null;
    className: string | null;
    online: boolean;
  }[] = [];
  const incoming: {
    friendRequestId: string;
    userId: string;
    characterId: string | null;
    characterName: string | null;
    createdAt: string;
  }[] = [];
  const outgoing: {
    friendRequestId: string;
    userId: string;
    characterId: string | null;
    characterName: string | null;
    createdAt: string;
  }[] = [];

  for (const row of rows) {
    const otherIsRequester = row.requesterId !== userId;
    const other = otherIsRequester ? row.requester : row.addressee;
    const character = await representativeCharacter(other.id);

    if (row.status === "accepted") {
      friends.push({
        userId: other.id,
        characterId: character?.id ?? null,
        characterName: character?.name ?? null,
        characterLevel: character?.level ?? null,
        className: character?.class?.name ?? null,
        online: isOnline(other.lastSeenAt),
      });
    } else if (row.status === "pending" && row.addresseeId === userId) {
      incoming.push({
        friendRequestId: row.id,
        userId: other.id,
        characterId: character?.id ?? null,
        characterName: character?.name ?? null,
        createdAt: row.createdAt.toISOString(),
      });
    } else if (row.status === "pending" && row.requesterId === userId) {
      outgoing.push({
        friendRequestId: row.id,
        userId: other.id,
        characterId: character?.id ?? null,
        characterName: character?.name ?? null,
        createdAt: row.createdAt.toISOString(),
      });
    }
  }

  return { friends, incoming, outgoing };
}
