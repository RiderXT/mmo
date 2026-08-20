import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { logAction } from "../../../lib/gameLog.js";

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

const MAX_CONCURRENT = 20;
const MAX_LOG_LINES = 1000;
const runs = new Map<string, BotRun>();
const processes = new Map<string, ChildProcess>();

function countRunning(): number {
  let n = 0;
  for (const run of runs.values()) if (run.status === "running") n += 1;
  return n;
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
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > MAX_CONCURRENT) {
    throw new BotError(`Liczba botów musi być całkowita, między 1 a ${MAX_CONCURRENT}`, 400);
  }
  if (countRunning() + input.count > MAX_CONCURRENT) {
    throw new BotError(
      `Zbyt wiele botów naraz — obecnie działa ${countRunning()}, limit łączny to ${MAX_CONCURRENT}`,
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

    // shell:true so this resolves npx.cmd on Windows dev and npx on Linux prod without branching.
    const child = spawn("npx", ["tsx", "scripts/bot/run.ts"], {
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
    });
    child.on("error", (err) => {
      run.status = "failed";
      run.endedAt = new Date().toISOString();
      appendLog(run, `[spawn error] ${err.message}`);
    });

    runs.set(id, run);
    processes.set(id, child);
    launched.push(run);
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
