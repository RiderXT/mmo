import type { LogLevel } from "@mmo/shared";
import { prisma } from "./prismaClient.js";
import { rootLogger } from "./logger.js";

export interface LogActionInput {
  module: string;
  action: string;
  level?: LogLevel;
  actorUserId?: string | null;
  actorCharacterId?: string | null;
  payload?: unknown;
  requestId?: string | null;
}

/**
 * Records a single domain action both to the structured console logger (for live
 * tailing / ops) and to the GameLog table (for the in-admin filterable log viewer).
 * Call this from every module's service layer on every meaningful write/action so
 * that "each move" is traceable and errors can be isolated per module.
 */
export async function logAction(input: LogActionInput): Promise<void> {
  const level = input.level ?? "info";
  const payload = input.payload ?? {};

  rootLogger[level](
    {
      module: input.module,
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      actorCharacterId: input.actorCharacterId ?? null,
      payload,
    },
    `${input.module}:${input.action}`,
  );

  try {
    await prisma.gameLog.create({
      data: {
        module: input.module,
        action: input.action,
        level,
        actorUserId: input.actorUserId ?? null,
        actorCharacterId: input.actorCharacterId ?? null,
        payload: JSON.stringify(payload),
        requestId: input.requestId ?? null,
      },
    });
  } catch (err) {
    // Never let logging failures break the actual game action.
    rootLogger.error({ err }, "Failed to persist GameLog entry");
  }
}
