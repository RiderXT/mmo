import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@mmo/shared";
import { ApiError } from "../../lib/apiClient";
import { listOpenLobbiesInZone, createLobby, joinLobby } from "../../lib/lobbiesApi";

const COMBAT_ROLE_LABELS = { dps: "DPS", lure: "Lure" } as const;

/** Alternative to solo "Ruszaj" (MonsterAttackPanel) shown alongside it when a character stands
 * in an eligible combat zone — lists other open (still-forming) lobbies in this same zone to join,
 * or lets the character start one. Reusing MonsterAttackPanel/BattleTacticsModal wasn't an option
 * here (those start the fight immediately); a lobby needs a waiting-room step first, so this only
 * gets the group as far as "in a lobby" — LiveLobbyCombatCard takes over from there once
 * character.activeLobbyId is set (mirrors how activeExpeditionId already takes over the tab). */
export function LobbyEntryPanel({ character, zoneId }: { character: Character; zoneId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const lobbiesQuery = useQuery({
    queryKey: ["open-lobbies", zoneId, character.id],
    queryFn: () => listOpenLobbiesInZone(zoneId, character.id),
    refetchInterval: 5000,
  });

  function onJoinedOrCreated() {
    setError(null);
    queryClient.invalidateQueries({ queryKey: ["character", character.id] });
    queryClient.invalidateQueries({ queryKey: ["active-lobby", character.id] });
  }

  const createMutation = useMutation({
    mutationFn: () => createLobby(character.id, zoneId),
    onSuccess: onJoinedOrCreated,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się stworzyć lobby"),
  });
  const joinMutation = useMutation({
    mutationFn: (lobbyId: string) => joinLobby(lobbyId, character.id),
    onSuccess: onJoinedOrCreated,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się dołączyć do lobby"),
  });

  const lobbies = lobbiesQuery.data ?? [];

  return (
    <div className="mt-3 border-t border-line-soft/40 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-parchment-dim">Wspólna walka (lobby, do 3 postaci)</p>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="rounded-md border border-gold px-3 py-1 text-xs font-medium text-gold-bright hover:bg-gold/10 disabled:opacity-50"
        >
          Stwórz lobby
        </button>
      </div>

      {lobbies.length === 0 ? (
        <p className="mt-1.5 text-xs text-parchment-faint">Nikt jeszcze nie tworzy tu lobby.</p>
      ) : (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {lobbies.map((lobby) => (
            <div
              key={lobby.id}
              className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-1.5 text-xs"
            >
              <span className="text-parchment-dim">
                {lobby.members.map((m) => `${m.name} (${COMBAT_ROLE_LABELS[m.combatRole]})`).join(", ")}
                <span className="ml-1 text-parchment-faint">
                  — {lobby.members.length}/{lobby.maxMembers}
                </span>
              </span>
              <button
                onClick={() => joinMutation.mutate(lobby.id)}
                disabled={joinMutation.isPending || lobby.members.length >= lobby.maxMembers}
                className="shrink-0 rounded-md border border-line-soft px-2.5 py-1 text-parchment-dim hover:bg-panel-raised disabled:cursor-not-allowed disabled:opacity-50"
              >
                Dołącz
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
