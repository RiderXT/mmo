import { z } from "zod";

export const SendFriendRequestSchema = z.object({
  targetCharacterName: z.string().trim().min(1).max(20),
});
export type SendFriendRequestInput = z.infer<typeof SendFriendRequestSchema>;
