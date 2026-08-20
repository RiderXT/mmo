/** CLI entrypoint: node --import tsx scripts/bot/run.ts (or `npx tsx scripts/bot/run.ts`),
 * run from apps/api/. Config via env vars, all optional:
 *
 *   BOT_BASE_URL      default http://localhost:4000 — NEVER point this at the production VPS
 *                      without deliberately deciding to (real HTTP load against a real server).
 *   BOT_NAME          default Bot<timestamp> — also becomes the character name and the bot's
 *                      throwaway login email (<name>@bot.test.local).
 *   BOT_CLASS         default Wojownik — must match a CharacterClass.name exactly (see /api/classes).
 *   BOT_TARGET_LEVEL  default 10 — the bot's real stopping condition; it keeps going until it
 *                      gets here regardless of how long that takes (higher levels take longer
 *                      fights — don't guess a time budget for a target you haven't measured yet).
 *   BOT_MAX_MINUTES   default 60 — safety cap so a stuck/looping bot can't run forever. Set to 0
 *                      for NO time limit — the bot then only stops at BOT_TARGET_LEVEL or
 *                      BOT_MAX_EXPEDITIONS, whichever comes first.
 *   BOT_MAX_EXPEDITIONS default 200 — second independent safety cap (always active, even with
 *                      BOT_MAX_MINUTES=0 — a real backstop against a truly runaway/stuck bot).
 *
 * Writes both a human-readable Markdown report and a machine-readable JSON dump to
 * scripts/bot/reports/<name>-<timestamp>.{md,json} (gitignored — this is test output, not source).
 */
import fs from "node:fs";
import path from "node:path";
import { runBot } from "./policy.js";

const baseUrl = process.env.BOT_BASE_URL ?? "http://localhost:4000";
const botName = process.env.BOT_NAME ?? `Bot${Date.now().toString(36)}`;
const className = process.env.BOT_CLASS ?? "Wojownik";
const targetLevel = Number(process.env.BOT_TARGET_LEVEL ?? 10);
const maxMinutes = Number(process.env.BOT_MAX_MINUTES ?? 60);
const maxExpeditions = Number(process.env.BOT_MAX_EXPEDITIONS ?? 200);

console.log(
  `Start bota "${botName}" (${className}) przeciw ${baseUrl}, cel: poziom ${targetLevel}` +
    (maxMinutes > 0 ? `, limit czasu: ${maxMinutes} min` : ", bez limitu czasu"),
);
if (/riderx\.ovh|gra\./i.test(baseUrl)) {
  console.log("!! UWAGA: BOT_BASE_URL wygląda na środowisko produkcyjne — to prawdziwe obciążenie żywego serwera.");
}

const report = await runBot({
  baseUrl,
  botName,
  className,
  targetLevel,
  maxWallClockMs: maxMinutes > 0 ? maxMinutes * 60_000 : Infinity,
  maxExpeditions,
});

const reportsDir = path.join(import.meta.dirname, "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const mdPath = path.join(reportsDir, `${botName}-${stamp}.md`);
const jsonPath = path.join(reportsDir, `${botName}-${stamp}.json`);
fs.writeFileSync(mdPath, report.toMarkdown());
fs.writeFileSync(jsonPath, JSON.stringify(report.toJson(), null, 2));

console.log(`\nRaport zapisany: ${mdPath}`);
console.log(`Raport (JSON): ${jsonPath}`);
