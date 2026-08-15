import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient";
import { listPlayerZones } from "../../lib/zonesApi";
import { listPlayerItems } from "../../lib/itemsApi";
import {
  getActiveExpedition,
  startExpedition,
  claimExpedition,
  leaveExpedition,
  getExpeditionDuration,
  type ExpeditionClaimResult,
} from "../../lib/expeditionsApi";
import { CombatLog } from "./CombatLog";

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ExpeditionPanel({
  characterId,
  characterLevel,
  onClaimed,
}: {
  characterId: string;
  characterLevel: number;
  onClaimed: () => void;
}) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ExpeditionClaimResult | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const activeQuery = useQuery({
    queryKey: ["active-expedition", characterId],
    queryFn: () => getActiveExpedition(characterId),
  });
  const zonesQuery = useQuery({ queryKey: ["player-zones"], queryFn: listPlayerZones });
  const itemsQuery = useQuery({ queryKey: ["player-items"], queryFn: listPlayerItems });
  const durationQuery = useQuery({ queryKey: ["expedition-duration"], queryFn: getExpeditionDuration });

  const expedition = activeQuery.data ?? null;
  const startedAtMs = expedition ? new Date(expedition.startedAt).getTime() : null;
  const endsAtMs = expedition ? new Date(expedition.endsAt).getTime() : null;
  const isReadyToClaim = endsAtMs !== null && now >= endsAtMs;
  const elapsedSeconds = startedAtMs !== null ? Math.floor((now - startedAtMs) / 1000) : 0;
  const revealedEvents = expedition ? expedition.events.filter((e) => e.t <= elapsedSeconds) : [];

  useEffect(() => {
    if (!expedition || isReadyToClaim) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expedition, isReadyToClaim]);

  const startMutation = useMutation({
    mutationFn: (zoneId: string) => startExpedition(characterId, zoneId),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["active-expedition", characterId] });
      queryClient.invalidateQueries({ queryKey: ["character", characterId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się wysłać postaci"),
  });

  function handleRewardSuccess(data: ExpeditionClaimResult) {
    setError(null);
    setClaimResult(data);
    queryClient.invalidateQueries({ queryKey: ["active-expedition", characterId] });
    queryClient.invalidateQueries({ queryKey: ["character", characterId] });
    queryClient.invalidateQueries({ queryKey: ["inventory", characterId] });
    onClaimed();
  }

  const claimMutation = useMutation({
    mutationFn: (expeditionId: string) => claimExpedition(expeditionId),
    onSuccess: handleRewardSuccess,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się odebrać nagród"),
  });

  const leaveMutation = useMutation({
    mutationFn: (expeditionId: string) => leaveExpedition(expeditionId),
    onSuccess: handleRewardSuccess,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się opuścić ekspedycji"),
  });

  const itemNameFor = (itemId: string) => itemsQuery.data?.find((i) => i.id === itemId)?.name ?? itemId;
  const zoneNameFor = (zoneId: string) => zonesQuery.data?.find((z) => z.id === zoneId)?.name ?? zoneId;

  if (claimResult) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-medium text-slate-100">Ekspedycja zakończona</h2>
        <p className="mt-1 text-sm text-slate-300">
          Pokonano {claimResult.result.monstersDefeated} potworów · +{claimResult.result.expGained} exp ·
          +{claimResult.result.goldGained} złota
        </p>
        {claimResult.leveledUp && (
          <p className="mt-1 text-sm font-medium text-amber-300">
            Awans na poziom {claimResult.newLevel}!
          </p>
        )}
        {claimResult.result.loot.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            {claimResult.result.loot.map((l) => (
              <li key={l.itemId}>
                {itemNameFor(l.itemId)} ×{l.quantity}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Brak przedmiotów tym razem.</p>
        )}
        <button
          onClick={() => setClaimResult(null)}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          OK
        </button>
      </div>
    );
  }

  if (expedition) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-medium text-slate-100">Ekspedycja w toku</h2>
        <p className="mt-1 text-sm text-slate-400">Kraina: {zoneNameFor(expedition.zoneId)}</p>
        {isReadyToClaim ? (
          <button
            onClick={() => claimMutation.mutate(expedition.id)}
            disabled={claimMutation.isPending}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Odbierz nagrody
          </button>
        ) : (
          <>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">
              {formatDuration((endsAtMs ?? now) - now)}
            </p>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Opuścić ekspedycję teraz? Odbierzesz tylko to, co widać już w dzienniku walki poniżej — reszta czasu przepadnie.",
                  )
                ) {
                  leaveMutation.mutate(expedition.id);
                }
              }}
              disabled={leaveMutation.isPending}
              className="mt-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Opuść ekspedycję (odbierz zdobyte)
            </button>
          </>
        )}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <CombatLog events={revealedEvents} itemNameFor={itemNameFor} />
      </div>
    );
  }

  const zones = zonesQuery.data ?? [];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="font-medium text-slate-100">Wyślij na ekspedycję</h2>
      {durationQuery.data && (
        <p className="mt-1 text-xs text-slate-500">
          Ekspedycja trwa {durationQuery.data.minutes} min (ustawienie administratora).
        </p>
      )}

      <div className="mt-3 space-y-2">
        {zones.map((zone) => {
          const eligible = characterLevel >= zone.minLevel && characterLevel <= zone.maxLevel;
          return (
            <button
              key={zone.id}
              disabled={!eligible}
              onClick={() => setSelectedZoneId(zone.id)}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                selectedZoneId === zone.id
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-slate-800 hover:border-slate-700"
              } ${!eligible ? "cursor-not-allowed opacity-40" : ""}`}
            >
              <span className="font-medium text-slate-200">{zone.name}</span>
              <span className="ml-2 text-xs text-slate-500">
                poziom {zone.minLevel}-{zone.maxLevel}
              </span>
            </button>
          );
        })}
        {zones.length === 0 && <p className="text-sm text-slate-500">Brak dostępnych krain.</p>}
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <button
        onClick={() => selectedZoneId && startMutation.mutate(selectedZoneId)}
        disabled={!selectedZoneId || startMutation.isPending}
        className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        Wyślij postać
      </button>
    </div>
  );
}
