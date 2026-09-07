import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Character } from "@mmo/shared";
import { ApiError } from "../../lib/apiClient";
import { listOpenLobbiesInZone, createLobby, joinLobby } from "../../lib/lobbiesApi";
import { PanelFrame } from "../common/PanelFrame";
import { useEscapeKey } from "../../hooks/useEscapeKey";

/** "DOSTĘPNE LOBBY" popup from the mockup — lists open (still-forming) lobbies in the character's
 * current zone, each showing every member's name and class ("profesja"), triggered by the compact
 * Lobby button in WorldMapTab instead of the old always-visible inline list. Joining/creating closes
 * this popup; LiveLobbyCombatCard's own "Członkowie" popup takes over once character.activeLobbyId
 * is set (mirrors how BattleTacticsModal hands off to LiveCombatCard for solo combat). */
export function LobbyBrowserModal({
  character,
  zoneId,
  onClose,
  onJoined,
}: {
  character: Character;
  zoneId: string;
  onClose: () => void;
  onJoined: () => void;
}) {
  useEscapeKey(onClose);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const lobbiesQuery = useQuery({
    queryKey: ["open-lobbies", zoneId, character.id],
    queryFn: () => listOpenLobbiesInZone(zoneId, character.id),
    refetchInterval: 4000,
  });

  function handleSuccess() {
    setError(null);
    queryClient.invalidateQueries({ queryKey: ["character", character.id] });
    queryClient.invalidateQueries({ queryKey: ["active-lobby", character.id] });
    onJoined();
  }
  const createMutation = useMutation({
    mutationFn: () => createLobby(character.id, zoneId),
    onSuccess: handleSuccess,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się stworzyć lobby"),
  });
  const joinMutation = useMutation({
    mutationFn: (lobbyId: string) => joinLobby(lobbyId, character.id),
    onSuccess: handleSuccess,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się dołączyć do lobby"),
  });

  const lobbies = lobbiesQuery.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <PanelFrame
          title="Dostępne lobby"
          headerRight={
            <button onClick={onClose} className="text-parchment-faint hover:text-parchment" aria-label="Zamknij">
              ✕
            </button>
          }
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-parchment-faint">Wspólna walka — do 3 postaci naraz w tej krainie.</p>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="shrink-0 rounded-md border border-gold px-3 py-1.5 text-xs font-medium text-gold-bright hover:bg-gold/10 disabled:opacity-50"
            >
              + Stwórz lobby
            </button>
          </div>

          <div className="mt-3 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
            {lobbiesQuery.isLoading ? (
              <p className="py-6 text-center text-xs text-parchment-faint">Wczytywanie…</p>
            ) : lobbies.length === 0 ? (
              <p className="py-6 text-center text-xs text-parchment-faint">Nikt jeszcze nie tworzy tu lobby.</p>
            ) : (
              lobbies.map((lobby) => (
                <div key={lobby.id} className="flex items-center gap-3 border border-line-soft bg-panel-raised px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-parchment">
                      {lobby.members.map((m) => `${m.name} — ${m.className ?? "brak klasy"}`).join(" · ")}
                    </p>
                    <p className="mt-0.5 text-[11px] text-parchment-faint">
                      Lider: {lobby.members.find((m) => m.isLeader)?.name ?? "?"} · {lobby.members.length}/
                      {lobby.maxMembers} miejsc
                    </p>
                  </div>
                  <button
                    onClick={() => joinMutation.mutate(lobby.id)}
                    disabled={joinMutation.isPending || lobby.members.length >= lobby.maxMembers}
                    className="shrink-0 rounded-md border border-gold/60 px-3 py-1.5 text-xs font-medium text-gold-bright hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Dołącz
                  </button>
                </div>
              ))
            )}
          </div>

          {error && (
            <p role="alert" className="mt-2 text-xs text-red-400">
              {error}
            </p>
          )}
        </PanelFrame>
      </div>
    </div>
  );
}
