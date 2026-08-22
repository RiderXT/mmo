import { z } from "zod";

export const SendMessageSchema = z.object({
  recipientCharacterName: z.string().trim().min(1).max(20),
  subject: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(3000),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
