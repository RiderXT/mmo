import { prisma } from "../../../lib/prismaClient.js";
import { logAction } from "../../../lib/gameLog.js";
import type { CreateChangelogEntryInput, UpdateChangelogEntryInput } from "@mmo/shared";

export class ChangelogError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

export function listChangelogEntriesAdmin() {
  return prisma.changelogEntry.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createChangelogEntry(
  input: CreateChangelogEntryInput,
  actorUserId: string,
  requestId?: string,
) {
  const entry = await prisma.changelogEntry.create({
    data: { title: input.title, body: input.body, authorUserId: actorUserId },
  });
  await logAction({
    module: "admin:changelog",
    action: "create",
    actorUserId,
    requestId,
    payload: { entryId: entry.id, title: entry.title },
  });
  return entry;
}

export async function updateChangelogEntry(
  id: string,
  input: UpdateChangelogEntryInput,
  actorUserId: string,
  requestId?: string,
) {
  const existing = await prisma.changelogEntry.findUnique({ where: { id } });
  if (!existing) throw new ChangelogError("Nie znaleziono wpisu", 404);

  const entry = await prisma.changelogEntry.update({
    where: { id },
    data: { title: input.title, body: input.body },
  });
  await logAction({
    module: "admin:changelog",
    action: "update",
    actorUserId,
    requestId,
    payload: { entryId: entry.id, title: entry.title },
  });
  return entry;
}

export async function deleteChangelogEntry(id: string, actorUserId: string, requestId?: string) {
  const existing = await prisma.changelogEntry.findUnique({ where: { id } });
  if (!existing) throw new ChangelogError("Nie znaleziono wpisu", 404);

  await prisma.changelogEntry.delete({ where: { id } });
  await logAction({
    module: "admin:changelog",
    action: "delete",
    actorUserId,
    requestId,
    payload: { entryId: id, title: existing.title },
  });
}
