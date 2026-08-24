import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@mmo/shared";
import { ApiError } from "../../lib/apiClient";
import { listPlayerZones } from "../../lib/zonesApi";
import { listPlayerItems } from "../../lib/itemsApi";
import { getCombatStats, getCharacterSkills } from "../../lib/charactersApi";
import { getPlayerClass } from "../../lib/classesApi";
import {
  getActiveExpedition,
  claimExpedition,
  leaveExpedition,
  getFlaggedCount,
  type ExpeditionClaimResult,
} from "../../lib/expeditionsApi";
import { CombatLog } from "./CombatLog";
import { MonsterEncounterPanel } from "./MonsterEncounterPanel";
import { PlayerVitalsBar } from "./PlayerVitalsBar";
import { ActivePotionsSummary } from "./ActivePotionsSummary";
import { ActiveSkillCooldownBar } from "./ActiveSkillCooldownBar";
import { LootBar } from "./LootBar";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";
import { ConfirmModal } from "../common/ConfirmModal";

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** The mockup's "COMBAT / EXPEDITION PAGE" — player-vs-monster bars, dual activity log, skills
 * and potions on the left; a live result+loot rail on the right. Everything here is real,
 * already-simulated combat data (see CombatEvent/expeditions/service.ts), not a mockup of a
 * mockup — this component is a new arrangement of the same granular pieces ExpeditionPanel.tsx
 * already uses (CombatLog/PlayerVitalsBar/MonsterEncounterPanel/ActiveSkillCooldownBar/
 * ActivePotionsSummary/LootBar), not a second implementation of the combat-reveal logic.
 * Deliberately self-contained (its own queries/mutations/ticking) rather than sharing state with
 * ExpeditionPanel, so this new World Map surface can't regress the already-working Ekspedycje
 * tab — see docs/architecture.md. */
export function LiveCombatCard({ character, onClaimed }: { character: Character; onClaimed: () => void }) {
  const characterId = character.id;
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ExpeditionClaimResult | null>(null);
  const [confirmingLeaveMessage, setConfirmingLeaveMessage] = useState<string | null>(null);

  const activeQuery = useQuery({
    queryKey: ["active-expedition", characterId],
    queryFn: () => getActiveExpedition(characterId),
  });
  const zonesQuery = useQuery({ queryKey: ["player-zones"], queryFn: listPlayerZones });
  const itemsQuery = useQuery({ queryKey: ["player-items"], queryFn: listPlayerItems });
  const combatStatsQuery = useQuery({ queryKey: ["combat-stats", characterId], queryFn: () => getCombatStats(characterId) });
  const classQuery = useQuery({
    queryKey: ["class", character.classId],
    queryFn: () => getPlayerClass(character.classId!),
    enabled: !!character.classId,
  });
  const characterSkillsQuery = useQuery({
    queryKey: ["character-skills", characterId],
    queryFn: () => getCharacterSkills(characterId),
  });
  const flaggedCountQuery = useQuery({ queryKey: ["flagged-count", characterId], queryFn: () => getFlaggedCount(characterId) });

  const expedition = character.activeExpeditionId ? (activeQuery.data ?? null) : null;
  const arrivedAtMs = expedition ? new Date(expedition.arrivedAt).getTime() : null;
  const fightEndsAtMs = expedition ? new Date(expedition.fightEndsAt).getTime() : null;
  const endsAtMs = expedition ? new Date(expedition.endsAt).getTime() : null;
  const isReadyToClaim = endsAtMs !== null && now >= endsAtMs;
  const elapsedSeconds = arrivedAtMs !== null ? Math.floor((now - arrivedAtMs) / 1000) : 0;
  const revealedEvents = expedition ? expedition.events.filter((e) => e.t <= elapsedSeconds) : [];

  const phase: "traveling_there" | "fighting" | "traveling_back" | "ready" | null = !expedition
    ? null
    : isReadyToClaim
      ? "ready"
      : arrivedAtMs !== null && now < arrivedAtMs
        ? "traveling_there"
        : fightEndsAtMs !== null && now < fightEndsAtMs
          ? "fighting"
          : "traveling_back";
  const PHASE_LABELS = {
    traveling_there: "W drodze do krainy…",
    fighting: "Walczy w krainie…",
    traveling_back: "Wraca do wioski…",
  } as const;

  useEffect(() => {
    if (!expedition || isReadyToClaim) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expedition, isReadyToClaim]);

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

  const zones = zonesQuery.data ?? [];
  const itemFor = (itemId: string) => itemsQuery.data?.find((i) => i.id === itemId);
  const zoneNameFor = (zoneId: string) => zones.find((z) => z.id === zoneId)?.name ?? zoneId;

  const unlockedClassSkillIds = new Set(
    characterSkillsQuery.data?.filter((s) => s.unlocked).map((s) => s.classSkillId) ?? [],
  );
  const activeSkillsForCooldown = (classQuery.data?.skills ?? [])
    .filter((s) => s.kind === "active" && s.cooldownSeconds && unlockedClassSkillIds.has(s.id))
    .map((s) => ({ name: s.name, cooldownSeconds: s.cooldownSeconds! }));

  const flaggedCount = flaggedCountQuery.data?.count ?? 0;

  const kills = revealedEvents.filter((e) => e.type === "encounter_result").length;
  const exp = revealedEvents.reduce((sum, e) => (e.type === "encounter_result" ? sum + e.expGained : sum), 0);
  const gold = revealedEvents.reduce((sum, e) => (e.type === "encounter_result" ? sum + e.goldGained : sum), 0);
  const lootTotals = new Map<string, number>();
  for (const e of revealedEvents) {
    if (e.type === "loot") lootTotals.set(e.itemId, (lootTotals.get(e.itemId) ?? 0) + e.quantity);
  }

  if (claimResult) {
    return (
      <div>
        <p className="text-sm font-medium text-parchment">Ekspedycja zakończona</p>
        <p className="mt-1 text-sm text-parchment-dim">
          Pokonano {claimResult.result.monstersDefeated} potworów · +{claimResult.result.expGained} exp ·
          +{claimResult.result.goldGained} złota
        </p>
        {claimResult.leveledUp && (
          <p className="mt-1 text-sm font-medium text-gold-bright">Awans na poziom {claimResult.newLevel}!</p>
        )}
        {claimResult.result.loot.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-parchment-dim">
            {claimResult.result.loot.map((l) => (
              <li key={l.itemId} className="flex items-center gap-1.5">
                <ItemTypeIcon type={itemFor(l.itemId)?.type ?? "material"} className="h-4 w-4 shrink-0" />
                {itemFor(l.itemId)?.name ?? l.itemId} ×{l.quantity}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-parchment-faint">Brak przedmiotów tym razem.</p>
        )}
        <button
          onClick={() => setClaimResult(null)}
          className="mt-3 rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          OK
        </button>
      </div>
    );
  }

  if (!expedition) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-10 text-center">
        <p className="text-sm text-parchment-dim">Brak aktywnej walki.</p>
        <p className="max-w-xs text-xs text-parchment-faint">
          Wybierz krainę w zakładce "Expowiska" i kliknij "Ruszaj" — przebieg walki pojawi się tutaj.
        </p>
      </div>
    );
  }

  return (
    <div>
      {flaggedCount > 0 && (
        <p className="mb-3 rounded-md border border-gold/40 bg-gold/5 px-3 py-2 text-sm text-gold-bright">
          Masz {flaggedCount} {flaggedCount === 1 ? "ekspedycję oczekującą" : "ekspedycje oczekujące"} na
          sprawdzenie przez administrację — nagroda zostanie przyznana albo odrzucona po jej rozpatrzeniu.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_260px] lg:items-start">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Ekspedycja</p>
              <p className="font-display text-lg font-semibold text-parchment">{zoneNameFor(expedition.zoneId)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Czas</p>
              {isReadyToClaim ? (
                <p className="font-display text-lg text-gold-bright">Gotowe</p>
              ) : (
                <p className="font-display text-lg tabular-nums text-parchment">
                  {formatDuration((endsAtMs ?? now) - now)}
                </p>
              )}
            </div>
          </div>
          {phase && phase !== "ready" && (
            <p className="mt-1 text-xs uppercase tracking-wide text-parchment-faint">{PHASE_LABELS[phase]}</p>
          )}

          {combatStatsQuery.data && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-parchment-dim">{character.name}</p>
                <PlayerVitalsBar
                  events={revealedEvents}
                  maxHp={combatStatsQuery.data.maxHp}
                  maxMana={combatStatsQuery.data.maxMana}
                />
              </div>
              <MonsterEncounterPanel events={revealedEvents} />
            </div>
          )}

          <CombatLog events={revealedEvents} itemFor={itemFor} />
          <LootBar events={revealedEvents} itemFor={itemFor} />

          {activeSkillsForCooldown.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-medium text-parchment-dim">Umiejętności</p>
              <ActiveSkillCooldownBar
                skills={activeSkillsForCooldown}
                events={revealedEvents}
                elapsedSeconds={elapsedSeconds}
              />
            </div>
          )}

          <ActivePotionsSummary
            characterId={characterId}
            snapshot={expedition.potionSlotsSnapshot}
            itemFor={itemFor}
            revealedEvents={revealedEvents}
          />

          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="border border-line-soft bg-panel-raised/40 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-parchment-faint">Wynik ekspedycji</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-parchment-dim">Zdobyty exp</span>
                <span className="text-parchment">{exp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-parchment-dim">Zdobyte złoto</span>
                <span className="text-gold-bright">{gold}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-parchment-dim">Pokonani przeciwnicy</span>
                <span className="text-parchment">{kills}</span>
              </div>
            </div>
          </div>

          {lootTotals.size > 0 && (
            <div className="border border-line-soft bg-panel-raised/40 p-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-parchment-faint">Zdobyte przedmioty</p>
              <ul className="space-y-1 text-sm">
                {Array.from(lootTotals.entries()).map(([itemId, qty]) => (
                  <li key={itemId} className="flex items-center gap-1.5 text-parchment-dim">
                    <ItemTypeIcon type={itemFor(itemId)?.type ?? "material"} className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{itemFor(itemId)?.name ?? itemId}</span>
                    <span className="text-xs">×{qty}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isReadyToClaim ? (
            <button
              onClick={() => claimMutation.mutate(expedition.id)}
              disabled={claimMutation.isPending}
              className="rounded-md border border-gold px-4 py-1.5 text-sm font-medium text-gold-bright hover:bg-gold/10 disabled:opacity-50"
            >
              Odbierz nagrody
            </button>
          ) : (
            <button
              onClick={() => {
                const message =
                  phase === "traveling_there"
                    ? "Zawrócić teraz? Nic jeszcze się nie wydarzyło — nie odbierzesz żadnych nagród."
                    : "Opuścić walkę teraz? Odbierzesz tylko to, co widać już w dzienniku walki poniżej — reszta czasu przepadnie. Postać zostanie w krainie.";
                setConfirmingLeaveMessage(message);
              }}
              disabled={leaveMutation.isPending}
              className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised disabled:opacity-50"
            >
              Zakończ ekspedycję
            </button>
          )}
        </div>
      </div>

      {confirmingLeaveMessage && (
        <ConfirmModal
          title="Opuścić ekspedycję?"
          message={confirmingLeaveMessage}
          danger
          onCancel={() => setConfirmingLeaveMessage(null)}
          onConfirm={() => {
            setConfirmingLeaveMessage(null);
            leaveMutation.mutate(expedition.id);
          }}
        />
      )}
    </div>
  );
}
