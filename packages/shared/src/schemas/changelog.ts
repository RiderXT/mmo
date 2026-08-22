import { z } from "zod";

export const CreateChangelogEntrySchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
});
export type CreateChangelogEntryInput = z.infer<typeof CreateChangelogEntrySchema>;

export const UpdateChangelogEntrySchema = CreateChangelogEntrySchema;
export type UpdateChangelogEntryInput = z.infer<typeof UpdateChangelogEntrySchema>;
