import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character, BattleTacticsInput } from "@mmo/shared";
import { ApiError } from "../../lib/apiClient";
import { listPlayerZones } from "../../lib/zonesApi";
import { listPlayerItems } from "../../lib/itemsApi";
import { startTravel } from "../../lib/travelApi";
import { getCombatStats, getCharacterSkills } from "../../lib/charactersApi";
import { getPlayerClass } from "../../lib/classesApi";
import {
  getActiveExpedition,
  startExpedition,
  claimExpedition,
  leaveExpedition,
  getExpeditionDuration,
  type ExpeditionClaimResult,
} from "../../lib/expeditionsApi";
import { CombatLog } from "./CombatLog";
import { MonsterEncounterPanel } from "./MonsterEncounterPanel";
import { MonsterPickerModal } from "./MonsterPickerModal";
import { BattleTacticsModal } from "./BattleTacticsModal";
import { NpcShopPanel } from "./NpcShopPanel";
import { PlayerVitalsBar } from "./PlayerVitalsBar";
import { ActiveSkillCooldownBar } from "./ActiveSkillCooldownBar";
import { LootBar } from "./LootBar";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ExpeditionPanel({
  character,
  onClaimed,
}: {
  character: Character;
  onClaimed: () => void;
}) {
  const characterId = character.id;
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ExpeditionClaimResult | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tacticsMonsterIds, setTacticsMonsterIds] = useState<string[] | null>(null);
  const [otherZonesOpen, setOtherZonesOpen] = useState(false);

  const activeQuery = useQuery({
    queryKey: ["active-expedition", characterId],
    queryFn: () => getActiveExpedition(characterId),
  });
  const zonesQuery = useQuery({ queryKey: ["player-zones"], queryFn: listPlayerZones });
  const itemsQuery = useQuery({ queryKey: ["player-items"], queryFn: listPlayerItems });
  const durationQuery = useQuery({ queryKey: ["expedition-duration"], queryFn: getExpeditionDuration });
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

  const expedition = character.activeExpeditionId ? (activeQuery.data ?? null) : null;
  const arrivedAtMs = expedition ? new Date(expedition.arrivedAt).getTime() : null;
  const fightEndsAtMs = expedition ? new Date(expedition.fightEndsAt).getTime() : null;
  const endsAtMs = expedition ? new Date(expedition.endsAt).getTime() : null;
  const isReadyToClaim = endsAtMs !== null && now >= endsAtMs;
  // Combat events are timestamped relative to arrival, not departure — negative elapsed time
  // while still traveling there naturally reveals zero events (all event.t are positive). For
  // Etap-9 expeditions arrivedAt===startedAt, so this is simply "since the fight started".
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

  const travelArrivesAtMs = character.travelArrivesAt ? new Date(character.travelArrivesAt).getTime() : null;
  const isTraveling = travelArrivesAtMs !== null;
  const travelReady = isTraveling && now >= travelArrivesAtMs!;

  useEffect(() => {
    if (!travelReady) return;
    queryClient.invalidateQueries({ queryKey: ["character", characterId] });
  }, [travelReady, queryClient, characterId]);

  useEffect(() => {
    const needsTicking = (expedition && !isReadyToClaim) || (isTraveling && !travelReady);
    if (!needsTicking) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expedition, isReadyToClaim, isTraveling, travelReady]);

  const travelMutation = useMutation({
    mutationFn: (destinationZoneId: string | null) => startTravel(characterId, destinationZoneId),
    onSuccess: () => {
      setError(null);
      setOtherZonesOpen(false);
      setSelectedZoneId(null);
      queryClient.invalidateQueries({ queryKey: ["character", characterId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się wyruszyć w drogę"),
  });

  const startMutation = useMutation({
    mutationFn: ({
      zoneId,
      selectedMonsterIds,
      tactics,
    }: {
      zoneId: string;
      selectedMonsterIds: string[];
      tactics?: BattleTacticsInput;
    }) => startExpedition(characterId, zoneId, selectedMonsterIds, tactics),
    onSuccess: () => {
      setError(null);
      setPickerOpen(false);
      setTacticsMonsterIds(null);
      queryClient.invalidateQueries({ queryKey: ["active-expedition", characterId] });
      queryClient.invalidateQueries({ queryKey: ["character", characterId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się rozpocząć walki"),
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

  const zones = zonesQuery.data ?? [];
  const itemFor = (itemId: string) => itemsQuery.data?.find((i) => i.id === itemId);
  const itemNameFor = (itemId: string) => itemFor(itemId)?.name ?? itemId;
  const zoneNameFor = (zoneId: string | null) => (zoneId ? zones.find((z) => z.id === zoneId)?.name ?? zoneId : "wioski");

  const levelByClassSkillId = new Map(characterSkillsQuery.data?.map((s) => [s.classSkillId, s.level]) ?? []);
  const activeSkillsForCooldown = (classQuery.data?.skills ?? [])
    .filter((s) => s.kind === "active" && s.cooldownSeconds && (levelByClassSkillId.get(s.id) ?? 0) > 0)
    .map((s) => ({ name: s.name, cooldownSeconds: s.cooldownSeconds! }));

  if (claimResult) {
    return (
      <div className="panel p-4">
        <h2 className="font-medium text-parchment">Ekspedycja zakończona</h2>
        <p className="mt-1 text-sm text-parchment-dim">
          Pokonano {claimResult.result.monstersDefeated} potworów · +{claimResult.result.expGained} exp ·
          +{claimResult.result.goldGained} złota
        </p>
        {claimResult.leveledUp && (
          <p className="mt-1 text-sm font-medium text-gold-bright">
            Awans na poziom {claimResult.newLevel}!
          </p>
        )}
        {claimResult.result.loot.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-parchment-dim">
            {claimResult.result.loot.map((l) => (
              <li key={l.itemId} className="flex items-center gap-1.5">
                <ItemTypeIcon type={itemFor(l.itemId)?.type ?? "material"} className="h-4 w-4 shrink-0" />
                {itemNameFor(l.itemId)} ×{l.quantity}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-parchment-faint">Brak przedmiotów tym razem.</p>
        )}
        <button
          onClick={() => setClaimResult(null)}
          className="mt-3  bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          OK
        </button>
      </div>
    );
  }

  if (expedition && expedition.status === "flagged") {
    return (
      <div className="panel p-4">
        <h2 className="font-medium text-parchment">Ekspedycja wstrzymana</h2>
        <p className="mt-1 text-sm text-parchment-dim">Kraina: {zoneNameFor(expedition.zoneId)}</p>
        <p className="mt-2 text-sm text-red-400">
          Wynik tej ekspedycji wygląda na błąd balansu i został wstrzymany do sprawdzenia przez
          administrację. Postać nie może wyruszyć w drogę ani rozpocząć nowej walki, dopóki
          administracja nie rozwiąże tej ekspedycji.
        </p>
      </div>
    );
  }

  if (expedition) {
    return (
      <div className="panel p-4">
        <h2 className="font-medium text-parchment">Ekspedycja w toku</h2>
        <p className="mt-1 text-sm text-parchment-dim">Kraina: {zoneNameFor(expedition.zoneId)}</p>
        {isReadyToClaim ? (
          <button
            onClick={() => claimMutation.mutate(expedition.id)}
            disabled={claimMutation.isPending}
            className="mt-3 border border-gold px-4 py-1.5 text-sm font-medium text-gold-bright hover:bg-gold/10 disabled:opacity-50"
          >
            Odbierz nagrody
          </button>
        ) : (
          <>
            {phase && phase !== "ready" && (
              <p className="mt-2 text-xs uppercase tracking-wide text-parchment-faint">{PHASE_LABELS[phase]}</p>
            )}
            <p className="mt-1 text-2xl font-semibold tabular-nums text-parchment">
              {formatDuration((endsAtMs ?? now) - now)}
            </p>
            <button
              onClick={() => {
                const message =
                  phase === "traveling_there"
                    ? "Zawrócić teraz? Nic jeszcze się nie wydarzyło — nie odbierzesz żadnych nagród."
                    : "Opuścić walkę teraz? Odbierzesz tylko to, co widać już w dzienniku walki poniżej — reszta czasu przepadnie. Postać zostanie w krainie.";
                if (confirm(message)) {
                  leaveMutation.mutate(expedition.id);
                }
              }}
              disabled={leaveMutation.isPending}
              className="mt-2  border border-line-soft px-3 py-1.5 text-xs text-parchment-dim hover:bg-panel-raised disabled:opacity-50"
            >
              Opuść walkę (odbierz zdobyte)
            </button>
          </>
        )}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {combatStatsQuery.data && (
          <div className="mt-3">
            <PlayerVitalsBar
              events={revealedEvents}
              maxHp={combatStatsQuery.data.maxHp}
              maxMana={combatStatsQuery.data.maxMana}
            />
          </div>
        )}
        {activeSkillsForCooldown.length > 0 && (
          <div className="mt-3">
            <ActiveSkillCooldownBar
              skills={activeSkillsForCooldown}
              events={revealedEvents}
              elapsedSeconds={elapsedSeconds}
            />
          </div>
        )}
        <div className="mt-3">
          <MonsterEncounterPanel events={revealedEvents} />
          <LootBar events={revealedEvents} itemFor={itemFor} />
        </div>
        <CombatLog events={revealedEvents} itemFor={itemFor} />
      </div>
    );
  }

  if (isTraveling) {
    return (
      <div className="panel p-4">
        <h2 className="font-medium text-parchment">W drodze</h2>
        <p className="mt-1 text-sm text-parchment-dim">Cel: {zoneNameFor(character.travelDestinationZoneId)}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-parchment">
          {formatDuration((travelArrivesAtMs ?? now) - now)}
        </p>
      </div>
    );
  }

  if (character.currentZoneId) {
    const currentZone = zones.find((z) => z.id === character.currentZoneId);
    const otherZones = zones.filter((z) => z.id !== character.currentZoneId);
    const isTown = currentZone?.isTown ?? false;

    const travelControls = (
      <>
        <div className="mt-3 flex flex-wrap gap-2">
          {!isTown && (
            <button
              onClick={() => setPickerOpen(true)}
              className=" bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
            >
              Walcz
            </button>
          )}
          <button
            onClick={() => setOtherZonesOpen((v) => !v)}
            className=" border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
          >
            Idź do innej krainy
          </button>
          <button
            onClick={() => travelMutation.mutate(null)}
            disabled={travelMutation.isPending}
            className=" border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised disabled:opacity-50"
          >
            Wróć do wioski
          </button>
        </div>

        {otherZonesOpen && (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            {otherZones.map((zone) => {
              const eligible = character.level >= zone.minLevel && character.level <= zone.maxLevel;
              return (
                <button
                  key={zone.id}
                  disabled={!eligible || travelMutation.isPending}
                  onClick={() => travelMutation.mutate(zone.id)}
                  className={`block w-full border px-3 py-2 text-left text-sm transition border-line hover:border-line-soft ${
                    !eligible ? "cursor-not-allowed opacity-40" : ""
                  }`}
                >
                  <span className="font-medium text-parchment">{zone.name}</span>
                  <span className="ml-2 text-xs text-parchment-faint">
                    poziom {zone.minLevel}-{zone.maxLevel}
                  </span>
                </button>
              );
            })}
            {otherZones.length === 0 && <p className="text-sm text-parchment-faint">Brak innych krain.</p>}
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </>
    );

    if (isTown && currentZone) {
      return (
        <div>
          <NpcShopPanel characterId={characterId} zone={currentZone} gold={character.gold} itemFor={itemFor} />
          <div className="panel mt-3 p-4">{travelControls}</div>
        </div>
      );
    }

    return (
      <div className="panel p-4">
        <h2 className="font-medium text-parchment">{currentZone?.name ?? "Kraina"}</h2>
        <p className="mt-1 text-xs text-parchment-faint">Postać stoi w tej krainie — wybierz co robić dalej.</p>

        {travelControls}

        {pickerOpen && currentZone && (
          <MonsterPickerModal
            zone={currentZone}
            durationMinutes={durationQuery.data?.minutes ?? null}
            onCancel={() => setPickerOpen(false)}
            onConfirm={(selectedMonsterIds) => {
              setPickerOpen(false);
              setTacticsMonsterIds(selectedMonsterIds);
            }}
          />
        )}

        {tacticsMonsterIds && currentZone && (
          <BattleTacticsModal
            activeSkills={(classQuery.data?.skills ?? []).filter(
              (s) => s.kind === "active" && (levelByClassSkillId.get(s.id) ?? 0) > 0,
            )}
            onBack={() => {
              setTacticsMonsterIds(null);
              setPickerOpen(true);
            }}
            onConfirm={(tactics: BattleTacticsInput) =>
              startMutation.mutate({ zoneId: currentZone.id, selectedMonsterIds: tacticsMonsterIds, tactics })
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <h2 className="font-medium text-parchment">Wyrusz do krainy</h2>
      {durationQuery.data && (
        <p className="mt-1 text-xs text-parchment-faint">
          Walka trwa, aż postać zginie (max. {durationQuery.data.minutes} min — zabezpieczenie).
        </p>
      )}

      <div className="mt-3 space-y-2">
        {zones.map((zone) => {
          const eligible = character.level >= zone.minLevel && character.level <= zone.maxLevel;
          return (
            <button
              key={zone.id}
              disabled={!eligible}
              onClick={() => setSelectedZoneId(zone.id)}
              className={`block w-full  border px-3 py-2 text-left text-sm transition ${
                selectedZoneId === zone.id
                  ? "border-gold bg-gold/10"
                  : "border-line hover:border-line-soft"
              } ${!eligible ? "cursor-not-allowed opacity-40" : ""}`}
            >
              <span className="font-medium text-parchment">{zone.name}</span>
              <span className="ml-2 text-xs text-parchment-faint">
                poziom {zone.minLevel}-{zone.maxLevel} · ~{zone.travelTimeSeconds}s podróży
              </span>
            </button>
          );
        })}
        {zones.length === 0 && <p className="text-sm text-parchment-faint">Brak dostępnych krain.</p>}
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <button
        onClick={() => selectedZoneId && travelMutation.mutate(selectedZoneId)}
        disabled={!selectedZoneId || travelMutation.isPending}
        className="mt-3  bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:opacity-50"
      >
        Wyrusz do krainy
      </button>
    </div>
  );
}
