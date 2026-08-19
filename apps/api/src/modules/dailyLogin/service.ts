import { Prisma } from "@prisma/client";
import { computeLevel } from "@mmo/shared";
import { prisma } from "../../lib/prismaClient.js";
import { logAction } from "../../lib/gameLog.js";

export class DailyLoginError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

type RewardType = "gold" | "exp";

// Flat, easy-to-tune day-1..7 cycle. Not scaled by character level (same philosophy as a fixed
// early-game item drop) — an admin-configurable version can replace this later without changing
// the cycle/streak mechanics above it.
const DAILY_REWARDS: { type: RewardType; amount: number }[] = [
  { type: "gold", amount: 500 },
  { type: "gold", amount: 750 },
  { type: "exp", amount: 250 },
  { type: "gold", amount: 1000 },
  { type: "exp", amount: 500 },
  { type: "gold", amount: 1500 },
  { type: "gold", amount: 3000 },
];

function todayPeriodKey(): string {
  // en-CA formats as YYYY-MM-DD, which also sorts/parses correctly as a plain string/UTC date.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
}

function nextCycleState(
  previous: { periodKey: string; cycleDay: number; streak: number } | null,
): { cycleDay: number; streak: number } {
  if (!previous) return { cycleDay: 1, streak: 1 };
  const daysBetween = Math.round(
    (Date.parse(`${todayPeriodKey()}T00:00:00Z`) - Date.parse(`${previous.periodKey}T00:00:00Z`)) / 86_400_000,
  );
  if (daysBetween === 1) {
    return { cycleDay: previous.cycleDay === 7 ? 1 : previous.cycleDay + 1, streak: previous.streak + 1 };
  }
  // Any gap (or a non-positive delta, which shouldn't happen since todayKey is always the latest
  // possible periodKey) restarts the cycle.
  return { cycleDay: 1, streak: 1 };
}

async function assertOwnership(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character || character.userId !== userId) {
    throw new DailyLoginError("Nie znaleziono postaci", 404);
  }
  return character;
}

/** Idempotent — the first call on a given calendar day (Europe/Warsaw) for this character creates
 * today's reward row; every later call the same day just returns it. Guarded by the
 * (characterId, periodKey) unique constraint against a concurrent double-create race. */
export async function ensureDailyLoginReward(characterId: string) {
  const periodKey = todayPeriodKey();
  const existing = await prisma.characterDailyLoginReward.findUnique({
    where: { characterId_periodKey: { characterId, periodKey } },
  });
  if (existing) return existing;

  const previous = await prisma.characterDailyLoginReward.findFirst({
    where: { characterId },
    orderBy: { periodKey: "desc" },
  });
  const { cycleDay, streak } = nextCycleState(previous);
  const reward = DAILY_REWARDS[cycleDay - 1];

  try {
    return await prisma.characterDailyLoginReward.create({
      data: {
        characterId,
        periodKey,
        cycleDay,
        streak,
        rewardType: reward.type,
        rewardAmount: reward.amount,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.characterDailyLoginReward.findUniqueOrThrow({
        where: { characterId_periodKey: { characterId, periodKey } },
      });
    }
    throw err;
  }
}

export async function getDailyLoginStatus(characterId: string, userId: string) {
  await assertOwnership(characterId, userId);
  const today = await ensureDailyLoginReward(characterId);
  return {
    today: {
      periodKey: today.periodKey,
      cycleDay: today.cycleDay,
      streak: today.streak,
      rewardType: today.rewardType as RewardType,
      rewardAmount: today.rewardAmount,
      claimed: today.claimedAt !== null,
    },
    rewards: DAILY_REWARDS.map((r, i) => ({ day: i + 1, type: r.type, amount: r.amount })),
  };
}

export async function claimDailyLoginReward(characterId: string, userId: string, requestId?: string) {
  const character = await assertOwnership(characterId, userId);
  const today = await ensureDailyLoginReward(characterId);

  if (today.claimedAt) {
    return { record: today, leveledUp: false, newLevel: character.level, goldGained: 0, expGained: 0 };
  }

  let leveledUp = false;
  let newLevel = character.level;
  let goldGained = 0;
  let expGained = 0;

  const record = await prisma.$transaction(async (tx) => {
    const claim = await tx.characterDailyLoginReward.updateMany({
      where: { id: today.id, claimedAt: null },
      data: { claimedAt: new Date() },
    });
    if (claim.count !== 1) {
      // Claimed concurrently by another request — report its final state, grant nothing here.
      return tx.characterDailyLoginReward.findUniqueOrThrow({ where: { id: today.id } });
    }

    if (today.rewardType === "gold") {
      goldGained = today.rewardAmount;
      await tx.character.update({ where: { id: characterId }, data: { gold: { increment: goldGained } } });
    } else {
      expGained = today.rewardAmount;
      const newExp = character.exp + expGained;
      newLevel = computeLevel(newExp);
      leveledUp = newLevel > character.level;
      const levelsGained = Math.max(0, newLevel - character.level);
      await tx.character.update({
        where: { id: characterId },
        data: {
          exp: newExp,
          level: newLevel,
          unspentStatPoints: { increment: levelsGained * 4 },
          unspentSkillPoints: { increment: levelsGained * 1 },
        },
      });
    }

    return tx.characterDailyLoginReward.findUniqueOrThrow({ where: { id: today.id } });
  });

  await logAction({
    module: "dailyLogin",
    action: "claim",
    actorUserId: userId,
    actorCharacterId: characterId,
    requestId,
    payload: {
      periodKey: today.periodKey,
      cycleDay: today.cycleDay,
      streak: today.streak,
      rewardType: today.rewardType,
      rewardAmount: today.rewardAmount,
      leveledUp,
      newLevel,
    },
  });

  return { record, leveledUp, newLevel, goldGained, expGained };
}
