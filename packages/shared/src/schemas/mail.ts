import { z } from "zod";

export const SendMessageSchema = z.object({
  recipientCharacterName: z.string().trim().min(1).max(20),
  body: z.string().trim().min(1).max(3000),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
