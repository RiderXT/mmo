import { z } from "zod";

// startsAt/endsAt come from an HTML <input type="datetime-local"> ("2026-08-20T10:00", no
// timezone/seconds) or an already-ISO string — accept any string `new Date()` can parse rather
// than requiring strict ISO 8601, and validate parseability explicitly.
const dateTimeString = z.string().refine((val) => !Number.isNaN(new Date(val).getTime()), {
  message: "Nieprawidłowa data",
});

export const CreateGameEventSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    expMultiplier: z.number().min(1).max(20),
    goldMultiplier: z.number().min(1).max(20),
    startsAt: dateTimeString,
    endsAt: dateTimeString,
    // Optional: one item that drops from EVERY zone while this event is active, independently
    // of each zone's own drop table (e.g. a limited-time "event chest").
    bonusDropItemId: z.string().nullable().optional(),
    bonusDropChance: z.number().min(0).max(1).default(0),
  })
  .refine((val) => new Date(val.endsAt).getTime() > new Date(val.startsAt).getTime(), {
    message: "Koniec eventu musi być po jego starcie",
    path: ["endsAt"],
  });
export type CreateGameEventInput = z.infer<typeof CreateGameEventSchema>;

export const UpdateGameEventSchema = CreateGameEventSchema;
export type UpdateGameEventInput = z.infer<typeof UpdateGameEventSchema>;
