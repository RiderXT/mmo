import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@mmo/shared";
import { ApiError } from "../../lib/apiClient";
import { listPlayerZones } from "../../lib/zonesApi";
import { listPlayerItems } from "../../lib/itemsApi";
import type { ItemDto } from "../../lib/adminApi";
import { API_URL } from "../../lib/apiClient";
import {
  getActiveLobby,
  leaveLobby,
  kickLobbyMember,
  setLobbyReady,
  startLobbyExpedition,
  getLobbyExpedition,
  claimLobbyExpeditionReward,
  type LobbyClaimResult,
} from "../../lib/lobbiesApi";
import { MonsterAttackPanel } from "./MonsterAttackPanel";
import { LobbyCombatLog } from "./LobbyCombatLog";
import { ItemTypeIcon } from "../inventory/ItemTypeIcon";
import { ItemTooltip } from "../inventory/ItemTooltip";
import { ConfirmModal } from "../common/ConfirmModal";

const COMBAT_ROLE_LABELS = { dps: "DPS", lure: "Lure", support: "Support" } as const;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function LootIcon({ item, quantity }: { item: ItemDto | undefined; quantity: number }) {
  if (!item) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-line-soft bg-panel-raised">
        <ItemTypeIcon type="material" className="h-5 w-5 text-parchment-dim" />
      </div>
    );
  }
  return (
    <ItemTooltip name={item.name} upgradeLevel={0} type={item.type} minLevel={item.minLevel} className={null} stats={item.baseStats}>
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center border border-line-soft bg-panel-raised">
        {item.imageUrl ? (
          <img src={`${API_URL}${item.imageUrl}`} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          <ItemTypeIcon type={item.type} className="h-5 w-5 text-parchment-dim" />
        )}
        {quantity > 1 && <span className="absolute bottom-0 right-0.5 text-[10px] font-medium text-gold-bright">×{quantity}</span>}
      </div>
    </ItemTooltip>
  );
}

/** Takes over the whole World Map tab while character.activeLobbyId is set — mirrors how
 * LiveCombatCard takes over for a solo activeExpeditionId. Two phases: "forming" (waiting room —
 * member list, ready toggle, leader picks monsters and starts) and "in_progress" (the group fight,
 * already fully simulated server-side — this just reveals LobbyCombatLog progressively and lets
 * this character claim their own reward once the real-time countdown catches up). */
export function LiveLobbyCombatCard({ character, onUpdate }: { character: Character; onUpdate: () => void }) {
  const characterId = character.id;
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pendingMonsterIds, setPendingMonsterIds] = useState<string[] | null>(null);
  const [claimResult, setClaimResult] = useState<LobbyClaimResult | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const lobbyQuery = useQuery({ queryKey: ["active-lobby", characterId], queryFn: () => getActiveLobby(characterId) });
  const zonesQuery = useQuery({ queryKey: ["player-zones"], queryFn: listPlayerZones });
  const itemsQuery = useQuery({ queryKey: ["player-items"], queryFn: listPlayerItems });

  const lobby = lobbyQuery.data;
  const zone = zonesQuery.data?.find((z) => z.id === lobby?.zoneId);
  const itemFor = (itemId: string) => itemsQuery.data?.find((i) => i.id === itemId);
  const characterNameById = new Map((lobby?.members ?? []).map((m) => [m.characterId, m.name]));
  const me = lobby?.members.find((m) => m.characterId === characterId);
  const isLeader = lobby?.leaderCharacterId === characterId;

  const expeditionQuery = useQuery({
    queryKey: ["lobby-expedition", lobby?.activeLobbyExpeditionId, characterId],
    queryFn: () => getLobbyExpedition(lobby!.activeLobbyExpeditionId!, characterId),
    enabled: !!lobby?.activeLobbyExpeditionId,
  });
  const expedition = expeditionQuery.data;
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

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["active-lobby", characterId] });
    queryClient.invalidateQueries({ queryKey: ["character", characterId] });
  }

  const readyMutation = useMutation({
    mutationFn: (ready: boolean) => setLobbyReady(lobby!.id, characterId, ready),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["active-lobby", characterId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się zmienić statusu gotowości"),
  });
  const kickMutation = useMutation({
    mutationFn: (targetCharacterId: string) => kickLobbyMember(lobby!.id, characterId, targetCharacterId),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["active-lobby", characterId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się wyrzucić członka"),
  });
  const leaveMutation = useMutation({
    mutationFn: () => leaveLobby(lobby!.id, characterId),
    onSuccess: () => {
      setError(null);
      invalidateAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się opuścić lobby"),
  });
  const startMutation = useMutation({
    mutationFn: (selectedMonsterIds: string[]) => startLobbyExpedition(lobby!.id, characterId, selectedMonsterIds),
    onSuccess: () => {
      setError(null);
      setPendingMonsterIds(null);
      invalidateAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się rozpocząć walki"),
  });
  const claimMutation = useMutation({
    mutationFn: () => claimLobbyExpeditionReward(lobby!.activeLobbyExpeditionId!, characterId),
    onSuccess: (data) => {
      setError(null);
      setClaimResult(data);
      queryClient.invalidateQueries({ queryKey: ["inventory", characterId] });
      invalidateAll();
      onUpdate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się odebrać nagrody"),
  });

  if (claimResult) {
    return (
      <div>
        <p className="text-sm font-medium text-parchment">Walka lobby zakończona</p>
        <p className="mt-1 text-sm text-parchment-dim">
          Pokonano {claimResult.result.monstersDefeated} potworów · +{claimResult.result.expGained} exp · +
          {claimResult.result.goldGained} złota
        </p>
        {claimResult.leveledUp && (
          <p className="mt-1 text-sm font-medium text-gold-bright">Awans na poziom {claimResult.newLevel}!</p>
        )}
        {claimResult.result.loot.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {claimResult.result.loot.map((l) => (
              <LootIcon key={l.itemId} item={itemFor(l.itemId)} quantity={l.quantity} />
            ))}
          </div>
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

  if (!lobby) {
    return <p className="py-10 text-center text-sm text-parchment-dim">Wczytywanie lobby…</p>;
  }

  // Forming: waiting room — member list, ready toggle, leader picks monsters and starts.
  if (lobby.status === "forming") {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Lobby — formowanie</p>
        <p className="font-display text-lg font-semibold text-parchment">{zone?.name ?? lobby.zoneId}</p>

        <div className="mt-3 flex flex-col gap-1.5">
          {lobby.members.map((m) => (
            <div key={m.characterId} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
              <span className="text-parchment">
                {m.name} {m.isLeader && <span className="text-gold-bright">(lider)</span>}
                <span className="ml-1.5 text-xs text-parchment-faint">
                  poz. {m.level} · {m.className ?? "brak klasy"} · {COMBAT_ROLE_LABELS[m.combatRole]}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${m.ready ? "text-emerald-400" : "text-parchment-faint"}`}>
                  {m.ready ? "Gotowy" : "Nie gotowy"}
                </span>
                {isLeader && m.characterId !== characterId && (
                  <button
                    onClick={() => kickMutation.mutate(m.characterId)}
                    disabled={kickMutation.isPending}
                    className="text-xs text-red-400 hover:underline disabled:opacity-50"
                  >
                    Wyrzuć
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => readyMutation.mutate(!me?.ready)}
            disabled={readyMutation.isPending}
            className={`rounded-md border px-4 py-1.5 text-sm font-medium disabled:opacity-50 ${
              me?.ready ? "border-line-soft text-parchment-dim hover:bg-panel-raised" : "border-gold text-gold-bright hover:bg-gold/10"
            }`}
          >
            {me?.ready ? "Cofnij gotowość" : "Jestem gotowy"}
          </button>
          <button
            onClick={() => setConfirmingLeave(true)}
            className="rounded-md border border-line-soft px-4 py-1.5 text-sm text-parchment-dim hover:bg-panel-raised"
          >
            Wyjdź z lobby
          </button>
        </div>

        {isLeader && (
          <div className="mt-4 border-t border-line-soft/40 pt-3">
            {lobby.members.length < 2 ? (
              <p className="text-xs text-parchment-faint">Potrzeba co najmniej 2 postaci, żeby rozpocząć walkę.</p>
            ) : !lobby.members.every((m) => m.ready) ? (
              <p className="text-xs text-parchment-faint">Czekaj, aż wszyscy członkowie będą gotowi.</p>
            ) : zone && zone.monsters.length > 0 ? (
              <MonsterAttackPanel
                zone={zone}
                durationMinutes={null}
                confirmLabel="Rozpocznij walkę lobby"
                onConfirm={(ids) => startMutation.mutate(ids)}
              />
            ) : (
              <p className="text-xs text-parchment-faint">Ta kraina nie ma jeszcze potworów.</p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {confirmingLeave && (
          <ConfirmModal
            title="Wyjść z lobby?"
            message="Opuścisz grupę. Jeśli jesteś liderem, przywództwo przejmie kolejna dołączona postać."
            danger
            onCancel={() => setConfirmingLeave(false)}
            onConfirm={() => {
              setConfirmingLeave(false);
              leaveMutation.mutate();
            }}
          />
        )}
      </div>
    );
  }

  // in_progress / completed: the fight itself, revealed progressively like solo combat.
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Walka lobby</p>
          <p className="font-display text-lg font-semibold text-parchment">{zone?.name ?? lobby.zoneId}</p>
          {expedition && (
            <p className="text-xs text-parchment-faint">Bonus za skład grupy: +{Math.round(expedition.classCompositionBonusPct * 100)}%</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Czas</p>
          {isReadyToClaim ? (
            <p className="font-display text-lg text-gold-bright">Gotowe</p>
          ) : (
            <p className="font-display text-lg tabular-nums text-parchment">{formatDuration((endsAtMs ?? now) - now)}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {lobby.members.map((m) => (
          <span key={m.characterId} className="rounded-full border border-line-soft px-2.5 py-1 text-xs text-parchment-dim">
            {m.name} <span className="text-parchment-faint">({COMBAT_ROLE_LABELS[m.combatRole]})</span>
          </span>
        ))}
      </div>

      {expedition && <LobbyCombatLog events={revealedEvents} characterNameById={characterNameById} viewingCharacterId={characterId} />}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="mt-3">
        {isReadyToClaim ? (
          expedition?.myResultStatus === "claimed" ? (
            <p className="text-sm text-parchment-faint">Nagroda już odebrana.</p>
          ) : expedition?.myResultStatus === "flagged" ? (
            <p className="text-sm text-gold-bright">
              Nagroda wstrzymana do sprawdzenia przez administrację (kod: SUSPICIOUS_REWARD).
            </p>
          ) : (
            <button
              onClick={() => claimMutation.mutate()}
              disabled={claimMutation.isPending}
              className="rounded-md border border-gold px-4 py-1.5 text-sm font-medium text-gold-bright hover:bg-gold/10 disabled:opacity-50"
            >
              Odbierz nagrodę
            </button>
          )
        ) : (
          <p className="text-xs text-parchment-faint">Walka trwa — nagrodę odbierzesz po jej zakończeniu.</p>
        )}
      </div>
    </div>
  );
}
