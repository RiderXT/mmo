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
  getFlaggedCount,
  type ExpeditionClaimResult,
} from "../../lib/expeditionsApi";
import { CombatLog } from "./CombatLog";
import { MonsterEncounterPanel } from "./MonsterEncounterPanel";
import { MonsterAttackPanel } from "./MonsterAttackPanel";
import { ZoneMapPath } from "./ZoneMapPath";
import { ZoneInfoCard } from "./ZoneInfoCard";
import { BattleTacticsModal } from "./BattleTacticsModal";
import { PlayerVitalsBar } from "./PlayerVitalsBar";
import { ActivePotionsSummary } from "./ActivePotionsSummary";
import { ActiveSkillCooldownBar } from "./ActiveSkillCooldownBar";
import { LootBar } from "./LootBar";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";
import { GatheringPanel } from "../gathering/GatheringPanel";
import { PanelFrame } from "../common/PanelFrame";
import { ConfirmModal } from "../common/ConfirmModal";

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
  // Defaults to wherever the character already is, so the map opens on "you are here" with the
  // right-side panel ready to go instead of forcing an extra click — but only as an INITIAL
  // value; once the player picks something else on the map, re-renders (e.g. after travel
  // completes) must not silently override that choice.
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(character.currentZoneId);
  const [tacticsMonsterIds, setTacticsMonsterIds] = useState<string[] | null>(null);
  const [confirmingLeaveMessage, setConfirmingLeaveMessage] = useState<string | null>(null);

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
  const flaggedCountQuery = useQuery({
    queryKey: ["flagged-count", characterId],
    queryFn: () => getFlaggedCount(characterId),
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

  // Keep ticking past travelReady (not just up to it) so the invalidate below can retry every
  // second — a single one-shot invalidate right at travelReady can lose a race against the
  // server's own clock (e.g. client/server clock skew on the deployed VPS) and silently leave
  // the character stuck showing "W drodze" forever. Polling stops naturally once the server
  // actually resolves the arrival (isTraveling flips false) or the expedition is claimable.
  useEffect(() => {
    const needsTicking = (expedition && !isReadyToClaim) || isTraveling;
    if (!needsTicking) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expedition, isReadyToClaim, isTraveling]);

  useEffect(() => {
    if (!travelReady) return;
    queryClient.invalidateQueries({ queryKey: ["character", characterId] });
  }, [travelReady, now, queryClient, characterId]);

  const travelMutation = useMutation({
    mutationFn: (destinationZoneId: string | null) => startTravel(characterId, destinationZoneId),
    onSuccess: () => {
      setError(null);
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
  const currentZone = zones.find((z) => z.id === character.currentZoneId) ?? null;
  const townZone = zones.find((z) => z.isTown) ?? null;
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;
  const selectedEligible = selectedZone
    ? character.level >= selectedZone.minLevel && character.level <= selectedZone.maxLevel
    : false;

  const unlockedClassSkillIds = new Set(
    characterSkillsQuery.data?.filter((s) => s.unlocked).map((s) => s.classSkillId) ?? [],
  );
  const activeSkillsForCooldown = (classQuery.data?.skills ?? [])
    .filter((s) => s.kind === "active" && s.cooldownSeconds && unlockedClassSkillIds.has(s.id))
    .map((s) => ({ name: s.name, cooldownSeconds: s.cooldownSeconds! }));

  // Non-blocking — a flagged expedition withholds only its own reward, it never stops the
  // character from playing on (see docs/architecture.md).
  const flaggedCount = flaggedCountQuery.data?.count ?? 0;
  const flaggedBanner =
    flaggedCount > 0 ? (
      <p className="mb-3 rounded-md border border-gold/40 bg-gold/5 px-3 py-2 text-sm text-gold-bright">
        Masz {flaggedCount} {flaggedCount === 1 ? "ekspedycję oczekującą" : "ekspedycje oczekujące"} na
        sprawdzenie przez administrację — nagroda zostanie przyznana albo odrzucona po jej rozpatrzeniu.
      </p>
    ) : null;

  if (claimResult) {
    return (
      <PanelFrame title="Ekspedycja zakończona">
        {flaggedBanner}
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
        {claimResult.overflowLoot.length > 0 && (
          <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            <p className="font-medium">Ekwipunek był pełny — zgubiono część łupu:</p>
            <ul className="mt-1 space-y-1">
              {claimResult.overflowLoot.map((l) => (
                <li key={l.itemId} className="flex items-center gap-1.5">
                  <ItemTypeIcon type={itemFor(l.itemId)?.type ?? "material"} className="h-4 w-4 shrink-0" />
                  {itemNameFor(l.itemId)} ×{l.quantity}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={() => setClaimResult(null)}
          className="mt-3 rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright"
        >
          OK
        </button>
      </PanelFrame>
    );
  }

  if (expedition) {
    return (
      <PanelFrame title="Ekspedycja w toku">
        {flaggedBanner}
        <p className="mt-1 text-sm text-parchment-dim">Kraina: {zoneNameFor(expedition.zoneId)}</p>
        <ActivePotionsSummary characterId={characterId} />
        {isReadyToClaim ? (
          <button
            onClick={() => claimMutation.mutate(expedition.id)}
            disabled={claimMutation.isPending}
            className="mt-3 rounded-md border border-gold px-4 py-1.5 text-sm font-medium text-gold-bright hover:bg-gold/10 disabled:opacity-50"
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
                setConfirmingLeaveMessage(message);
              }}
              disabled={leaveMutation.isPending}
              className="mt-2 rounded-md border border-line-soft px-3 py-1.5 text-xs text-parchment-dim hover:bg-panel-raised disabled:opacity-50"
            >
              Opuść walkę (odbierz zdobyte)
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {error}
          </p>
        )}
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
      </PanelFrame>
    );
  }

  if (isTraveling) {
    return (
      <PanelFrame title="W drodze">
        {flaggedBanner}
        <p className="mt-1 text-sm text-parchment-dim">Cel: {zoneNameFor(character.travelDestinationZoneId)}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-parchment">
          {formatDuration((travelArrivesAtMs ?? now) - now)}
        </p>
      </PanelFrame>
    );
  }

  // Unified "planning" screen — replaces what used to be two separate layouts (a flat zone list
  // before the character had ever traveled anywhere, vs. a different layout with a collapsible
  // "other zones" list once standing somewhere) with one persistent map. `selectedZone` is
  // whatever's clicked on the map (for browsing zone info before committing), independent of
  // `currentZone` (where the character actually is, which gates the monster-picker/gathering).
  return (
    <PanelFrame title="Mapa ekspedycji" cornerStyle="ornate">
      {flaggedBanner}
      {durationQuery.data && (
        <p className="mt-1 text-xs text-parchment-faint">
          Walka trwa, aż postać zginie (max. {durationQuery.data.minutes} min — zabezpieczenie).
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <ZoneMapPath zones={zones} character={character} selectedZoneId={selectedZoneId} onSelect={setSelectedZoneId} />
          <ActivePotionsSummary characterId={characterId} />
          {currentZone && !currentZone.isTown && (
            <button
              onClick={() => townZone && travelMutation.mutate(townZone.id)}
              disabled={travelMutation.isPending || !townZone}
              title={townZone ? undefined : "Brak skonfigurowanego miasta"}
              className="mt-3 rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              Wróć do miasta
            </button>
          )}
          {currentZone && <GatheringPanel character={character} zone={currentZone} />}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        <div>
          {selectedZone && <ZoneInfoCard zone={selectedZone} eligible={selectedEligible} />}
          <div className={selectedZone ? "mt-4" : ""}>
            {!selectedZone ? (
              <p className="text-sm text-parchment-faint">Wybierz krainę na mapie.</p>
            ) : selectedZone.id !== character.currentZoneId ? (
              <button
                onClick={() => travelMutation.mutate(selectedZone.id)}
                disabled={!selectedEligible || travelMutation.isPending}
                className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-ink hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                Wyrusz do krainy
              </button>
            ) : selectedZone.isTown ? (
              <p className="text-sm text-parchment-faint">
                To miasto — zakupy u NPC znajdziesz w zakładce NPC w menu.
              </p>
            ) : selectedZone.monsters.length === 0 ? (
              <p className="text-sm text-parchment-faint">Ta kraina nie ma jeszcze potworów.</p>
            ) : (
              <MonsterAttackPanel
                zone={selectedZone}
                durationMinutes={durationQuery.data?.minutes ?? null}
                onConfirm={(selectedMonsterIds) => setTacticsMonsterIds(selectedMonsterIds)}
              />
            )}
          </div>
        </div>
      </div>

      {tacticsMonsterIds && currentZone && (
        <BattleTacticsModal
          activeSkills={(classQuery.data?.skills ?? []).filter(
            (s) => s.kind === "active" && unlockedClassSkillIds.has(s.id),
          )}
          onBack={() => setTacticsMonsterIds(null)}
          onConfirm={(tactics: BattleTacticsInput) =>
            startMutation.mutate({ zoneId: currentZone.id, selectedMonsterIds: tacticsMonsterIds, tactics })
          }
        />
      )}
    </PanelFrame>
  );
}
