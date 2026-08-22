import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { logAction } from "../../../lib/gameLog.js";
import { getBotsMaxConcurrent } from "../../settings/service.js";

/** Spawns real `scripts/bot/run.ts` child processes (see apps/api/scripts/bot/README.md) against
 * this server's own localhost port — same HTTP+auth path as a real browser, just triggered from
 * the admin panel instead of a terminal. Deliberately in-memory/ephemeral (not persisted): these
 * are operational test runs, not game data, and don't need to survive a server restart. */

export class BotError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

interface BotRun {
  id: string;
  name: string;
  className: string;
  targetLevel: number;
  status: "running" | "completed" | "failed" | "stopped";
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  logLines: string[];
}

const MAX_LOG_LINES = 1000;
const runs = new Map<string, BotRun>();
const processes = new Map<string, ChildProcess>();

function countRunning(): number {
  let n = 0;
  for (const run of runs.values()) if (run.status === "running") n += 1;
  return n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendLog(run: BotRun, text: string) {
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    run.logLines.push(line);
  }
  while (run.logLines.length > MAX_LOG_LINES) run.logLines.shift();
}

export async function launchBots(
  input: { count: number; className: string; targetLevel: number; maxMinutes: number },
  actorUserId: string,
  requestId?: string,
): Promise<BotRun[]> {
  const maxConcurrent = await getBotsMaxConcurrent();
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > maxConcurrent) {
    throw new BotError(`Liczba botów musi być całkowita, między 1 a ${maxConcurrent}`, 400);
  }
  if (countRunning() + input.count > maxConcurrent) {
    throw new BotError(
      `Zbyt wiele botów naraz — obecnie działa ${countRunning()}, limit łączny to ${maxConcurrent}`,
      400,
    );
  }

  const port = process.env.PORT ?? "4000";
  const baseUrl = `http://127.0.0.1:${port}`;
  const launched: BotRun[] = [];

  for (let i = 0; i < input.count; i++) {
    const id = crypto.randomUUID();
    const name = `AdminBot${Date.now().toString(36)}${i}`;
    const run: BotRun = {
      id,
      name,
      className: input.className,
      targetLevel: input.targetLevel,
      status: "running",
      startedAt: new Date().toISOString(),
      endedAt: null,
      exitCode: null,
      logLines: [],
    };

    // node_modules/.bin/tsx directly (not "npx tsx") — npx spawns its own child to resolve the
    // package before delegating, so with N bots launched at once that was silently 2N processes
    // starting their JS/TS runtime simultaneously, doubling the CPU/memory spike for no benefit
    // (tsx is already a workspace dependency, nothing to resolve). shell:true still lets this
    // resolve tsx.CMD on Windows dev and the posix shebang script on Linux prod without branching.
    const child = spawn("node_modules/.bin/tsx", ["scripts/bot/run.ts"], {
      cwd: process.cwd(),
      shell: true,
      env: {
        ...process.env,
        BOT_BASE_URL: baseUrl,
        BOT_NAME: name,
        BOT_CLASS: input.className,
        BOT_TARGET_LEVEL: String(input.targetLevel),
        BOT_MAX_MINUTES: String(input.maxMinutes),
      },
    });

    child.stdout?.on("data", (chunk: Buffer) => appendLog(run, chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => appendLog(run, chunk.toString()));
    child.on("exit", (code) => {
      run.status = code === 0 ? "completed" : run.status === "stopped" ? "stopped" : "failed";
      run.exitCode = code;
      run.endedAt = new Date().toISOString();
      // Persisted to GameLog (DB), unlike `runs` — survives a server restart, so a crash that
      // wipes the in-memory run list (e.g. systemd restarting the whole API + child cgroup after
      // an overload crash) still leaves a trail of which bots actually finished vs. got cut off.
      void logAction({
        module: "admin:bots",
        action: "exit",
        actorUserId,
        requestId,
        payload: { id, name: run.name, status: run.status, exitCode: code },
      });
    });
    child.on("error", (err) => {
      run.status = "failed";
      run.endedAt = new Date().toISOString();
      appendLog(run, `[spawn error] ${err.message}`);
    });

    runs.set(id, run);
    processes.set(id, child);
    launched.push(run);

    // Stagger launches instead of firing all N at once — each bot spins up its own tsx/Node
    // runtime, so launching e.g. 20 simultaneously spikes CPU/memory hard enough to be a
    // plausible cause of a real production crash (server restart wipes this whole run list, see
    // docstring above). 250ms/bot spreads that spike without meaningfully changing total runtime
    // for a test that's expected to take many minutes anyway.
    if (i < input.count - 1) await sleep(250);
  }

  await logAction({
    module: "admin:bots",
    action: "launch",
    actorUserId,
    requestId,
    payload: { count: input.count, className: input.className, targetLevel: input.targetLevel, maxMinutes: input.maxMinutes, baseUrl },
  });

  return launched;
}

export function listBotRuns(): Omit<BotRun, "logLines">[] {
  return Array.from(runs.values())
    .map(({ logLines: _logLines, ...rest }) => rest)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getBotLog(id: string): BotRun {
  const run = runs.get(id);
  if (!run) throw new BotError("Nie znaleziono tego przebiegu bota", 404);
  return run;
}

export function stopBot(id: string, actorUserId: string, requestId?: string): void {
  const run = runs.get(id);
  const child = processes.get(id);
  if (!run || !child) throw new BotError("Nie znaleziono tego przebiegu bota", 404);
  if (run.status !== "running") throw new BotError("Ten bot już się nie wykonuje", 409);
  run.status = "stopped";
  child.kill();
  void logAction({ module: "admin:bots", action: "stop", actorUserId, requestId, payload: { id, name: run.name } });
}
