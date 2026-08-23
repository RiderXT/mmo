import type { Prisma } from "@prisma/client";
import type { ReferralSettings } from "@mmo/shared";
import { prisma } from "./prismaClient.js";
import { logAction } from "./gameLog.js";
import { getReferralSettings } from "../modules/settings/service.js";
import { addLootToInventory } from "../modules/inventory/service.js";

type Tx = Prisma.TransactionClient;

async function grantReward(tx: Tx, characterId: string, settings: ReferralSettings) {
  if (settings.rewardKind === "gold") {
    await tx.character.update({ where: { id: characterId }, data: { gold: { increment: settings.goldAmount } } });
  } else if (settings.rewardKind === "item" && settings.itemId) {
    // allowPartial, and deliberately NOT thrown on overflow (unlike expedition/gathering) — this
    // runs as a side effect of another character's action (e.g. the REFERRER's bag, while the
    // REFERRED character is the one claiming an expedition) and must never fail that unrelated
    // caller's request. Still logged so an overflow here is diagnosable, not silently lost.
    const { overflow } = await addLootToInventory(tx, characterId, settings.itemId, settings.itemQuantity, {
      allowPartial: true,
    });
    if (overflow > 0) {
      await logAction({
        module: "referral",
        level: "warn",
        action: "reward_overflow",
        actorCharacterId: characterId,
        payload: { itemId: settings.itemId, overflow },
      });
    }
  }
}

/**
 * Pays out the referral reward for `characterId`'s referral, if one exists, is unpaid, and the
 * character now meets referral.settings' requiredLevel. Called from registerUser (immediately,
 * for requiredLevel<=1) and from expeditions/service.ts on every level-up. Safe to call
 * speculatively — it's a no-op if there's no matching unpaid Referral or the level isn't met yet.
 */
export async function tryPayReferralReward(characterId: string, tx: Tx = prisma): Promise<void> {
  const character = await tx.character.findUnique({ where: { id: characterId } });
  if (!character) return;

  const referral = await tx.referral.findUnique({ where: { referredId: character.userId } });
  if (!referral || referral.rewardedAt) return;

  const settings = await getReferralSettings();
  if (settings.rewardKind === "none") return;
  if (character.level < settings.requiredLevel) return;

  if (settings.target === "referred" || settings.target === "both") {
    await grantReward(tx, character.id, settings);
  }

  if (settings.target === "referrer" || settings.target === "both") {
    const referrerCharacter = await tx.character.findFirst({
      where: { userId: referral.referrerId },
      orderBy: { createdAt: "asc" },
    });
    if (referrerCharacter) {
      await grantReward(tx, referrerCharacter.id, settings);
    } else {
      await logAction({
        module: "referral",
        level: "warn",
        action: "reward_skipped_no_character",
        actorUserId: referral.referrerId,
        payload: { referralId: referral.id },
      });
    }
  }

  await tx.referral.update({ where: { id: referral.id }, data: { rewardedAt: new Date() } });

  await logAction({
    module: "referral",
    action: "reward_paid",
    actorUserId: character.userId,
    actorCharacterId: character.id,
    payload: { referralId: referral.id, ...settings },
  });
}
