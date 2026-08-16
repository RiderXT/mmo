import { prisma } from "../../lib/prismaClient.js";
import { isOnline } from "../../lib/presence.js";

/** Every character, ranked by level/exp — open to any authenticated player (no admin fields
 * like email/gold, unlike admin/characters' listAllCharacters). */
export async function listRanking(classId?: string) {
  const characters = await prisma.character.findMany({
    where: classId ? { classId } : undefined,
    include: { class: { select: { id: true, name: true } }, user: { select: { lastSeenAt: true } } },
    orderBy: [{ level: "desc" }, { exp: "desc" }],
  });

  return characters.map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    exp: c.exp,
    classId: c.classId,
    className: c.class?.name ?? null,
    online: isOnline(c.user.lastSeenAt),
  }));
}
