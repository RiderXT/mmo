import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, GatherKind } from "@mmo/shared";
import type { ZoneDto } from "../../lib/adminApi";
import { ApiError } from "../../lib/apiClient";
import { listInventory } from "../../lib/inventoryApi";
import { getActiveGathering, startGathering, stopGathering } from "../../lib/gatheringApi";
import { ProgressBar } from "../common/ProgressBar";

const PHASE_LABELS = {
  catching: "Łowi rybę…",
  extracting: "Wydobywa…",
  searching: "Szuka złoża…",
} as const;

/** Fishing/mining panel — shown in the zone view whenever the current zone has a fishing spot
 * and/or a mine attached. A session auto-loops (catch → grant reward → next catch) until the
 * player clicks "Zatrzymaj", mirroring how expeditions auto-fight without per-encounter clicks.
 * Polling follows ExpeditionPanel's pattern: one fetch, a local 1s tick for the countdown, and
 * `invalidateQueries` once the phase deadline is crossed or a mutation succeeds — no
 * `refetchInterval`. */
export function GatheringPanel({ character, zone }: { character: Character; zone: ZoneDto }) {
  const characterId = character.id;
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  // Anchors the progress bar: reset to "0% as of right now" whenever a new phaseEndsAt is
  // observed (session start, or a phase transition revealed by the next poll) — the server
  // doesn't report a phase-start timestamp, so this is the client's best estimate of it.
  const [phaseAnchor, setPhaseAnchor] = useState<{ endsAt: number; seenAt: number } | null>(null);

  const activeQuery = useQuery({
    queryKey: ["active-gathering", characterId],
    queryFn: () => getActiveGathering(characterId),
  });
  const inventoryQuery = useQuery({ queryKey: ["inventory", characterId], queryFn: () => listInventory(characterId) });

  const session = activeQuery.data ?? null;
  const phaseEndsAtMs = session ? new Date(session.phaseEndsAt).getTime() : null;
  const isDue = phaseEndsAtMs !== null && now >= phaseEndsAtMs;

  useEffect(() => {
    if (!phaseEndsAtMs) {
      setPhaseAnchor(null);
      return;
    }
    setPhaseAnchor((prev) => (prev && prev.endsAt === phaseEndsAtMs ? prev : { endsAt: phaseEndsAtMs, seenAt: Date.now() }));
  }, [phaseEndsAtMs]);

  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (!isDue) return;
    queryClient.invalidateQueries({ queryKey: ["active-gathering", characterId] });
  }, [isDue, now, queryClient, characterId]);

  const hasRod = inventoryQuery.data?.some((i) => i.equippedSlot === "rod") ?? false;
  const hasPickaxe = inventoryQuery.data?.some((i) => i.equippedSlot === "pickaxe") ?? false;

  const startMutation = useMutation({
    mutationFn: (kind: GatherKind) =>
      startGathering(characterId, kind, kind === "fishing" ? zone.fishingSpot!.id : zone.mine!.id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["active-gathering", characterId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się rozpocząć zbieractwa"),
  });

  const stopMutation = useMutation({
    mutationFn: () => stopGathering(characterId),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["active-gathering", characterId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się zatrzymać zbieractwa"),
  });

  if (!zone.fishingSpot && !zone.mine) return null;

  const pct = phaseAnchor
    ? ((now - phaseAnchor.seenAt) / Math.max(1, phaseAnchor.endsAt - phaseAnchor.seenAt)) * 100
    : 0;

  return (
    <div className="panel mt-3 p-4">
      <h3 className="font-medium text-parchment">Zbieractwo</h3>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {session ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-parchment-dim">{PHASE_LABELS[session.phase]}</p>
          <ProgressBar pct={pct} />
          <p className="text-xs text-parchment-faint">Łącznie zebrano: {session.totalGathered}</p>
          <button
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            Zatrzymaj
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {zone.fishingSpot && (
            <button
              onClick={() => startMutation.mutate("fishing")}
              disabled={!hasRod || startMutation.isPending}
              title={!hasRod ? "Załóż wędkę, żeby łowić" : undefined}
              className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              Rozpocznij łowienie
            </button>
          )}
          {zone.mine && (
            <button
              onClick={() => startMutation.mutate("mining")}
              disabled={!hasPickaxe || startMutation.isPending}
              title={!hasPickaxe ? "Załóż kilof, żeby kopać" : undefined}
              className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              Rozpocznij wydobywanie
            </button>
          )}
        </div>
      )}
    </div>
  );
}
