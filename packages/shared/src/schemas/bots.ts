import { z } from "zod";

// Admin-triggered bot launches (see apps/api/scripts/bot/) — playtesting/load-testing tool, not a
// player-facing feature. 500 here is only the absolute static ceiling this schema can express —
// the REAL, admin-adjustable limit (default 20) is enforced dynamically in
// modules/admin/bots/service.ts against modules/settings' bots.maxConcurrent setting.
export const LaunchBotsSchema = z.object({
  count: z.number().int().min(1).max(500),
  className: z.string().min(1),
  targetLevel: z.number().int().min(2).max(200).default(10),
  // The bot's real stopping condition is targetLevel — this is just a safety cap on top, since
  // higher targets take longer per level in ways that are hard to guess up front. 0 = no time
  // limit at all (bot only stops at targetLevel or the server-side max-expeditions backstop).
  maxMinutes: z.number().int().min(0).max(10080).default(0),
});
export type LaunchBotsInput = z.infer<typeof LaunchBotsSchema>;
