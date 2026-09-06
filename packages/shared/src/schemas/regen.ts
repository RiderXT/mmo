import { z } from "zod";

/** Base rates for the passive HP/mana regen tick in combat (see simulateExpedition in combat.ts)
 * — every intervalSeconds, the character regenerates pct% of that pool's max. Character stats
 * hpRegenPct/manaRegenPct scale the PER-TICK amount, hpRegenSpeedPct/manaRegenSpeedPct shorten the
 * interval (more frequent ticks, not bigger ones) — see StatKeySchema's regen stats for the exact
 * split. Defaults reproduce the mana regen rate this game already had before these stats existed
 * (0.1%/s continuous ≈ 0.5% every 5s) so introducing this doesn't silently reshape existing
 * balance; HP had no passive regen at all before, so its default is a new, modest baseline. */
export const RegenSettingsSchema = z.object({
  baseHpRegenPct: z.number().min(0).max(1).default(0.02),
  baseHpRegenIntervalSeconds: z.number().int().min(1).max(3600).default(5),
  baseManaRegenPct: z.number().min(0).max(1).default(0.005),
  baseManaRegenIntervalSeconds: z.number().int().min(1).max(3600).default(5),
});
export type RegenSettings = z.infer<typeof RegenSettingsSchema>;
