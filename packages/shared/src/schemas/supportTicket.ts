import { z } from "zod";

export const TicketStatusSchema = z.enum(["open", "in_progress", "resolved", "closed"]);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const CreateTicketSchema = z.object({
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(4000),
});
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

export const ReplyToTicketSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type ReplyToTicketInput = z.infer<typeof ReplyToTicketSchema>;

export const UpdateTicketStatusSchema = z.object({
  status: TicketStatusSchema,
});
export type UpdateTicketStatusInput = z.infer<typeof UpdateTicketStatusSchema>;
