import { z } from "zod";

// Admin-triggered bot launches (see apps/api/scripts/bot/) — playtesting/load-testing tool, not a
// player-facing feature. Hard cap matches the server-side MAX_CONCURRENT safety limit.
export const LaunchBotsSchema = z.object({
  count: z.number().int().min(1).max(20),
  className: z.string().min(1),
  targetLevel: z.number().int().min(2).max(200).default(10),
  maxMinutes: z.number().int().min(1).max(600).default(60),
});
export type LaunchBotsInput = z.infer<typeof LaunchBotsSchema>;
