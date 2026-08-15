import { z } from "zod";

export const StartTravelSchema = z.object({
  characterId: z.string(),
  destinationZoneId: z.string().nullable(), // null = the village
});
export type StartTravelInput = z.infer<typeof StartTravelSchema>;
