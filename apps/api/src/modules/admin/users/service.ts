import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";

export class AdminUserError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      lastSeenAt: true,
      deletionRequestedAt: true,
      _count: { select: { characters: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
    deletionRequestedAt: u.deletionRequestedAt?.toISOString() ?? null,
    characterCount: u._count.characters,
  }));
}

/** Hard-deletes a user and everything owned by it (characters, inventory, expeditions,
 * refresh tokens, friend requests, referrals — all cascade at the DB level, see
 * prisma/schema.prisma's `onDelete: Cascade` on every relation pointing at User/Character).
 * Immediate, no grace period — unlike the player-facing self-service request in modules/auth,
 * which waits 30 days before purging. Admin action, deliberately irreversible on confirmation. */
export async function deleteUser(id: string, actorUserId: string, requestId?: string): Promise<void> {
  if (id === actorUserId) {
    throw new AdminUserError("Nie możesz usunąć własnego konta z tego panelu", 400);
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AdminUserError("Nie znaleziono konta", 404);

  await prisma.user.delete({ where: { id } });

  await logAction({
    module: "admin:users",
    action: "delete",
    actorUserId,
    requestId,
    payload: { deletedUserId: id, deletedEmail: user.email },
  });
}
