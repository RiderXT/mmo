const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

/** "Online" is derived, not stored — true when the owning account's lastSeenAt heartbeat
 * (bumped fire-and-forget by requireAuth on every authenticated request) is recent enough. */
export function isOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < ONLINE_THRESHOLD_MS;
}
