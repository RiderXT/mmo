import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDailyLoginStatus, claimDailyLoginReward } from "../../lib/dailyLoginApi";
import { ApiError } from "../../lib/apiClient";
import { PanelFrame } from "../common/PanelFrame";

function formatReward(type: "gold" | "exp", amount: number): string {
  return type === "gold" ? `${amount.toLocaleString("pl-PL")} złota` : `${amount.toLocaleString("pl-PL")} exp`;
}

export function DailyLoginPanel({ characterId }: { characterId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["daily-login", characterId],
    queryFn: () => getDailyLoginStatus(characterId),
  });

  const claimMutation = useMutation({
    mutationFn: () => claimDailyLoginReward(characterId),
    onSuccess: (result) => {
      setError(null);
      const parts: string[] = [];
      if (result.goldGained > 0) parts.push(`+${result.goldGained.toLocaleString("pl-PL")} złota`);
      if (result.expGained > 0) parts.push(`+${result.expGained.toLocaleString("pl-PL")} exp`);
      if (result.leveledUp) parts.push(`awans na poziom ${result.newLevel}!`);
      setMessage(parts.length > 0 ? `Odebrano: ${parts.join(", ")}.` : "Nagroda za dziś już wcześniej odebrana.");
      queryClient.invalidateQueries({ queryKey: ["daily-login", characterId] });
      queryClient.invalidateQueries({ queryKey: ["character", characterId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się odebrać nagrody"),
  });

  const status = statusQuery.data;

  return (
    <PanelFrame title="Nagrody dzienne">
      <p className="text-sm text-parchment-faint">
        Nagroda przypisana do tej postaci — seria rośnie z każdym kolejnym dniem logowania,
        pominięty dzień resetuje ją do początku. Cykl nagród powtarza się co 7 dni.
      </p>

      {status && (
        <>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {status.rewards.map((r) => {
              const isToday = r.day === status.today.cycleDay;
              return (
                <div
                  key={r.day}
                  className={`rounded-md border p-2 text-center text-xs ${
                    isToday ? "border-gold bg-gold/10 text-gold-bright" : "border-line-soft/60 text-parchment-faint"
                  }`}
                >
                  <div className="font-medium">Dzień {r.day}</div>
                  <div className="mt-1 tabular-nums">{formatReward(r.type, r.amount)}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-sm text-parchment-dim">
              Seria: <span className="tabular-nums text-gold-bright">{status.today.streak}</span>{" "}
              {status.today.streak === 1 ? "dzień" : "dni"}
            </p>
            <button
              onClick={() => claimMutation.mutate()}
              disabled={status.today.claimed || claimMutation.isPending}
              className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status.today.claimed
                ? "Odebrano"
                : `Odbierz (${formatReward(status.today.rewardType, status.today.rewardAmount)})`}
            </button>
          </div>
        </>
      )}

      {message && <p className="mt-2 text-sm text-gold-bright">{message}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </PanelFrame>
  );
}
