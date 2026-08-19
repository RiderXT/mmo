import { apiFetch } from "./apiClient";

export interface DailyLoginRewardEntry {
  day: number;
  type: "gold" | "exp";
  amount: number;
}

export interface DailyLoginStatusDto {
  today: {
    periodKey: string;
    cycleDay: number;
    streak: number;
    rewardType: "gold" | "exp";
    rewardAmount: number;
    claimed: boolean;
  };
  rewards: DailyLoginRewardEntry[];
}

export interface DailyLoginClaimResultDto {
  record: {
    id: string;
    periodKey: string;
    cycleDay: number;
    streak: number;
    rewardType: "gold" | "exp";
    rewardAmount: number;
    claimedAt: string | null;
  };
  leveledUp: boolean;
  newLevel: number;
  goldGained: number;
  expGained: number;
}

export const getDailyLoginStatus = (characterId: string) =>
  apiFetch<DailyLoginStatusDto>(`/api/daily-login/${characterId}`);

export const claimDailyLoginReward = (characterId: string) =>
  apiFetch<DailyLoginClaimResultDto>(`/api/daily-login/${characterId}/claim`, { method: "POST" });
