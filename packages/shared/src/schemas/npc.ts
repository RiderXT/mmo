import { z } from "zod";

export const NpcKindSchema = z.enum(["merchant"]);
export type NpcKind = z.infer<typeof NpcKindSchema>;

export const NpcShopItemInputSchema = z.object({
  itemId: z.string(),
  goldPrice: z.number().int().min(0).max(1_000_000),
  // null/undefined = nieograniczony zapas.
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
});
export type NpcShopItemInput = z.infer<typeof NpcShopItemInputSchema>;

export const CreateNpcSchema = z.object({
  zoneId: z.string(),
  name: z.string().trim().min(2).max(60),
  kind: NpcKindSchema.default("merchant"),
  shopItems: z.array(NpcShopItemInputSchema).default([]),
});
export type CreateNpcInput = z.infer<typeof CreateNpcSchema>;

export const UpdateNpcSchema = CreateNpcSchema;
export type UpdateNpcInput = z.infer<typeof UpdateNpcSchema>;

export const BuyFromNpcSchema = z.object({
  npcShopItemId: z.string(),
  quantity: z.number().int().min(1).max(999).default(1),
});
export type BuyFromNpcInput = z.infer<typeof BuyFromNpcSchema>;
