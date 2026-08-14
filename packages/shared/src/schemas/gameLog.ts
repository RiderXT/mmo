import { z } from "zod";
import { LogLevelSchema } from "./enums.js";

export const GameLogFilterSchema = z.object({
  module: z.string().trim().max(60).optional(),
  level: LogLevelSchema.optional(),
  actorUserId: z.string().optional(),
  search: z.string().trim().max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type GameLogFilter = z.infer<typeof GameLogFilterSchema>;

export const GameLogEntrySchema = z.object({
  id: z.string(),
  module: z.string(),
  level: LogLevelSchema,
  action: z.string(),
  actorUserId: z.string().nullable(),
  actorCharacterId: z.string().nullable(),
  payload: z.unknown(),
  requestId: z.string().nullable(),
  createdAt: z.string(),
});
export type GameLogEntry = z.infer<typeof GameLogEntrySchema>;
