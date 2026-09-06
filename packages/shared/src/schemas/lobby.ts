import { z } from "zod";
import { CombatRoleSchema } from "./enums.js";

// One row per (memberCount, uniqueClassCount) combination — no matching row = 0% bonus, so an
// admin can leave untiered combos (e.g. 3 members, 2 unique classes) unrewarded on purpose.
export const LobbyBonusTierSchema = z.object({
  memberCount: z.number().int().min(2).max(3),
  uniqueClassCount: z.number().int().min(1).max(3),
  expBonusPct: z.number().min(0).max(5),
});
export type LobbyBonusTier = z.infer<typeof LobbyBonusTierSchema>;

// Stored under Settings.key "lobby.settings" — see modules/settings/service.ts, same
// get/set-with-fallback-to-default pattern as ReferralSettingsSchema.
export const LobbySettingsSchema = z.object({
  maxMembers: z.number().int().min(2).max(3).default(3),
  // Concurrent monster "slots" fighting the lobby at once, flat regardless of lobby size — solo
  // combat is always exactly 1 monster at a time, so the default of 2 matches "podwójna ilość
  // potworów przy walce w 2 osoby" literally. See lobbyCombat.ts.
  monsterConcurrency: z.number().int().min(1).max(10).default(2),
  // Extra concurrent monster slots added PER lure-role member present, on top of
  // monsterConcurrency — all of them (base + lure-added) target only "dps"-role members.
  lureExtraMonsterSlotsPerLureMember: z.number().int().min(0).max(10).default(1),
  bonusTiers: z
    .array(LobbyBonusTierSchema)
    .default([
      { memberCount: 2, uniqueClassCount: 1, expBonusPct: 0.1 },
      { memberCount: 2, uniqueClassCount: 2, expBonusPct: 0.15 },
      { memberCount: 3, uniqueClassCount: 3, expBonusPct: 0.2 },
    ]),
});
export type LobbySettings = z.infer<typeof LobbySettingsSchema>;

export const CreateLobbySchema = z.object({
  characterId: z.string(),
  zoneId: z.string(),
});
export type CreateLobbyInput = z.infer<typeof CreateLobbySchema>;

export const JoinLobbySchema = z.object({ characterId: z.string() });
export type JoinLobbyInput = z.infer<typeof JoinLobbySchema>;

export const KickLobbyMemberSchema = z.object({
  characterId: z.string(),
  targetCharacterId: z.string(),
});
export type KickLobbyMemberInput = z.infer<typeof KickLobbyMemberSchema>;

export const SetLobbyReadySchema = z.object({
  characterId: z.string(),
  ready: z.boolean(),
});
export type SetLobbyReadyInput = z.infer<typeof SetLobbyReadySchema>;

export const StartLobbyExpeditionSchema = z.object({
  characterId: z.string(),
  selectedMonsterIds: z.array(z.string()).default([]),
});
export type StartLobbyExpeditionInput = z.infer<typeof StartLobbyExpeditionSchema>;

export const LobbyMemberDtoSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  level: z.number().int(),
  classId: z.string().nullable(),
  className: z.string().nullable(),
  combatRole: CombatRoleSchema,
  ready: z.boolean(),
  isLeader: z.boolean(),
});
export type LobbyMemberDto = z.infer<typeof LobbyMemberDtoSchema>;

export const LobbyDtoSchema = z.object({
  id: z.string(),
  zoneId: z.string(),
  status: z.enum(["forming", "in_progress", "completed", "disbanded"]),
  maxMembers: z.number().int(),
  leaderCharacterId: z.string(),
  members: z.array(LobbyMemberDtoSchema),
  activeLobbyExpeditionId: z.string().nullable(),
});
export type LobbyDto = z.infer<typeof LobbyDtoSchema>;
