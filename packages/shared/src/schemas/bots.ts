import { z } from "zod";

// Admin-triggered bot launches (see apps/api/scripts/bot/) — playtesting/load-testing tool, not a
// player-facing feature. Hard cap matches the server-side MAX_CONCURRENT safety limit.
export const LaunchBotsSchema = z.object({
  count: z.number().int().min(1).max(20),
  className: z.string().min(1),
  targetLevel: z.number().int().min(2).max(200).default(10),
  // The bot's real stopping condition is targetLevel — this is just a safety cap on top, since
  // higher targets take longer per level in ways that are hard to guess up front. 0 = no time
  // limit at all (bot only stops at targetLevel or the server-side max-expeditions backstop).
  maxMinutes: z.number().int().min(0).max(10080).default(0),
});
export type LaunchBotsInput = z.infer<typeof LaunchBotsSchema>;
