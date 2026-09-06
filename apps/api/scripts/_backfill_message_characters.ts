/**
 * ONE-OFF DATA MIGRATION — run manually once after deploying the per-character mail schema
 * change, NOT wired into deploy.sh. Before this change, Message.senderCharacterId/
 * recipientCharacterId didn't exist, so every message sent before the deploy has both fields
 * null. Since mail is now scoped by character (see docs/architecture.md, "Poczta per postac..."),
 * those old rows would otherwise be invisible from every character's mailbox.
 *
 * We can't know for certain which of an account's characters actually sent/received an old
 * message (that context was never recorded). Best-effort fallback, consistent with the same
 * heuristic already used elsewhere in the app (friends list, profile display) for "the character
 * that represents this account": the account's highest-level character. For an account with only
 * one character this is exact, not a guess.
 *
 * Safe to run more than once — only touches rows where the character id is still null.
 *
 * Run once, from apps/api: `npx tsx scripts/_backfill_message_characters.ts`
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function representativeCharacterId(userId: string): Promise<string | null> {
  const character = await prisma.character.findFirst({
    where: { userId },
    orderBy: { level: "desc" },
    select: { id: true },
  });
  return character?.id ?? null;
}

async function main() {
  const pending = await prisma.message.findMany({
    where: { OR: [{ senderCharacterId: null }, { recipientCharacterId: null }] },
    select: { id: true, senderId: true, recipientId: true },
  });

  if (pending.length === 0) {
    console.log("Brak wiadomosci do uzupelnienia - nic do zrobienia.");
    return;
  }

  console.log(`Znaleziono ${pending.length} wiadomosci bez przypisanej postaci.`);

  const userIds = Array.from(new Set(pending.flatMap((m) => [m.senderId, m.recipientId])));
  const characterIdByUser = new Map<string, string | null>();
  for (const userId of userIds) {
    characterIdByUser.set(userId, await representativeCharacterId(userId));
  }

  let updated = 0;
  let skipped = 0;
  for (const message of pending) {
    const senderCharacterId = characterIdByUser.get(message.senderId) ?? null;
    const recipientCharacterId = characterIdByUser.get(message.recipientId) ?? null;
    if (!senderCharacterId || !recipientCharacterId) {
      // Account has no characters at all (e.g. deleted) - leave null, nothing sensible to backfill.
      skipped++;
      continue;
    }
    await prisma.message.update({
      where: { id: message.id },
      data: { senderCharacterId, recipientCharacterId },
    });
    updated++;
  }

  console.log(`Uzupelniono ${updated} wiadomosci. Pominieto ${skipped} (konto bez zadnej postaci).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
