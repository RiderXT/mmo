/** Shared by readBook (passiveSkills/service.ts) and readSkillBook (characters/service.ts) — both
 * gate a book read attempt behind Item.bookCooldownSeconds, tracked per InventoryItem stack via
 * lastReadAt. Returns remaining seconds if the read should be blocked, or null if it's allowed.
 * Doesn't mutate anything — callers set lastReadAt themselves inside their own transaction, on
 * EVERY attempt (success or failure) once past this check, per project convention: a failed read
 * still starts the cooldown, same as a successful one. */
export function checkBookCooldown(
  inventoryItem: { lastReadAt: Date | null },
  item: { bookCooldownSeconds: number | null },
): number | null {
  if (item.bookCooldownSeconds == null || !inventoryItem.lastReadAt) return null;
  const elapsedSec = (Date.now() - inventoryItem.lastReadAt.getTime()) / 1000;
  if (elapsedSec >= item.bookCooldownSeconds) return null;
  return Math.ceil(item.bookCooldownSeconds - elapsedSec);
}
