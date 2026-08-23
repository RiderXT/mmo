import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { PanelFrame } from "../components/common/PanelFrame";
import { ConfirmModal } from "../components/common/ConfirmModal";
import { ApiError } from "../lib/apiClient";
import {
  listFriends,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  type FriendEntryDto,
} from "../lib/friendsApi";

/** Avatar swatch with an online/offline status dot — same "no artwork yet" placeholder spirit
 * (first letter on a flat panel-raised square) as CharactersPage's roster avatars, so the two
 * player-list surfaces read as the same visual system. */
function FriendAvatar({ label, online }: { label: string; online: boolean }) {
  return (
    <div className="relative h-12 w-12 shrink-0">
      <div className="flex h-full w-full items-center justify-center border border-line-soft bg-panel-raised">
        <span className="font-display text-lg text-parchment-faint">{label.slice(0, 1).toUpperCase()}</span>
      </div>
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-panel ${
          online ? "bg-rarity-uncommon" : "bg-parchment-faint/50"
        }`}
      />
    </div>
  );
}

function statusText(f: FriendEntryDto): string {
  if (!f.characterName) return "Brak postaci";
  const classPart = f.className ? ` · ${f.className}` : "";
  const levelPart = f.characterLevel != null ? ` lvl. ${f.characterLevel}` : "";
  return `${f.online ? "Online" : "Offline"}${classPart}${levelPart}`;
}

export function FriendsPage() {
  const queryClient = useQueryClient();
  const [targetName, setTargetName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<{ userId: string; characterName: string | null } | null>(
    null,
  );

  const friendsQuery = useQuery({ queryKey: ["friends"], queryFn: listFriends });
  const friends = friendsQuery.data;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["friends"] });
  }

  const sendMutation = useMutation({
    mutationFn: () => sendFriendRequest({ targetCharacterName: targetName.trim() }),
    onSuccess: (result) => {
      setError(null);
      setMessage(result.status === "accepted" ? "Mieliście już wzajemne zaproszenie — jesteście znajomymi!" : "Zaproszenie wysłane.");
      setTargetName("");
      invalidate();
      setTimeout(() => setMessage(null), 4000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Nie udało się wysłać zaproszenia"),
  });

  const acceptMutation = useMutation({ mutationFn: acceptFriendRequest, onSuccess: invalidate });
  const declineMutation = useMutation({ mutationFn: declineFriendRequest, onSuccess: invalidate });
  const cancelMutation = useMutation({ mutationFn: cancelFriendRequest, onSuccess: invalidate });
  const removeMutation = useMutation({ mutationFn: removeFriend, onSuccess: invalidate });

  const onlineCount = friends?.friends.filter((f) => f.online).length ?? 0;

  return (
    <AppShell>
      <div className="mb-6">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold">Towarzysze</p>
        <h1 className="font-display text-3xl font-semibold text-parchment">Znajomi</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        {/* LEFT — friends roster */}
        <PanelFrame
          title="Lista znajomych"
          headerRight={
            <span className="text-xs normal-case tracking-normal text-parchment-dim">
              <span className="text-gold-bright">{onlineCount}</span> online
            </span>
          }
        >
          {!friends || friends.friends.length === 0 ? (
            <p className="text-sm text-parchment-faint">Nie masz jeszcze żadnych znajomych.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {friends.friends.map((f) => (
                <div
                  key={f.userId}
                  className="flex flex-wrap items-center gap-3 border border-line-soft bg-ink/40 p-3"
                >
                  <FriendAvatar label={f.characterName ?? "?"} online={f.online} />
                  <div className="min-w-0 flex-1">
                    {f.characterId && f.characterName ? (
                      <Link
                        to={`/profile/${encodeURIComponent(f.characterName)}`}
                        className="font-display text-sm text-parchment hover:text-gold-bright"
                      >
                        {f.characterName}
                      </Link>
                    ) : (
                      <p className="font-display text-sm text-parchment-faint">(brak postaci)</p>
                    )}
                    <p className="text-xs text-parchment-faint">{statusText(f)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {f.characterName && (
                      <Link
                        to={`/mail?to=${encodeURIComponent(f.characterName)}`}
                        className="border border-line-soft px-3 py-1.5 font-display text-[11px] uppercase tracking-widest text-gold-bright transition hover:border-gold"
                      >
                        Wiadomość
                      </Link>
                    )}
                    <button
                      onClick={() => setConfirmingRemove({ userId: f.userId, characterName: f.characterName })}
                      className="border border-line-soft px-3 py-1.5 font-display text-[11px] uppercase tracking-widest text-parchment-faint transition hover:border-red-400/60 hover:text-red-400"
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelFrame>

        {/* RIGHT — pending requests + add friend */}
        <div className="flex flex-col gap-4">
          {friends && friends.incoming.length > 0 && (
            <PanelFrame title="Przychodzące zaproszenia">
              <div className="flex flex-col gap-2">
                {friends.incoming.map((r) => (
                  <div key={r.friendRequestId} className="flex items-center gap-3 border border-line-soft bg-ink/40 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm text-parchment">{r.characterName ?? "(brak postaci)"}</p>
                    </div>
                    <button
                      onClick={() => acceptMutation.mutate(r.friendRequestId)}
                      className="bg-gold px-3 py-1 font-display text-[11px] uppercase tracking-widest text-ink hover:bg-gold-bright"
                    >
                      Akceptuj
                    </button>
                    <button
                      onClick={() => declineMutation.mutate(r.friendRequestId)}
                      className="border border-line-soft px-3 py-1 font-display text-[11px] uppercase tracking-widest text-parchment-faint hover:text-parchment"
                    >
                      Odrzuć
                    </button>
                  </div>
                ))}
              </div>
            </PanelFrame>
          )}

          <PanelFrame title="Wysłane zaproszenia">
            {!friends || friends.outgoing.length === 0 ? (
              <p className="text-sm text-parchment-faint">Brak oczekujących zaproszeń.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {friends.outgoing.map((r) => (
                  <div key={r.friendRequestId} className="flex items-center gap-3 border border-line-soft bg-ink/40 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm text-parchment">{r.characterName ?? "(brak postaci)"}</p>
                      <p className="text-xs text-parchment-faint">Oczekuje</p>
                    </div>
                    <button
                      onClick={() => cancelMutation.mutate(r.friendRequestId)}
                      className="shrink-0 border border-line-soft px-3 py-1 font-display text-[11px] uppercase tracking-widest text-parchment-faint hover:border-red-400/60 hover:text-red-400"
                    >
                      Cofnij
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (targetName.trim()) sendMutation.mutate();
              }}
              className="mt-4 flex gap-2 border-t border-line-soft pt-4"
            >
              <input
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="Nazwa postaci..."
                className="min-w-0 flex-1 border border-line-soft bg-ink px-3 py-2 text-sm text-parchment outline-none focus:border-gold"
              />
              <button
                type="submit"
                disabled={sendMutation.isPending || !targetName.trim()}
                className="shrink-0 bg-gold px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest text-ink transition hover:bg-gold-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                Dodaj
              </button>
            </form>
            {message && (
              <p role="status" className="mt-2 text-sm text-rarity-uncommon">
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-400">
                {error}
              </p>
            )}
          </PanelFrame>
        </div>
      </div>

      {confirmingRemove && (
        <ConfirmModal
          title="Usunąć znajomego?"
          message={`Usunąć "${confirmingRemove.characterName}" ze znajomych?`}
          danger
          onCancel={() => setConfirmingRemove(null)}
          onConfirm={() => {
            removeMutation.mutate(confirmingRemove.userId);
            setConfirmingRemove(null);
          }}
        />
      )}
    </AppShell>
  );
}
